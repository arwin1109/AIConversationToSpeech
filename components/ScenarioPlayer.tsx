/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Play, Square, Loader2, Volume2, AlertCircle, X, ChevronRight, User, Terminal, Database, Activity, Download, Cloud, CloudUpload, LogOut } from 'lucide-react';
import { Voice } from '../types';
import AudioVisualizer from './AudioVisualizer';
import { motion, AnimatePresence } from 'framer-motion';

interface DialogueLine {
  speaker: 'Rahul' | 'Ankit' | 'Meera';
  text: string;
}

const TRANSCRIPT: DialogueLine[] = [
  { speaker: 'Rahul', text: "Hey guys, thanks for joining quickly. We’ve got multiple production complaints from providers since morning. The support team says users are submitting prior auth requests, but either the patient details disappear after loading, or the submission spinner keeps running and eventually shows a generic error." },
  { speaker: 'Rahul', text: "I checked Datadog briefly — error volume started increasing around 8:40 AM IST. We need to understand whether this is frontend rendering, API latency, or downstream dependency failure. Ankit, can you start with what you observed from the UI side?" },
  { speaker: 'Ankit', text: "Yeah. I reproduced it twice in prod and once in staging after pointing to prod APIs. What I noticed is: Initial page load works, Eligibility verification succeeds, But during “Review & Submit,” the patient demographics section sometimes becomes blank. In browser console I saw: Cannot read properties of undefined (reading 'memberId'). That error is coming from the React component rendering the summary card." },
  { speaker: 'Rahul', text: "Is it failing consistently for same records?" },
  { speaker: 'Ankit', text: "No, that’s the weird part. For some payloads it works fine. For failed ones: API response itself looks incomplete, patientInfo object is missing entirely in some responses. Initially I thought frontend mapping issue, but network tab actually shows partial response payload." },
  { speaker: 'Rahul', text: "Okay, so frontend crash may just be secondary. Meera, anything suspicious on backend deployments today?" },
  { speaker: 'Meera', text: "We had a deployment yesterday night around 11 PM. Mostly harmless changes: added encryption flag, optimized caching for member lookup, introduced fallback mapping for external payer response. But now that Ankit says partial payloads, I suspect the mapper layer. I checked Kibana earlier. There are null pointer exceptions in PatientAggregationService." },
  { speaker: 'Rahul', text: "What exactly is null there?" },
  { speaker: 'Meera', text: "Looks like: patientData.getSubscriber().getMemberId(). But in some requests, subscriber itself is null. Normally fallback logic should populate it from eligibility response." },
  { speaker: 'Ankit', text: "Wait, that aligns with frontend issue. Because UI expects: patientInfo.subscriber.memberId. If backend omits subscriber, React blows up." },
  { speaker: 'Rahul', text: "Question is why subscriber becomes null only sometimes. Any dependency timing issue?" },
  { speaker: 'Meera', text: "Possibly. We recently parallelized: eligibility fetch, patient demographics fetch, and payer metadata fetch using async futures. I think there may be a race condition where eligibility future times out, but mapper still proceeds with partial aggregation." },
  { speaker: 'Rahul', text: "What timeout threshold?" },
  { speaker: 'Meera', text: "Three seconds." },
  { speaker: 'Rahul', text: "That’s aggressive for production. What’s downstream response time today?" },
  { speaker: 'Meera', text: "Checking… Yeah, payer gateway latency spiked. Average around 4.8 seconds since morning." },
  { speaker: 'Rahul', text: "There we go. So backend times out eligibility enrichment, returns partial payload, frontend assumes full object exists and crashes. Two issues: One, Backend shouldn’t return structurally incomplete response. Two, Frontend shouldn’t hard crash on missing fields." },
  { speaker: 'Ankit', text: "Agreed. Frontend currently assumes API contract is stable. We don’t do optional chaining everywhere because historically backend always returned normalized payloads." },
  { speaker: 'Rahul', text: "Still, defensive rendering is needed for prod-grade apps. Even if backend fails partially, UI should degrade gracefully." },
  { speaker: 'Meera', text: "Another thing. I found this log: Fallback mapper executed with eligibilityData = null. But after that we still return HTTP 200. That’s probably wrong." },
  { speaker: 'Rahul', text: "Yeah, returning success with incomplete business object is dangerous. Do providers actually submit broken authorizations because of this?" },
  { speaker: 'Ankit', text: "Some submissions fail completely. But I think worse issue is silent corruption. One test request showed: diagnosis loaded, medication loaded, but patient DOB missing. UI still allowed submission." },
  { speaker: 'Rahul', text: "That’s bad. Potential compliance issue too. We need immediate containment. Meera, can we hotfix backend to fail request cleanly or return explicit validation error instead of partial success?" },
  { speaker: 'Meera', text: "Yes. Fastest fix: if eligibility aggregation fails, return 503 TEMPORARY_DATA_UNAVAILABLE, include retry message. That avoids corrupt payloads. Longer-term we should redesign aggregation handling." },
  { speaker: 'Rahul', text: "Good. How long for hotfix?" },
  { speaker: 'Meera', text: "Maybe 45 minutes coding plus testing. Deployment another 20." },
  { speaker: 'Rahul', text: "Okay. Ankit, frontend side?" },
  { speaker: 'Ankit', text: "I can patch summary components to safely handle nulls. Things I’ll add: optional chaining, fallback labels like “Data unavailable”, block final submission if required patient fields missing. Also I want to add centralized schema validation before render." },
  { speaker: 'Rahul', text: "Makes sense. Can we also surface meaningful toast messages instead of generic spinner timeout?" },
  { speaker: 'Ankit', text: "Yeah. Currently API failures fall into generic Axios interceptor. I can add specific handling for 503 TEMPORARY_DATA_UNAVAILABLE and show: “Patient eligibility data is temporarily unavailable. Please retry in a few minutes.”" },
  { speaker: 'Rahul', text: "Perfect. Any infra concerns? CPU? Memory? DB saturation?" },
  { speaker: 'Meera', text: "No major infra bottlenecks. Pods are healthy. This looks application-layer plus downstream latency." },
  { speaker: 'Rahul', text: "Did payer API vendor report incident?" },
  { speaker: 'Meera', text: "Not yet, but response times clearly degraded. I’ll raise support ticket with them after this call." },
  { speaker: 'Rahul', text: "Good. Another thing: Why didn’t monitoring catch this earlier? We should’ve alerted on partial aggregation spikes." },
  { speaker: 'Meera', text: "We only monitor HTTP failure percentage. Since backend returned 200, alerts never triggered." },
  { speaker: 'Rahul', text: "Classic issue. Need business-level observability, not just transport-level. Add metric for: incomplete payload generation, fallback execution count, eligibility timeout count." },
  { speaker: 'Meera', text: "Agreed. I can add Micrometer counters." },
  { speaker: 'Ankit', text: "Can frontend also log schema violations to Datadog RUM? That might help correlate UI failures faster." },
  { speaker: 'Rahul', text: "Yes, good idea. Let’s do both sides. Also: No more silent fallback logic without visibility. If fallback executes, we should know immediately." },
  { speaker: 'Meera', text: "Understood. One concern though: If we start failing requests instead of partial returning, providers may see more retries today." },
  { speaker: 'Rahul', text: "That’s acceptable. Fail-fast is safer than bad medical data. Data integrity first." },
  { speaker: 'Ankit', text: "Agreed." },
  { speaker: 'Rahul', text: "Alright, let’s summarize action items. Backend Tasks: Meera, add guard clause, return 503, increase timeout to 8s, add metrics, and raise vendor ticket. Frontend Tasks: Ankit, add defensive rendering, prevent invalid submission, add 503 handling, improve loading UX, and add RUM logging. I’ll coordinate support and monitor deployment. Let’s stay active on Teams. Anything else?" },
  { speaker: 'Meera', text: "Nothing from me." },
  { speaker: 'Ankit', text: "All good." },
  { speaker: 'Rahul', text: "Alright, thanks guys. Let’s fix this quickly." }
];

