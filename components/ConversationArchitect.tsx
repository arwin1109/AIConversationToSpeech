/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Send, Sparkles, Loader2, PlayCircle, RotateCcw, User, Bot, Check, ChevronRight, ChevronDown } from 'lucide-react';
import { DialogueLine } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationArchitectProps {
  onPushToPreview: (transcript: DialogueLine[]) => void;
  onClose: () => void;
}

const SYSTEM_PROMPT = `
You are a Conversation Architect. Your job is to take unstructured text, meeting notes, scenarios, or descriptions and turn them into a structured "Dialogue Script" for audio generation.

RULES:
1. Output the final script in a valid JSON format wrapped in a code block.
2. The JSON should be an array of objects: { "speaker": "Name", "text": "Dialogue" }.
3. Use a maximum of 3 speakers for clarity. Pick names like "Rahul", "Ankit", "Meera" or other short professional names.
4. Keep the dialogue natural, professional, and engaging.
5. If the user asks for revisions, update the script accordingly.
6. Before providing the script, briefly explain your rationale.

Example Output format:
\`\`\`json
[
  { "speaker": "Rahul", "text": "Hello world." },
  { "speaker": "Meera", "text": "Hi Rahul, how are you?" }
]
\`\`\`
`;

const MODELS = [
  { id: "gemini-2.0-pro-exp-02-05", name: "Gemini 2 Pro Latest" },
  { id: "gemini-2.0-flash", name: "Gemini 2 Flash Latest" },
  { id: "gemini-2.0-flash-lite-preview-02-05", name: "Gemini 2 Flash Lite Latest" },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Latest" },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3 Pro Latest" },
  { id: "gemini-3-flash-lite-preview", name: "Gemini 3 Flash Lite Latest" },
];

const ConversationArchitect: React.FC<ConversationArchitectProps> = ({ onPushToPreview, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your Conversation Architect. Send me meeting notes, a scenario, or just a rough idea, and I'll build a structured dialogue script for you." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [currentScript, setCurrentScript] = useState<DialogueLine[] | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle click outside for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedModelName = MODELS.find(m => m.id === selectedModel)?.name || "Select Model";

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY || '';
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: selectedModel,
        systemInstruction: SYSTEM_PROMPT
      });

      const chat = model.startChat({
        history: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
      });

      const result = await chat.sendMessage(input);
      const response = await result.response;
      const text = response.text();

      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      
      // Try to extract JSON
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const script = JSON.parse(jsonMatch[1]);
          if (Array.isArray(script)) {
            setCurrentScript(script);
          }
        } catch (e) {
          console.error("Failed to parse script JSON", e);
        }
      }

    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error. Please check your connection or API key." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 overflow-hidden shadow-2xl relative">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold font-display text-zinc-900 dark:text-white leading-tight">Conversation Architect</h2>
            <div className="flex items-center gap-2">
               <span className="flex h-1.5 w-1.5 rounded-full bg-green-500"></span>
               <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">AI Powered Scripting</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
            {/* Model Selector Dropdown */}
            <div className="relative" ref={dropdownRef}>
                <button 
                  onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                  className="flex items-center justify-between gap-3 px-4 py-2 min-w-[240px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:border-indigo-500/50 transition-all shadow-sm group"
                >
                  <span className="truncate">{selectedModelName}</span>
                  <ChevronDown size={16} className={`text-zinc-400 group-hover:text-indigo-500 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isModelMenuOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 top-full mt-2 w-[280px] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl shadow-2xl z-[100] overflow-hidden"
                    >
                      <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-2">Select model for chat</span>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto custom-scrollbar py-2">
                        {MODELS.map((model) => (
                          <button 
                            key={model.id}
                            onClick={() => {
                              setSelectedModel(model.id);
                              setIsModelMenuOpen(false);
                            }}
                            className={`w-full text-left px-4 py-3 text-sm transition-colors flex flex-col gap-0.5 ${
                              selectedModel === model.id 
                              ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold' 
                              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <span>{model.name}</span>
                            {selectedModel === model.id && (
                              <span className="text-[10px] opacity-70 font-normal">Active model for processing</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
            </div>

            <button 
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            >
                <RotateCcw size={18} />
            </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 custom-scrollbar bg-gradient-to-b from-transparent to-zinc-50/30 dark:to-zinc-900/10">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-1">
                  <Bot size={16} />
                </div>
              )}
              <div className={`max-w-[85%] sm:max-w-[70%] p-4 rounded-2xl text-sm leading-relaxed ${
                m.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-600/10' 
                : 'bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-tl-none shadow-sm'
              }`}>
                {m.content.split('\n').map((line, idx) => (
                  <p key={idx} className={idx > 0 ? 'mt-2' : ''}>
                    {line.startsWith('```') ? null : line}
                  </p>
                ))}
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 flex-shrink-0 mt-1">
                  <User size={16} />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-4 justify-start"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 animate-pulse">
              <Bot size={16} />
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-indigo-500" />
              <span className="text-xs font-medium text-zinc-400 italic">Gemini is thinking...</span>
            </div>
          </motion.div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Script Summary Card (Floating when ready) */}
      <AnimatePresence>
        {currentScript && !isLoading && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute bottom-28 left-4 right-4 sm:left-auto sm:right-8 sm:w-80 bg-white dark:bg-zinc-900 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl shadow-2xl z-30 overflow-hidden ring-4 ring-indigo-500/5"
          >
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-900/30">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check size={16} className="text-green-500" />
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-tighter">Script Ready</span>
                  </div>
                  <span className="text-[10px] font-medium text-zinc-500">{currentScript.length} lines</span>
               </div>
            </div>
            <div className="p-4">
               <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                 I've generated a {currentScript.length}-line script based on our discussion. You can preview it in the Audio Player.
               </p>
               <button 
                  onClick={() => onPushToPreview(currentScript)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all active:scale-95 group shadow-lg shadow-indigo-600/20"
               >
                  <PlayCircle size={18} />
                  <span>Push to Preview</span>
                  <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <div className="p-4 sm:p-6 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800">
        <div className="max-w-3xl mx-auto relative">
          <textarea 
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Paste raw notes or describe a scenario..."
            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl py-4 pl-5 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all dark:text-white"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={`absolute right-2 top-2 p-2.5 rounded-xl transition-all ${
              !input.trim() || isLoading 
              ? 'text-zinc-400' 
              : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:scale-110 active:scale-95'
            }`}
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <p className="text-center text-[10px] text-zinc-400 mt-4 font-medium uppercase tracking-widest">
          The architect creates the script • Gemini processes the logic
        </p>
      </div>
    </div>
  );
};

export default ConversationArchitect;
