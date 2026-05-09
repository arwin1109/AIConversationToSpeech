import React, { useState, useMemo, useEffect } from 'react';
import { VOICE_DATA } from './constants';
import Carousel3D from './components/Carousel3D';
import GridView from './components/GridView';
import FilterBar from './components/FilterBar';
import VoiceFinder from './components/VoiceFinder';
import AiResultCard from './components/AiResultCard';
import ScenarioPlayer from './components/ScenarioPlayer';
import ConversationArchitect from './components/ConversationArchitect';
import { AuthPage } from './components/AuthPage';
import { FilterState, AiRecommendation, DialogueLine } from './types';
import { Info, LogOut, Volume2, Sparkles, User } from 'lucide-react';
import { ProfileModal } from './components/ProfileModal';

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiRecommendation | null>(null);
  const [isAiCardVisible, setIsAiCardVisible] = useState(false);
  const [showVoiceFinder, setShowVoiceFinder] = useState(false);
  const [showScenario, setShowScenario] = useState(false);
  const [showArchitect, setShowArchitect] = useState(false);
  const [customTranscript, setCustomTranscript] = useState<DialogueLine[] | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'carousel' | 'grid'>('carousel');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  
  // Carousel state
  const [activeIndex, setActiveIndex] = useState(0);

  const [filters, setFilters] = useState<FilterState>({
    gender: 'All',
    pitch: 'All',
    search: '',
  });

  // Check auth status
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (!res.ok) throw new Error('Not logged in');
        return res.json();
      })
      .then(data => {
        if (data.user) setUser(data.user);
      })
      .catch(err => {
        console.log("Auth check failed:", err.message);
        setUser(null);
      })
      .finally(() => setAuthChecking(false));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  // Theme Management
  useEffect(() => {
    if (isDarkMode) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const uniqueGenders = useMemo(() => Array.from(new Set(VOICE_DATA.map(v => v.analysis.gender))).sort(), []);
  const uniquePitches = useMemo(() => Array.from(new Set(VOICE_DATA.map(v => v.analysis.pitch))).sort(), []);

  const filteredVoices = useMemo(() => {
    let baseData = VOICE_DATA;
    if (aiResult) {
       const recommended = aiResult.voiceNames
          .map(name => VOICE_DATA.find(v => v.name === name))
          .filter((v): v is typeof VOICE_DATA[0] => !!v);
       return recommended.length > 0 ? recommended : baseData;
    }

    return baseData.filter(voice => {
      const matchGender = filters.gender === 'All' || voice.analysis.gender === filters.gender;
      const matchPitch = filters.pitch === 'All' || voice.analysis.pitch === filters.pitch;
      
      const searchLower = filters.search.toLowerCase();
      const matchSearch = filters.search === '' || 
        voice.name.toLowerCase().includes(searchLower) || 
        voice.characteristics.some(c => c.toLowerCase().includes(searchLower)) ||
        voice.analysis.characteristics.some(c => c.toLowerCase().includes(searchLower)) ||
        voice.analysis.gender.toLowerCase().startsWith(searchLower) ||
        voice.pitch.toLowerCase().includes(searchLower) ||
        voice.analysis.pitch.toLowerCase().includes(searchLower);

      return matchGender && matchPitch && matchSearch;
    });
  }, [filters, aiResult]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filteredVoices.length]);

  const handlePlayToggle = (voiceName: string) => {
    setPlayingVoice(current => current === voiceName ? null : voiceName);
  };

  const clearAiResult = () => {
    setAiResult(null);
    setIsAiCardVisible(false);
    setFilters({ ...filters, search: '' });
  };

  const checkApiKey = (action: () => void) => {
    if (!user?.gemini_api_key) {
      setShowProfile(true);
      return;
    }
    action();
  };

  if (authChecking) {
    return <div className="h-screen w-screen bg-black flex items-center justify-center text-white">Loading...</div>;
  }

  if (!user) {
    return <AuthPage onLogin={setUser} />;
  }

  const isModalOpen = showVoiceFinder || (aiResult && isAiCardVisible) || showScenario || showArchitect || showProfile;

  return (
    <div className="h-screen w-screen bg-[#FDFDFD] dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden flex flex-col relative transition-colors duration-300">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-blue-50 dark:bg-blue-900/20 blur-3xl opacity-60"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-purple-50 dark:bg-purple-900/20 blur-3xl opacity-50"></div>
      </div>

      {/* Main App Content - aria-hidden and inert when modal is open */}
      <div 
        className="flex flex-col flex-1 overflow-hidden" 
        aria-hidden={isModalOpen}
        // @ts-ignore - 'inert' is a standard attribute but might not be in all TS types yet
        inert={isModalOpen ? true : undefined}
        style={isModalOpen ? { pointerEvents: 'none' } : {}}
      >
        {/* User Status Bar */}
        <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-6 py-2 flex justify-between items-center z-10">
          <div className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            Welcome, <span className="text-indigo-600 dark:text-indigo-400">{user.username}</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowProfile(true)} 
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <User size={16} /> Profile
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-zinc-500 hover:text-red-500 transition-colors">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-sm p-4 flex flex-col gap-3 shrink-0 z-10 hidden md:flex">
              <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2 px-1">
                  Conversations
              </div>
              
              <button 
                  onClick={() => checkApiKey(() => {
                      setCustomTranscript(undefined);
                      setShowScenario(true);
                  })}
                  className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-600 text-zinc-700 dark:text-zinc-200 rounded-xl text-sm font-medium shadow-sm transition-all hover:shadow-md w-full text-left"
              >
                  <Volume2 size={16} className="text-indigo-500" />
                  <span className="flex-1">Incident Preview</span>
              </button>

              <button 
                  onClick={() => checkApiKey(() => setShowArchitect(true))}
                  className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0 w-full text-left border-none"
              >
                  <Sparkles size={16} className="text-indigo-200 animate-pulse" />
                  <span className="flex-1">Conversation Architect</span>
              </button>
          </div>

          <div className="flex-1 flex flex-col min-w-0 relative">
            <FilterBar 
              filters={filters}
              onFilterChange={setFilters}
              uniqueGenders={uniqueGenders}
              uniquePitches={uniquePitches}
              onOpenAiCasting={() => checkApiKey(() => setShowVoiceFinder(true))}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              isDarkMode={isDarkMode}
              toggleTheme={toggleTheme}
            />

            <main className="flex-1 relative flex flex-col overflow-hidden">
                  {filteredVoices.length > 0 ? (
                      viewMode === 'carousel' ? (
                        <div className="w-full flex-1 flex items-center justify-center pb-8 min-h-0">
                            <Carousel3D 
                                voices={filteredVoices}
                                activeIndex={activeIndex}
                                onChange={setActiveIndex}
                                playingVoice={playingVoice}
                                onPlayToggle={handlePlayToggle}
                                disabled={isModalOpen}
                            />
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                          <GridView 
                              voices={filteredVoices}
                              playingVoice={playingVoice}
                              onPlayToggle={handlePlayToggle}
                          />
                        </div>
                      )
                  ) : (
                      <div className="w-full h-full flex items-center justify-center pb-24">
                          <div className="text-center animate-fade-in">
                              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 mb-6 shadow-sm">
                                  <Info size={32} className="text-zinc-300 dark:text-zinc-500" />
                              </div>
                              <h3 className="text-xl font-serif text-zinc-900 dark:text-white mb-2">No voices found</h3>
                              <p className="text-zinc-500 dark:text-zinc-400 mb-6">Try adjusting your filters or use AI Match.</p>
                              <button 
                                  onClick={() => checkApiKey(() => setShowVoiceFinder(true))}
                                  className="px-4 py-2 bg-zinc-900 dark:bg-indigo-600 text-white rounded-full text-sm font-medium hover:bg-zinc-800 dark:hover:bg-indigo-500 transition-colors"
                              >
                                  Open AI Casting
                              </button>
                          </div>
                      </div>
                  )}
                  
                  {!aiResult && filteredVoices.length > 0 && viewMode === 'carousel' && (
                      <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium tracking-widest uppercase bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm inline-block px-3 py-1 rounded-full border border-white/50 dark:border-zinc-800">
                              {activeIndex + 1} / {filteredVoices.length}
                          </p>
                      </div>
                  )}
            </main>
          </div>
        </div>
      </div>

      {/* Modals are rendered outside the aria-hidden container */}
      {showVoiceFinder && (
        <VoiceFinder 
            voices={VOICE_DATA}
            onRecommendation={(rec) => {
                if (rec) {
                    setAiResult(rec);
                    setIsAiCardVisible(true);
                    setFilters(prev => ({ ...prev, search: '' })); 
                }
                setShowVoiceFinder(false);
            }}
            onClose={() => setShowVoiceFinder(false)}
            apiKey={user.gemini_api_key}
        />
      )}

      {aiResult && isAiCardVisible && (
          <div 
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-result-title"
          >
             <div className="absolute inset-0" onClick={clearAiResult}></div>
             <div className="relative w-full max-w-5xl animate-slide-up max-h-[90vh] overflow-hidden rounded-2xl">
                 <AiResultCard 
                    result={aiResult} 
                    voices={filteredVoices} 
                    onClose={clearAiResult} 
                    apiKey={user.gemini_api_key}
                 />
             </div>
          </div>
      )}

      {showScenario && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-8 bg-zinc-900/60 backdrop-blur-md animate-fade-in">
              <div className="absolute inset-0" onClick={() => setShowScenario(false)}></div>
              <div className="relative w-full max-w-6xl h-full sm:max-h-[90vh] animate-slide-up overflow-hidden sm:rounded-3xl shadow-2xl flex flex-col">
                  <ScenarioPlayer 
                    voices={VOICE_DATA} 
                    transcript={customTranscript}
                    title={customTranscript ? "Architected Scenario" : undefined}
                    onClose={() => setShowScenario(false)} 
                    apiKey={user.gemini_api_key}
                  />
              </div>
          </div>
      )}

      {showArchitect && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-8 bg-zinc-900/60 backdrop-blur-md animate-fade-in">
              <div className="absolute inset-0" onClick={() => setShowArchitect(false)}></div>
              <div className="relative w-full max-w-4xl h-full sm:h-auto sm:max-h-[85vh] animate-slide-up overflow-hidden sm:rounded-3xl shadow-2xl">
                  <ConversationArchitect
                    onPushToPreview={(transcript) => {
                        setCustomTranscript(transcript);
                        setShowArchitect(false);
                        setShowScenario(true);
                    }}
                    onClose={() => setShowArchitect(false)} 
                    apiKey={user.gemini_api_key}
                  />
              </div>
          </div>
      )}

      <ProfileModal 
        isOpen={showProfile} 
        onClose={() => setShowProfile(false)} 
        user={user}
        onUpdateUser={setUser}
      />
    </div>
  );
};

export default App;