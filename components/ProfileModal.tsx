import React, { useState } from 'react';
import { X, Key, Save, Edit2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onUpdateUser: (updatedUser: any) => void;
}

export function ProfileModal({ isOpen, onClose, user, onUpdateUser }: ProfileModalProps) {
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  
  const [apiKey, setApiKey] = useState('');
  const [email, setEmail] = useState(user.email || '');
  const [age, setAge] = useState(user.age?.toString() || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [gender, setGender] = useState(user.gender || 'Prefer not to say');
  const [dob, setDob] = useState(user.dob ? new Date(user.dob).toISOString().split('T')[0] : '');
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const calculateAge = (birthDate: string) => {
    if (!birthDate) return '';
    const today = new Date();
    const birth = new Date(birthDate);
    let ageVal = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      ageVal--;
    }
    return ageVal.toString();
  };

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDob(val);
    setAge(calculateAge(val));
  };

  if (!isOpen) return null;

  const handleSaveProfile = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, age: parseInt(age), phone, gender, dob }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to update profile');
      }

      onUpdateUser({ ...user, email, age: parseInt(age), phone, gender, dob });
      setIsEditingProfile(false);
      setStatus({ type: 'success', message: 'Profile updated successfully' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setStatus({ type: 'error', message: 'API key cannot be empty' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch('/api/user/apikey', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to update API key');
      }

      onUpdateUser({ ...user, gemini_api_key: apiKey.trim() });
      setIsEditingKey(false);
      setApiKey('');
      setStatus({ type: 'success', message: 'API key updated successfully' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err: any) {
      console.error('Update API key error:', err);
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const maskedKey = user.gemini_api_key 
    ? `•••• •••• •••• ${user.gemini_api_key.slice(-4)}`
    : 'Not configured';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            Profile Settings
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* User Info Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Account Information</h3>
              {!isEditingProfile && (
                <button 
                  onClick={() => setIsEditingProfile(true)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                >
                  Edit Profile
                </button>
              )}
            </div>

            {isEditingProfile ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Phone</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Age (Auto)</label>
                    <input
                      type="number"
                      value={age}
                      readOnly
                      className="w-full bg-zinc-100 dark:bg-black/30 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-500 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={dob}
                      onChange={handleDobChange}
                      className="w-full bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSaveProfile}
                    disabled={loading}
                    className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save Profile
                  </button>
                  <button
                    onClick={() => { setIsEditingProfile(false); setStatus(null); }}
                    className="flex-1 bg-zinc-100 dark:bg-zinc-800 py-2 rounded-xl text-sm font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-y-4 p-4 bg-zinc-50 dark:bg-black/30 border border-zinc-100 dark:border-zinc-800 rounded-2xl">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase">Username</p>
                  <p className="text-sm font-medium">{user.username}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase">Email</p>
                  <p className="text-sm font-medium truncate">{user.email}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase">Age</p>
                  <p className="text-sm font-medium">{user.age}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase">DOB</p>
                  <p className="text-sm font-medium">{user.dob ? new Date(user.dob).toLocaleDateString() : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase">Gender</p>
                  <p className="text-sm font-medium">{user.gender}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase">Phone</p>
                  <p className="text-sm font-medium">{user.phone}</p>
                </div>
              </div>
            )}
          </div>

          <hr className="border-zinc-100 dark:border-zinc-800" />

          {/* Gemini API Key */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">AI Configuration</h3>
            
            {isEditingKey ? (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoFocus
                    placeholder="Paste your Gemini API key here..."
                    className="w-full bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Key
                  </button>
                  <button
                    onClick={() => { setIsEditingKey(false); setApiKey(''); setStatus(null); }}
                    className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 py-2 rounded-xl text-sm font-bold transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-black/30 border border-zinc-100 dark:border-zinc-800 rounded-2xl group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <Key size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-mono text-zinc-600 dark:text-zinc-300">{maskedKey}</p>
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Gemini API Key</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsEditingKey(true)}
                  className="p-2 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-zinc-800 rounded-lg transition-all"
                >
                  <Edit2 size={18} />
                </button>
              </div>
            )}
          </div>

          {status && (
            <div className={`p-3 rounded-xl border flex items-center gap-3 animate-in slide-in-from-top-2 duration-200 ${
              status.type === 'success' 
                ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/20 text-emerald-600 dark:text-emerald-400' 
                : 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20 text-red-600 dark:text-red-400'
            }`}>
              {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <p className="text-sm font-medium">{status.message}</p>
            </div>
          )}

          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 p-4 rounded-xl">
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong>Tip:</strong> You can get a free API key from the <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline font-bold">Google AI Studio</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