interface ScenarioPlayerProps {
  voices: Voice[];
  onClose: () => void;
  transcript?: DialogueLine[];
  title?: string;
}

const DEFAULT_TRANSCRIPT: DialogueLine[] = [
  { speaker: 'Rahul', text: "Hey guys, thanks for joining quickly. We’ve got multiple production complaints from providers since morning. The support team says users are submitting prior auth requests, but either the patient details disappear after loading, or the submission spinner keeps running and eventually shows a generic error." },
  { speaker: 'Rahul', text: "I checked Datadog briefly — error volume started increasing around 8:40 AM IST. We need to understand whether this is frontend rendering, API latency, or downstream dependency failure. Ankit, can you start with what you observed from the UI side?" },
  { speaker: 'Ankit', text: "Yeah. I reproduced it twice in prod and once in staging after pointing to prod APIs. What I noticed is: Initial page load works, Eligibility verification succeeds, But during “Review & Submit,” the patient demographics section sometimes becomes blank. In browser console I saw: Cannot read properties of undefined (reading 'memberId'). That error is coming from the React component rendering the summary card." },
  { speaker: 'Rahul', text: "Is it failing consistently for same records?" },
  { speaker: 'Ankit', text: "No, that’s the weird part. For some payloads it works fine. For failed ones: API response itself looks incomplete, patientInfo object is missing entirely in some responses. Initially I thought frontend mapping issue, but network tab actually shows partial response payload." },
  { speaker: 'Rahul', text: "Okay, so frontend crash may just be secondary. Meera, anything suspicious on backend deployments today?" },
  { speaker: 'Meera', text: "We had a deployment yesterday night around 11 PM. Mostly harmless changes: added encryption flag, optimized caching for member lookup, introduced fallback mapping for external payer response. But now that Ankit says partial payloads, I suspect the mapper layer. I checked Kibana earlier. There are null pointer exceptions in PatientAggregationService." },
  { speaker: 'Rahul', text: "What exactly is null there?" },
  { speaker: 'Meera', text: "Looks like: patientData.getSubscriber().getMemberId(). But in some requests, subscriber itself is null. Normally fallback logic should populate it from eligibility response." },
  { speaker: 'Ankit', text: "Wait, that aligns with frontend issue. Because UI expects: patientInfo.subscriber.memberId. If backend omits subscriber, React blows up." },
  { speaker: 'Rahul', text: "Question is why subscriber becomes null only sometimes. Any dependency timing issue?" },
  { speaker: 'Meera', text: "Possibly. We recently parallelized: eligibility fetch, patient demographics fetch, and payer metadata fetch using async futures. I think there may be a race condition where eligibility future times out, but mapper still proceeds with partial aggregation." },
  { speaker: 'Rahul', text: "What timeout threshold?" },
  { speaker: 'Meera', text: "Three seconds." },
  { speaker: 'Rahul', text: "That’s aggressive for production. What’s downstream response time today?" },
  { speaker: 'Meera', text: "Checking… Yeah, payer gateway latency spiked. Average around 4.8 seconds since morning." },
  { speaker: 'Rahul', text: "There we go. So backend times out eligibility enrichment, returns partial payload, frontend assumes full object exists and crashes. Two issues: One, Backend shouldn’t return structurally incomplete response. Two, Frontend shouldn’t hard crash on missing fields." },
  { speaker: 'Ankit', text: "Agreed. Frontend currently assumes API contract is stable. We don’t do optional chaining everywhere because historically backend always returned normalized payloads." },
  { speaker: 'Rahul', text: "Still, defensive rendering is needed for prod-grade apps. Even if backend fails partially, UI should degrade gracefully." },
  { speaker: 'Meera', text: "Another thing. I found this log: Fallback mapper executed with eligibilityData = null. But after that we still return HTTP 200. That’s probably wrong." },
  { speaker: 'Rahul', text: "Yeah, returning success with incomplete business object is dangerous. Do providers actually submit broken authorizations because of this?" },
  { speaker: 'Ankit', text: "Some submissions fail completely. But I think worse issue is silent corruption. One test request showed: diagnosis loaded, medication loaded, but patient DOB missing. UI still allowed submission." },
  { speaker: 'Rahul', text: "That’s bad. Potential compliance issue too. We need immediate containment. Meera, can we hotfix backend to fail request cleanly or return explicit validation error instead of partial success?" },
  { speaker: 'Meera', text: "Yes. Fastest fix: if eligibility aggregation fails, return 503 TEMPORARY_DATA_UNAVAILABLE, include retry message. That avoids corrupt payloads. Longer-term we should redesign aggregation handling." },
  { speaker: 'Rahul', text: "Good. How long for hotfix?" },
  { speaker: 'Meera', text: "Maybe 45 minutes coding plus testing. Deployment another 20." },
  { speaker: 'Rahul', text: "Okay. Ankit, frontend side?" },
  { speaker: 'Ankit', text: "I can patch summary components to safely handle nulls. Things I’ll add: optional chaining, fallback labels like “Data unavailable”, block final submission if required patient fields missing. Also I want to add centralized schema validation before render." },
  { speaker: 'Rahul', text: "Makes sense. Can we also surface meaningful toast messages instead of generic spinner timeout?" },
  { speaker: 'Ankit', text: "Yeah. Currently API failures fall into generic Axios interceptor. I can add specific handling for 503 TEMPORARY_DATA_UNAVAILABLE and show: “Patient eligibility data is temporarily unavailable. Please retry in a few minutes.”" },
  { speaker: 'Rahul', text: "Perfect. Any infra concerns? CPU? Memory? DB saturation?" },
  { speaker: 'Meera', text: "No major infra bottlenecks. Pods are healthy. This looks application-layer plus downstream latency." },
  { speaker: 'Rahul', text: "Did payer API vendor report incident?" },
  { speaker: 'Meera', text: "Not yet, but response times clearly degraded. I’ll raise support ticket with them after this call." },
  { speaker: 'Rahul', text: "Good. Another thing: Why didn’t monitoring catch this earlier? We should’ve alerted on partial aggregation spikes." },
  { speaker: 'Meera', text: "We only monitor HTTP failure percentage. Since backend returned 200, alerts never triggered." },
  { speaker: 'Rahul', text: "Classic issue. Need business-level observability, not just transport-level. Add metric for: incomplete payload generation, fallback execution count, eligibility timeout count." },
  { speaker: 'Meera', text: "Agreed. I can add Micrometer counters." },
  { speaker: 'Ankit', text: "Can frontend also log schema violations to Datadog RUM? That might help correlate UI failures faster." },
  { speaker: 'Rahul', text: "Yes, good idea. Let’s do both sides. Also: No more silent fallback logic without visibility. If fallback executes, we should know immediately." },
  { speaker: 'Meera', text: "Understood. One concern though: If we start failing requests instead of partial returning, providers may see more retries today." },
  { speaker: 'Rahul', text: "That’s acceptable. Fail-fast is safer than bad medical data. Data integrity first." },
  { speaker: 'Ankit', text: "Agreed." },
  { speaker: 'Rahul', text: "Alright, let’s summarize action items. Backend Tasks: Meera, add guard clause, return 503, increase timeout to 8s, add metrics, and raise vendor ticket. Frontend Tasks: Ankit, add defensive rendering, prevent invalid submission, add 503 handling, improve loading UX, and add RUM logging. I’ll coordinate support and monitor deployment. Let’s stay active on Teams. Anything else?" },
  { speaker: 'Meera', text: "Nothing from me." },
  { speaker: 'Ankit', text: "All good." },
  { speaker: 'Rahul', text: "Alright, thanks guys. Let’s fix this quickly." }
];

const ScenarioPlayer: React.FC<ScenarioPlayerProps> = ({ voices, onClose, transcript, title }) => {
  const activeTranscript = useMemo(() => transcript || DEFAULT_TRANSCRIPT, [transcript]);
  const displayTitle = title || "Prod Incident Review";
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(true);
  const [audioCache, setAudioCache] = useState<Record<number, string>>({});
  const [isDownloadingFull, setIsDownloadingFull] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState<Record<string, boolean>>({});

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const isMountedRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Map speakers to specific voices
  const speakerVoices = useMemo(() => {
    return {
      'Rahul': voices.find(v => v.name === 'Charon') || voices[0],
      'Ankit': voices.find(v => v.name === 'Puck') || voices[1],
      'Meera': voices.find(v => v.name === 'Zephyr') || voices[2]
    };
  }, [voices]);

  const speakerInfo = {
    'Rahul': { icon: <Terminal size={14} />, color: 'text-blue-500', bgColor: 'bg-blue-500/10', label: 'Tech Lead' },
    'Ankit': { icon: <Activity size={14} />, color: 'text-indigo-500', bgColor: 'bg-indigo-500/10', label: 'Frontend' },
    'Meera': { icon: <Database size={14} />, color: 'text-purple-500', bgColor: 'bg-purple-500/10', label: 'Backend' },
  };

  useEffect(() => {
    isMountedRef.current = true;
    checkDriveStatus();

    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsDriveConnected(true);
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      isMountedRef.current = false;
      stopAudio();
      window.removeEventListener('message', handleMessage);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
      }
    };
  }, []);

  const checkDriveStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setIsDriveConnected(data.isAuthenticated);
    } catch (e) {
      console.error("Failed to check drive status", e);
    }
  };

  const handleConnectDrive = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.open(url, 'google_auth_popup', 'width=600,height=700');
    } catch (e) {
      setError("Failed to start Google Drive connection");
    }
  };

  const handleLogoutDrive = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setIsDriveConnected(false);
    } catch (e) {
      console.error("Failed to logout from Drive", e);
    }
  };

  const handleSaveToDrive = async (index: number | 'full') => {
    if (!isDriveConnected) {
      handleConnectDrive();
      return;
    }

    const uploadKey = index.toString();
    setIsUploadingToDrive(prev => ({ ...prev, [uploadKey]: true }));
    setError(null);

    try {
      let audioBase64: string | null = null;
      let fileName = "";

      if (index === 'full') {
        // Need to ensure all are cached and then merge
        // Re-using the logic from download full but without the download part
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
        const currentCache = { ...audioCache };
        const mergedChunks: Uint8Array[] = [];

        setDownloadStatus('Preparing full discussion...');
        for (let i = 0; i < activeTranscript.length; i++) {
          let data = currentCache[i];
          if (!data) {
            const line = activeTranscript[i];
            const voice = speakerVoices[line.speaker as keyof typeof speakerVoices] || voices[0];
            const response = await ai.models.generateContent({
              model: "gemini-3.1-flash-tts-preview",
              contents: { parts: [{ text: line.text }] },
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.name } },
                },
              },
            });
            data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
            if (data) {
              currentCache[i] = data;
              setAudioCache(prev => ({ ...prev, [i]: data! }));
            }
          }
          if (data) mergedChunks.push(decodeBase64(data));
          await new Promise(r => setTimeout(r, 100));
        }

        const totalLength = mergedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const combinedData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of mergedChunks) {
          combinedData.set(chunk, offset);
          offset += chunk.length;
        }

        const header = createWavHeader(totalLength, 24000);
        const fullAudio = new Uint8Array(header.length + combinedData.length);
        fullAudio.set(header);
        fullAudio.set(combinedData, header.length);
        
        // Convert Uint8Array to base64
        audioBase64 = btoa(fullAudio.reduce((data, byte) => data + String.fromCharCode(byte), ''));
        fileName = "incident-discussion-full.wav";
      } else {
        audioBase64 = audioCache[index];
        if (!audioBase64) {
          // Play it once to cache it
          await playLine(index);
          audioBase64 = audioCache[index];
        }
        fileName = `scenario-line-${index}-${activeTranscript[index].speaker}.wav`;
      }

      if (!audioBase64) throw new Error("Audio data not found");

      const res = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, audioBase64 })
      });

      if (!res.ok) {
        if (res.status === 401) {
          setIsDriveConnected(false);
          throw new Error("Session expired. Please reconnect.");
        }
        throw new Error("Upload failed");
      }

      setDownloadStatus("Saved to Drive!");
      setTimeout(() => setDownloadStatus(''), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save to Google Drive");
    } finally {
      setIsUploadingToDrive(prev => ({ ...prev, [uploadKey]: false }));
    }
  };

  // Auto-scroll to current line
  useEffect(() => {
    if (currentLineIndex >= 0 && scrollRef.current) {
        const activeElement = scrollRef.current.querySelector(`[data-index="${currentLineIndex}"]`);
        if (activeElement) {
            activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
  }, [currentLineIndex]);

  function decodeBase64(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const numChannels = 1;
    const sampleRate = 24000;
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
  };

  const playLine = async (index: number) => {
    if (index >= activeTranscript.length) {
      setIsPlaying(false);
      setCurrentLineIndex(-1);
      return;
    }

    stopAudio();
    setCurrentLineIndex(index);
    setIsLoading(true);
    setError(null);

    const line = activeTranscript[index];
    const voice = speakerVoices[line.speaker as keyof typeof speakerVoices] || voices[0];

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: { parts: [{ text: line.text }] },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.name } },
          },
        },
      });

      if (!isMountedRef.current) return;

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) throw new Error("No audio data received");

      setAudioCache(prev => ({ ...prev, [index]: audioData }));

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      } else if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const rawBytes = decodeBase64(audioData);
      const audioBuffer = await decodeAudioData(rawBytes, audioContextRef.current);

      if (!isMountedRef.current) return;

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      source.onended = () => {
        if (!isMountedRef.current) return;
        setIsPlaying(false);
        if (autoPlay && index + 1 < activeTranscript.length) {
            playLine(index + 1);
        }
      };

      sourceNodeRef.current = source;
      source.start();
      setIsPlaying(true);
      setIsLoading(false);

    } catch (err) {
      console.error(err);
      if (isMountedRef.current) {
        setError("Failed to play this line. Continuing...");
        setIsLoading(false);
        if (autoPlay && index + 1 < activeTranscript.length) {
            setTimeout(() => playLine(index + 1), 2000);
        }
      }
    }
  };

  const startScenario = () => {
    playLine(0);
  };

  const createWavHeader = (dataLength: number, sampleRate: number): Uint8Array => {
    const header = new Uint8Array(44);
    const view = new DataView(header.buffer);

    /* RIFF identifier */
    view.setUint32(0, 0x52494646, false); // "RIFF"
    /* file length */
    view.setUint32(4, 36 + dataLength, true);
    /* RIFF type */
    view.setUint32(8, 0x57415645, false); // "WAVE"

    /* format chunk identifier */
    view.setUint32(12, 0x666d7420, false); // "fmt "
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true); // PCM
    /* channel count */
    view.setUint16(22, 1, true); // Mono
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * 2, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, 2, true);
    /* bits per sample */
    view.setUint16(34, 16, true);

    /* data chunk identifier */
    view.setUint32(36, 0x64617461, false); // "data"
    /* data chunk length */
    view.setUint32(40, dataLength, true);

    return header;
  };

  const handleDownloadFull = async () => {
    if (isDownloadingFull) return;
    setIsDownloadingFull(true);
    setDownloadProgress(0);
    setDownloadStatus('Initializing...');
    setError(null);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    // Use a local copy of the cache to avoid reacting to state update delays within the loop
    const currentCache = { ...audioCache };

    try {
      // Step 1: Sequential Fetching
      for (let i = 0; i < activeTranscript.length; i++) {
        if (!isMountedRef.current) break;
        
        let audioData = currentCache[i];
        
        if (!audioData) {
          setDownloadStatus(`Downloading line ${i + 1} of ${activeTranscript.length}...`);
          const line = activeTranscript[i];
          const voice = speakerVoices[line.speaker as keyof typeof speakerVoices] || voices[0];

          try {
            const response = await ai.models.generateContent({
              model: "gemini-3.1-flash-tts-preview",
              contents: { parts: [{ text: line.text }] },
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.name } },
                },
              },
            });

            audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            
            if (audioData) {
              // Update both local copy and state
              currentCache[i] = audioData;
              setAudioCache(prev => ({ ...prev, [i]: audioData! }));
              setDownloadProgress(Math.round(((i + 1) / TRANSCRIPT.length) * 100));
            } else {
              throw new Error(`Empty response for line ${i + 1}`);
            }

            // Small delay to prevent hitting rate limits
            await new Promise(r => setTimeout(r, 200));
          } catch (err) {
            console.error(`Failed at line ${i + 1}:`, err);
            setError(`Error at line ${i + 1}. Tap Download again to resume.`);
            setIsDownloadingFull(false);
            return;
          }
        } else {
          // Already have it in cache, just update progress
          setDownloadProgress(Math.round(((i + 1) / TRANSCRIPT.length) * 100));
        }
      }

      if (!isMountedRef.current) return;

      // Step 2: Merging
      setDownloadStatus('Merging tracks...');
      const mergedChunks: Uint8Array[] = [];
      
      for (let i = 0; i < activeTranscript.length; i++) {
        const data = currentCache[i];
        if (data) {
          mergedChunks.push(decodeBase64(data));
        } else {
          throw new Error(`Missing audio data for line ${i + 1} during merge.`);
        }
      }

      const totalLength = mergedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combinedData = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of mergedChunks) {
        combinedData.set(chunk, offset);
        offset += chunk.length;
      }

      const header = createWavHeader(totalLength, 24000);
      const finalBlob = new Blob([header, combinedData], { type: 'audio/wav' });
      const url = URL.createObjectURL(finalBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `incident-discussion-full.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setDownloadStatus('Download complete!');
      setTimeout(() => setDownloadStatus(''), 2000);
    } catch (err) {
      console.error(err);
      setError("An error occurred during audio assembly.");
    } finally {
      setIsDownloadingFull(false);
    }
  };

  const handleDownloadLine = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const audioData = audioCache[index];
    if (!audioData) return;

    const line = activeTranscript[index];
    const rawBytes = decodeBase64(audioData);
    const blob = new Blob([rawBytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scenario-line-${index}-${line.speaker}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                <AlertCircle size={20} />
            </div>
            <div>
                <h2 className="text-lg font-bold font-display text-zinc-900 dark:text-white">{displayTitle}</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Audio Preview Engine</p>
            </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
            {!isDriveConnected ? (
              <button 
                  onClick={handleConnectDrive}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
              >
                  <Cloud size={14} />
                  <span>Connect Drive</span>
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button 
                    onClick={() => handleSaveToDrive('full')}
                    disabled={isUploadingToDrive['full'] || isDownloadingFull}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        isUploadingToDrive['full'] 
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-400' 
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20'
                    }`}
                    title="Save full discussion to Google Drive"
                >
                    {isUploadingToDrive['full'] ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={14} />}
                    <span>Save to Drive</span>
                </button>
                <button 
                    onClick={handleLogoutDrive}
                    className="p-2 text-zinc-400 hover:text-red-500 rounded-full transition-colors"
                    title="Disconnect Google Drive"
                >
                    <LogOut size={16} />
                </button>
              </div>
            )}
            <button 
                onClick={handleDownloadFull}
                disabled={isDownloadingFull}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                    isDownloadingFull 
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white border-none'
                }`}
            >
                {isDownloadingFull ? <Loader2 size={12} className="animate-spin" /> : <Download size={14} />}
                <span>Download Full Conversation</span>
            </button>
            <button 
                onClick={() => setAutoPlay(!autoPlay)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hidden sm:flex ${autoPlay ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}
            >
                {autoPlay ? 'Auto-play ON' : 'Auto-play OFF'}
            </button>
            <button 
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                title="Close Scenario"
            >
                <X size={20} />
            </button>
        </div>
      </div>

      {/* Transcript Scroll Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar"
      >
        {activeTranscript.map((line, idx) => {
          const isActive = currentLineIndex === idx;
          const info = speakerInfo[line.speaker as keyof typeof speakerInfo] || speakerInfo['Rahul'];
          
          return (
            <motion.div 
              key={idx}
              data-index={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`flex gap-4 group ${isActive ? 'scale-[1.02]' : 'opacity-70 grayscale-[0.5] hover:opacity-100 hover:grayscale-0'} transition-all duration-300`}
            >
               {/* Speaker Avatar / Icon */}
               <div className="flex-shrink-0 flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-xl ${info.bgColor} flex items-center justify-center ${info.color} shadow-sm group-hover:shadow-md transition-all`}>
                    <User size={20} />
                  </div>
                  <div className="w-px flex-1 bg-zinc-100 dark:bg-zinc-800 mt-2"></div>
               </div>

               {/* Content */}
               <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-bold ${info.color}`}>{line.speaker}</span>
                    <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-100 dark:border-zinc-800">{info.label}</span>
                  </div>
                  <div 
                    className={`relative p-4 rounded-2xl border transition-all ${
                        isActive 
                        ? 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 shadow-sm' 
                        : 'bg-white dark:bg-zinc-950 border-transparent hover:border-zinc-100 dark:hover:border-zinc-800'
                    }`}
                  >
                     <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                        {line.text}
                     </p>
                     
                     {/* Play Indicator Overlay */}
                     {isActive && (
                        <div className="absolute top-2 right-2">
                           {isLoading ? (
                               <Loader2 size={14} className="animate-spin text-zinc-400" />
                           ) : isPlaying ? (
                               <motion.div 
                                animate={{ scale: [1, 1.2, 1] }} 
                                transition={{ repeat: Infinity, duration: 1 }}
                                className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                               />
                           ) : null}
                        </div>
                     )}
                     
                     {!isPlaying && !isLoading && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            {audioCache[idx] && (
                                <>
                                  <button 
                                      onClick={() => handleSaveToDrive(idx)}
                                      disabled={isUploadingToDrive[idx.toString()]}
                                      className={`p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 transition-all ${isUploadingToDrive[idx.toString()] ? 'animate-pulse text-indigo-500' : 'text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                                      title="Save to Google Drive"
                                  >
                                      {isUploadingToDrive[idx.toString()] ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
                                  </button>
                                  <button 
                                      onClick={(e) => handleDownloadLine(e, idx)}
                                      className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all"
                                      title="Download line as audio"
                                  >
                                      <Download size={12} />
                                  </button>
                                </>
                            )}
                            <button 
                                onClick={() => playLine(idx)}
                                className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all"
                                title="Play line"
                            >
                                <Play size={12} className="fill-current" />
                            </button>
                        </div>
                     )}
                  </div>
               </div>
            </motion.div>
          );
        })}
        
        {/* Placeholder for spacer */}
        <div className="h-24"></div>
      </div>

      {/* Footer Controls */}
      <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                  <button 
                    onClick={currentLineIndex === -1 ? startScenario : stopAudio}
                    className="flex items-center gap-2 px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full font-bold transition-all hover:scale-105 active:scale-95 shadow-xl shadow-zinc-950/20"
                  >
                    {isPlaying || isLoading ? (
                        <>
                            <Square size={16} className="fill-current" />
                            <span>Stop Discussion</span>
                        </>
                    ) : (
                        <>
                            <Play size={16} className="fill-current" />
                            <span>Play Discussion</span>
                        </>
                    )}
                  </button>

                  {currentLineIndex >= 0 && (
                      <div className="flex items-center gap-3">
                         <AudioVisualizer isPlaying={isPlaying} color={document.documentElement.classList.contains('dark') ? '#a5b4fc' : '#18181b'} />
                      </div>
                  )}
              </div>

              <div className="flex items-center gap-4 text-xs font-medium text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>Rahul (Charon)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    <span>Ankit (Puck)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    <span>Meera (Zephyr)</span>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default ScenarioPlayer;
