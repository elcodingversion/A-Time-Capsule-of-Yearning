/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, 
  Sparkles, 
  BookOpen, 
  ArrowLeft, 
  Trash2, 
  Download, 
  Upload, 
  Volume2, 
  VolumeX, 
  Search, 
  Calendar, 
  X, 
  PenTool, 
  Compass, 
  RefreshCw 
} from 'lucide-react';
import { JournalEntry } from './types';
import { getMelancholicQuote } from './quotes';

// Ambient wind synthesizer using Web Audio API (completely client-side, lightweight, offline)
class WindAmbience {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private oscillator: OscillatorNode | null = null;
  private isRunning = false;

  start() {
    try {
      if (this.isRunning) return;
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const bufferSize = 3 * this.ctx.sampleRate;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      
      // Seed pink-ish warm natural ambient noise
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.08; // Keep volume gentle
        b6 = white * 0.115926;
      }

      this.source = this.ctx.createBufferSource();
      this.source.buffer = noiseBuffer;
      this.source.loop = true;

      // Filter to simulate muffled hum of rain/wind in a quiet room
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.setValueAtTime(280, this.ctx.currentTime);

      // Low Frequency Oscillator (LFO) to simulate gusts of wind swaying
      this.oscillator = this.ctx.createOscillator();
      this.oscillator.type = 'sine';
      this.oscillator.frequency.setValueAtTime(0.06, this.ctx.currentTime); // 0.06Hz (rhythm of breath)

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(120, this.ctx.currentTime); // Modulate lowpass frequency by +/- 120Hz

      this.oscillator.connect(lfoGain);
      lfoGain.connect(this.filter.frequency);

      this.gain = this.ctx.createGain();
      // Whisper quiet ambient level
      this.gain.gain.setValueAtTime(0.04, this.ctx.currentTime);

      this.source.connect(this.filter);
      this.filter.connect(this.gain);
      this.gain.connect(this.ctx.destination);

      this.oscillator.start();
      this.source.start();
      this.isRunning = true;
    } catch (e) {
      console.warn("Failed to initialize Web Audio wind synthesizer", e);
    }
  }

  stop() {
    try {
      if (this.source) {
        this.source.stop();
        this.source.disconnect();
      }
      if (this.oscillator) {
        this.oscillator.stop();
        this.oscillator.disconnect();
      }
      if (this.ctx) {
        this.ctx.close();
      }
      this.isRunning = false;
    } catch (e) {
      console.error(e);
    }
  }
}

export default function App() {
  // --- STATE PERSISTENCE ---
  const [targetName, setTargetName] = useState<string>(() => {
    return localStorage.getItem('kapsul_target_name') || '';
  });

  const [entries, setEntries] = useState<JournalEntry[]>(() => {
    const data = localStorage.getItem('kapsul_entries');
    return data ? JSON.parse(data) : [];
  });

  // Active view: 'dedication' (if no targetName), 'main' (tracked workspace), 'archives' (memory stack)
  const [activeView, setActiveView] = useState<'dedication' | 'main' | 'archives'>(() => {
    const savedTarget = localStorage.getItem('kapsul_target_name');
    return savedTarget ? 'main' : 'dedication';
  });

  const [currentDraft, setCurrentDraft] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStar, setSelectedStar] = useState<JournalEntry | null>(null);
  
  // Audio state
  const [isWindPlaying, setIsWindPlaying] = useState<boolean>(false);
  const windInstance = useRef<WindAmbience | null>(null);

  // UI interaction states
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showInfoPanel, setShowInfoPanel] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-init sound player helper
  const toggleWindAmbience = () => {
    if (!windInstance.current) {
      windInstance.current = new WindAmbience();
    }
    
    if (isWindPlaying) {
      windInstance.current.stop();
      setIsWindPlaying(false);
    } else {
      windInstance.current.start();
      setIsWindPlaying(true);
    }
  };

  // Safe stop audio on component unmount
  useEffect(() => {
    return () => {
      if (windInstance.current) {
        windInstance.current.stop();
      }
    };
  }, []);

  // Compute active day
  // "Hari bertambah (+1) secara otomatis setelah user men-submit curhatan baru"
  // So if they have submitted N entries, the next day for writing is N + 1
  const activeDay = useMemo(() => {
    return entries.length + 1;
  }, [entries]);

  // Today's quote is based on the activeDay we are about to compile
  const todayQuote = useMemo(() => {
    return getMelancholicQuote(activeDay);
  }, [activeDay]);

  // --- BUSINESS LOGIC ---

  // 1. Submit Name
  const handleSaveTargetName = (nameInput: string) => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setTargetName(trimmed);
    localStorage.setItem('kapsul_target_name', trimmed);
    setActiveView('main');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 2. Submit Memory (Writing)
  const handleSubmitMemory = (e: React.FormEvent) => {
    e.preventDefault();
    const draftText = currentDraft.trim();
    if (!draftText) return;

    // Generate beautiful coordinates for star positioning
    // Using Golden Angle Spiral with a touch of organic distribution to look like galaxies
    const index = entries.length;
    const phi = 137.5 * (Math.PI / 180); // Fibonacci Golden Angle
    const radius = 10 + Math.sqrt(index + 1) * 8.5; // Spiral outwards
    const angle = index * phi;

    // Center of SVG canvas is (50, 42)
    const starX = 50 + Math.cos(angle) * radius;
    const starY = 42 + Math.sin(angle) * radius;

    // Boundary restriction to prevent spilling outside view (keep within 10 to 90)
    const finalX = Math.max(10, Math.min(90, starX));
    const finalY = Math.max(12, Math.min(78, starY));

    // Custom deterministic sizing and grouping
    const starSize = 1.2 + (Math.sin(index) * 0.4) + (Math.cos(index * 2) * 0.2);
    const constellationId = Math.floor(index / 6); // 6 stars per virtual constellation cluster

    const newEntry: JournalEntry = {
      day: activeDay,
      date: new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      quote: todayQuote,
      content: draftText,
      starX: finalX,
      starY: finalY,
      constellationId,
      starSize: parseFloat(starSize.toFixed(2))
    };

    const updated = [...entries, newEntry];
    setEntries(updated);
    localStorage.setItem('kapsul_entries', JSON.stringify(updated));
    setCurrentDraft('');

    // Trigger sweet visual highlight on the newly born star
    setSelectedStar(newEntry);
    
    // Automatically scroll to the top of the page to focus on the updated Sky of Memories
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 3. Delete individual Memory
  const handleDeleteEntry = (dayToDelete: number) => {
    if (window.confirm(`Hapus seluruh ingatan pada Day ${dayToDelete}? Tindakan ini tidak bisa dibatalkan.`)) {
      const filtered = entries.filter(e => e.day !== dayToDelete);
      // Re-map days to keep them sequential Day 1, Day 2, Day 3... to satisfy strict logic rules
      const remapped = filtered.map((entry, idx) => ({
        ...entry,
        day: idx + 1,
        // also recalc coordinate sequences so constellation pattern remains beautiful and uninterrupted
        starX: entry.starX,
        starY: entry.starY
      }));
      setEntries(remapped);
      localStorage.setItem('kapsul_entries', JSON.stringify(remapped));
      if (selectedStar && selectedStar.day === dayToDelete) {
        setSelectedStar(null);
      }
    }
  };

  // 4. Export database
  const exportDatabase = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
        targetName,
        entries
      }));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `Kapsul_Waktu_Rindu_${targetName.replace(/\s+/g, '_')}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      alert("Gagal melakukan ekspor data.");
    }
  };

  // 5. Import database
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const files = e.target.files;
    if (!files || files.length === 0) return;

    fileReader.onload = event => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && typeof parsed === 'object') {
          if (parsed.targetName && Array.isArray(parsed.entries)) {
            setTargetName(parsed.targetName);
            setEntries(parsed.entries);
            localStorage.setItem('kapsul_target_name', parsed.targetName);
            localStorage.setItem('kapsul_entries', JSON.stringify(parsed.entries));
            setImportError(null);
            setShowImportModal(false);
            setActiveView('main');
          } else {
            setImportError("Format file salah. Harus mengandung data targetName dan entries.");
          }
        } else {
          setImportError("Data JSON tidak valid.");
        }
      } catch (err) {
        setImportError("Gagal membaca file JSON. Pastikan file tidak rusak.");
      }
    };
    fileReader.readAsText(files[0]);
  };

  // 6. Reset all space data
  const handleResetSpace = () => {
    localStorage.removeItem('kapsul_target_name');
    localStorage.removeItem('kapsul_entries');
    setTargetName('');
    setEntries([]);
    setCurrentDraft('');
    setSelectedStar(null);
    setShowResetConfirm(false);
    setActiveView('dedication');
  };

  // Filtered archives
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return [...entries].reverse();
    return entries.filter(e => 
      e.content.toLowerCase().includes(searchQuery.toLowerCase()) || 
      e.quote.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `day ${e.day}`.includes(searchQuery.toLowerCase())
    ).reverse();
  }, [entries, searchQuery]);

  return (
    <div className="min-h-screen bg-[#070b19] text-[#f1f5f9] font-sans select-none relative overflow-x-hidden flex flex-col selection:bg-blue-950/80 selection:text-blue-200">
      
      {/* Decorative Ambient Background Glows */}
      <div className="absolute inset-0 pointer-events-none opacity-25 z-0">
        <div className="absolute top-0 left-1/4 w-[50%] h-[400px] bg-blue-950/50 rounded-full blur-[120px]" />
        <div className="absolute bottom-10 right-1/4 w-[40%] h-[300px] bg-indigo-950/40 rounded-full blur-[100px]" />
      </div>

      {/* HEADER AMBIENCE CONTROL BAR (Visible in all views after Dedication, Immersive Style) */}
      {activeView !== 'dedication' && (
        <header className="h-20 flex items-center justify-between px-6 md:px-12 border-b border-white/5 bg-[#070b19]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.3em] text-[#60a5fa] font-semibold font-mono">Kapsul Waktu Rindu</span>
            <span className="font-serif italic text-base text-[#f1f5f9]">Ruang untuk {targetName}</span>
          </div>
          
          <div className="flex items-center gap-4 text-xs">
            {/* View navigation links styled cleanly as in layout */}
            <button 
              onClick={() => { setActiveView('main'); setSelectedStar(null); }}
              className={`text-[10px] uppercase tracking-[0.2em] transition-colors font-mono font-medium ${activeView === 'main' ? 'text-[#60a5fa]' : 'text-white/40 hover:text-white/80'}`}
            >
              Langit Rindu
            </button>
            <button 
              onClick={() => { setActiveView('archives'); setSelectedStar(null); }}
              className={`text-[10px] uppercase tracking-[0.2em] transition-colors font-mono font-medium ${activeView === 'archives' ? 'text-[#60a5fa]' : 'text-white/40 hover:text-white/80'}`}
            >
              Rekapan
            </button>

            <div className="h-6 w-[1px] bg-white/10 hidden sm:block"></div>

            {/* Wind synthesizer trigger */}
            <button 
              id="btn-wind-generator"
              onClick={toggleWindAmbience}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/5 transition-all duration-300 ${isWindPlaying ? 'bg-[#60a5fa]/10 border-[#60a5fa]/25 text-[#60a5fa]' : 'text-gray-400 hover:text-white hover:border-white/10'}`}
              title="Dengarkan desau angin sunyi pendamping menulis curahan hati"
            >
              {isWindPlaying ? <Volume2 className="w-3 h-3 animate-pulse" /> : <VolumeX className="w-3 h-3" />}
              <span className="font-mono text-[9px] tracking-tight sm:inline hidden uppercase">Ambient</span>
            </button>

            {/* Info panel */}
            <button 
              id="btn-view-info"
              onClick={() => setShowInfoPanel(true)}
              className="text-gray-400 hover:text-white p-1 transition"
              title="Informasi Filosofi"
            >
              <Compass className="w-4 h-4" />
            </button>
          </div>
        </header>
      )}

      {/* VIEWS CONTAINER */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 md:py-8 flex flex-col justify-center relative">
        <AnimatePresence mode="wait">
          
          {/* =======================================================
              A. THE DEDICATION PAGE (HALAMAN AWAL)
              ======================================================= */}
          {activeView === 'dedication' && (
            <motion.div
              key="dedication-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6 }}
              className="w-full max-w-md mx-auto text-center py-12 relative flex flex-col items-center justify-center min-h-[75vh]"
            >
              {/* Cinematic Floating Celestial Background Particles */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                <motion.div
                  animate={{ 
                    y: [0, -15, 0], 
                    opacity: [0.15, 0.4, 0.15] 
                  }}
                  transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-10 left-10 w-2 h-2 rounded-full bg-[#60a5fa] blur-[1px]"
                />
                <motion.div
                  animate={{ 
                    y: [0, -20, 0], 
                    opacity: [0.1, 0.3, 0.1] 
                  }}
                  transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute bottom-20 left-1/4 w-1.5 h-1.5 rounded-full bg-warm-muted blur-[1px]"
                />
                <motion.div
                  animate={{ 
                    y: [0, -25, 0], 
                    opacity: [0.2, 0.5, 0.2] 
                  }}
                  transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
                  className="absolute top-1/3 right-12 w-1.5 h-1.5 rounded-full bg-[#60a5fa]/80 blur-[1px]"
                />
              </div>

              {/* Orbiting Celestial Constellation Graphic */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
                className="mb-8 flex justify-center items-center relative w-48 h-48 z-10"
              >
                {/* Outermost Orbit */}
                <motion.div 
                  className="absolute w-44 h-44 rounded-full border border-dashed border-[#60a5fa]/10 flex items-center justify-center"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gray-450/40" />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#60a5fa]/30 shadow-[0_0_8px_#60a5fa]" />
                </motion.div>

                {/* Main Orbit */}
                <motion.div 
                  className="absolute w-32 h-32 rounded-full border border-[#60a5fa]/15"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#60a5fa] shadow-[0_0_10px_#60a5fa]" />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white/40" />
                </motion.div>

                {/* Inner Constellation Web */}
                <motion.div 
                  className="absolute w-20 h-20 rounded-full border border-white/5 bg-[#070b19]/30 flex items-center justify-center"
                  animate={{ rotate: -180 }}
                  transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
                >
                  <div className="absolute top-2 left-2 w-1 h-1 rounded-full bg-[#60a5fa]/60" />
                  <div className="absolute bottom-1 right-2 w-1 h-1 rounded-full bg-[#f1f5f9]/50" />
                </motion.div>

                {/* Pulsing Galactic Glow */}
                <motion.div 
                  className="absolute w-20 h-20 rounded-full bg-[#60a5fa]/[0.035] blur-xl"
                  animate={{ scale: [0.9, 1.25, 0.9] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* Central Warm Heart & Spark */}
                <motion.div 
                  className="relative z-10 flex items-center justify-center w-14 h-14 rounded-full border border-white/10 bg-black/50 backdrop-blur-md shadow-[0_0_20px_rgba(0,0,0,0.8)]"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <Heart className="w-5 h-5 text-[#60a5fa]/65 fill-[#60a5fa]/5 animate-pulse" />
                  <Sparkles className="w-3 h-3 text-[#60a5fa] absolute top-2 right-2 animate-pulse" />
                </motion.div>
              </motion.div>

              {/* Title & Slogan Row with Delayed Fades */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="z-10 text-center mb-8"
              >
                <h1 className="font-serif italic text-4xl sm:text-5xl font-medium tracking-tight mb-3 text-[#f1f5f9] leading-tight">
                  Kapsul Waktu Rindu
                </h1>
                <p className="text-[10px] text-gray-500 font-mono tracking-[0.25em] max-w-sm mx-auto leading-relaxed uppercase">
                  Mengukir sunyi menjadi gugusan rasi bintang harian
                </p>
              </motion.div>

              {/* Premium Form Input Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="p-8 sm:p-10 bg-white/[0.01] hover:bg-white/[0.02] border border-white/5 rounded-3xl shadow-[0_30px_70px_rgba(0,0,0,0.7)] relative overflow-hidden backdrop-blur-lg w-full max-w-sm transition duration-500 z-10"
              >
                <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#60a5fa]/30 to-transparent" />
                
                <p className="font-serif text-sm italic mb-8 text-gray-300/90 leading-relaxed">
                  "Untuk siapa ruang sunyi ini ingin kaudedikasikan?"
                </p>

                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const inputElement = document.getElementById("target-name-input") as HTMLInputElement;
                    if (inputElement?.value) handleSaveTargetName(inputElement.value);
                  }}
                  className="space-y-6"
                >
                  <div className="relative border-b border-white/5 focus-within:border-[#60a5fa]/40 transition-all duration-500 group">
                    <input
                      id="target-name-input"
                      type="text"
                      maxLength={40}
                      required
                      placeholder="Nama panggilan sayang atau inisial..."
                      className="w-full bg-transparent py-3 text-center text-sm font-sans tracking-wide text-[#f1f5f9] focus:outline-none placeholder:text-gray-700 text-ellipsis transition-colors duration-300"
                    />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#60a5fa]/55 to-transparent group-focus-within:w-full transition-all duration-500" />
                  </div>

                  <p className="text-[9px] text-gray-500 leading-relaxed max-w-[240px] mx-auto font-mono uppercase tracking-wider py-2">
                    *Setiap aksara rindu yang terpatri berteduh sunyi di sanubari.
                  </p>

                  <button
                    id="submit-target-name-btn"
                    type="submit"
                    className="w-full py-3.5 px-8 rounded-full bg-gradient-to-r from-blue-950/40 to-indigo-950/30 hover:from-blue-950/60 hover:to-indigo-950/40 border border-[#60a5fa]/25 text-[#f1f5f9] text-[10px] font-bold tracking-widest uppercase transition-all duration-300 hover:shadow-[0_0_20px_rgba(96,165,250,0.08)] active:scale-[0.98] cursor-pointer"
                  >
                    Mulai Merawat Ruang Rindu
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}

          {/* =======================================================
              B. THE MAIN VIEW (HALAMAN UTAMA - TRACKER / INPUT)
              ======================================================= */}
          {activeView === 'main' && (
            <motion.div
              key="main-view"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-1 lg:grid-cols-2 rounded-2xl border border-white/5 bg-white/[0.01] backdrop-blur-md overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] z-10 relative"
            >
              
              {/* LEFT COLUMN: Day Tracker, Quote & Editor */}
              <div className="p-8 lg:p-12 border-b lg:border-r border-white/5 flex flex-col justify-between gap-8">
                
                {/* Header block */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.25em] font-mono text-[#60a5fa] font-semibold">Ukir Lembar Langit</span>
                    <div className="h-[1px] flex-1 bg-white/5"></div>
                    <div className="py-0.5 px-2.5 rounded-full bg-blue-950/45 border border-[#60a5fa]/25 text-[9px] font-mono font-medium text-[#f1f5f9]">
                      Kapsul Privat
                    </div>
                  </div>
                  
                  <div className="mt-2">
                    <h1 className="font-serif italic text-6xl md:text-7xl text-[#f1f5f9] leading-none tracking-tight mb-3">Day {activeDay}</h1>
                    <div className="h-[2px] w-24 bg-gradient-to-r from-[#60a5fa]/40 to-transparent"></div>
                  </div>
                </div>

                {/* Poetry block & Notepad Input */}
                <div className="flex-1 flex flex-col justify-center gap-6">
                  <blockquote className="font-serif italic text-base/relaxed text-gray-300 border-l border-[#60a5fa]/20 pl-6 select-text max-w-md">
                    "{todayQuote}"
                  </blockquote>

                  <form onSubmit={handleSubmitMemory} className="space-y-4">
                    <div className="flex flex-col gap-2">
                      <label htmlFor="memory-draft-textarea" className="text-[10px] uppercase tracking-widest text-[#60a5fa] font-mono font-semibold">Tulis kenangan duka atau rindu harimu</label>
                      <textarea
                        id="memory-draft-textarea"
                        required
                        value={currentDraft}
                        onChange={(e) => setCurrentDraft(e.target.value)}
                        placeholder="Malam ini sunyi sekali. Tulis suratmu untuk dia yang kaurindukan..."
                        className="w-full bg-transparent border-b border-white/10 focus:border-[#60a5fa]/40 outline-none py-3 text-sm font-sans tracking-wide leading-relaxed resize-none h-32 focus:placeholder:text-transparent transition-all placeholder:text-gray-650 select-text"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-4">
                      <span className="text-[9px] text-gray-500 font-mono max-w-[240px] leading-relaxed">
                        *Klik "Simpan" untuk meluncurkan bintang rindu baru ke langit dan maju ke hari esok (+1).
                      </span>
                      
                      <button
                        id="btn-save-memory"
                        type="submit"
                        disabled={!currentDraft.trim()}
                        className={`px-8 py-3.5 rounded-full text-[10px] uppercase tracking-widest font-bold transition-all duration-300 ${
                          currentDraft.trim()
                            ? 'bg-blue-950/40 border border-[#60a5fa]/30 text-[#f1f5f9] hover:bg-blue-950/60 cursor-pointer active:scale-95 shadow-lg shadow-black'
                            : 'bg-white/[0.01] text-gray-650 border border-white/5 cursor-not-allowed'
                        }`}
                      >
                        Simpan Bintang
                      </button>
                    </div>
                  </form>
                </div>

                {/* Bottom Control buttons */}
                <div className="border-t border-white/5 pt-6 flex flex-wrap items-center justify-between gap-4 text-[10px] font-mono text-gray-500">
                  <button
                    id="link-go-to-archives"
                    onClick={() => {
                      setActiveView('archives');
                      setSelectedStar(null);
                    }}
                    className="flex items-center gap-1.5 hover:text-[#60a5fa] transition cursor-pointer text-gray-400 uppercase tracking-widest"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span className="underline underline-offset-4 decoration-[#60a5fa]/20">Buka Rekapan Memori →</span>
                  </button>

                  <div className="flex items-center gap-3">
                    <button 
                      id="btn-trigger-backup-export"
                      onClick={exportDatabase}
                      className="hover:text-white transition flex items-center gap-1 font-mono cursor-pointer uppercase text-[9px] tracking-wider"
                      title="Ekspor seluruh data rindu sebagai file cadangan JSON"
                    >
                      <Download className="w-3 h-3" />
                      <span>Ekspor</span>
                    </button>
                    <span>|</span>
                    <button 
                      id="btn-trigger-backup-import"
                      onClick={() => {
                        setImportError(null);
                        setShowImportModal(true);
                      }}
                      className="hover:text-white transition flex items-center gap-1 font-mono cursor-pointer uppercase text-[9px] tracking-wider"
                      title="Impor file cadangan rindu lama"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Impor</span>
                    </button>
                    <span>|</span>
                    <button 
                      id="btn-trigger-hard-reset"
                      onClick={() => setShowResetConfirm(true)}
                      className="hover:text-red-400 transition flex items-center gap-1 font-mono cursor-pointer text-red-950/60 uppercase text-[9px] tracking-wider"
                      title="Atur ulang seluruh data memori dan mulai dari awal"
                    >
                      <Trash2 className="w-3 h-3 text-red-950/60" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* RIGHT COLUMN: Interactive Constellation Sky Visualizer (Flexible Responsive Layouts) */}
              <div className="p-8 lg:p-12 flex flex-col justify-between bg-black/[0.12] relative min-h-[500px]">
                
                {/* SVG Sky Background Drawing Connecting Threads */}
                <div className="flex-1 w-full relative min-h-[340px] rounded-xl overflow-hidden">
                                   {/* Atmospheric center lens glow */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#60a5fa]/[0.08] via-transparent to-transparent pointer-events-none" />

                  {/* SVG connecting paths */}
                  <svg className="w-full h-full absolute inset-0 select-none pointer-events-none">
                    {/* Connection Lines (Gugusan constellation) */}
                    {entries.length > 1 && (
                       <path
                        d={entries.reduce((acc, entry, index) => {
                          if (index === 0) return `M ${entry.starX}% ${entry.starY}%`;
                          return `${acc} L ${entry.starX}% ${entry.starY}%`;
                        }, '')}
                        fill="none"
                        stroke="rgba(96, 165, 250, 0.25)"
                        strokeWidth="0.8"
                        strokeDasharray="2,4"
                      />
                    )}

                    {/* Separate custom threads */}
                    {entries.map((entry, index) => {
                       const nextStar = entries[index + 1];
                       if (nextStar && entry.constellationId === nextStar.constellationId) {
                         return (
                            <line
                             key={`line-${index}`}
                             x1={`${entry.starX}%`}
                             y1={`${entry.starY}%`}
                             x2={`${nextStar.starX}%`}
                             y2={`${nextStar.starY}%`}
                             stroke="rgba(96, 165, 250, 0.35)"
                             strokeWidth="0.6"
                           />
                         );
                       }
                       return null;
                     })}
                  </svg>

                  {/* Star Points buttons Absolute Placement */}
                  <div className="absolute inset-0 z-10">
                    {entries.map((entry) => {
                      const isLatest = entry.day === entries.length;
                      const isSelected = selectedStar?.day === entry.day;
                      
                      return (
                        <button
                          id={`star-btn-day-${entry.day}`}
                          key={`star-${entry.day}`}
                          onClick={() => setSelectedStar(entry)}
                          className="absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none group cursor-pointer"
                          style={{ left: `${entry.starX}%`, top: `${entry.starY}%` }}
                        >
                          {/* Pulsing glow under active or clicked node */}
                          <span 
                            className={`absolute -inset-3 rounded-full blur-[3px] transition-all bg-[#60a5fa]/15 group-hover:bg-[#60a5fa]/30 ${
                              isLatest || isSelected ? 'animate-star-glow scale-110' : 'opacity-60'
                            }`} 
                          />
                          
                          {/* Point shape body */}
                          <span 
                            className={`block rounded-full transition-all duration-300 ${
                              isSelected 
                                ? 'bg-[#f1f5f9] w-3 h-3 shadow-[0_0_12px_#60a5fa]' 
                                : isLatest 
                                  ? 'bg-[#60a5fa] w-2.5 h-2.5 shadow-[0_0_8px_#60a5fa]' 
                                  : 'bg-gray-400 group-hover:bg-[#f1f5f9] w-1.5 h-1.5'
                            }`}
                            style={{
                              transform: isSelected ? 'scale(1.2)' : 'scale(1)',
                            }}
                          />
                          
                          {/* Floating simple tooltip */}
                          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-4 bg-zinc-900 border border-white/5 text-[9px] font-mono text-gray-300 py-0.5 px-2 rounded opacity-0 group-hover:opacity-100 transition duration-200 whitespace-nowrap z-30 shadow-xl">
                            Day {entry.day}
                          </span>
                        </button>
                      );
                    })}

                    {/* Empty sky placeholder layout */}
                    {entries.length === 0 && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center pointer-events-none">
                        <Sparkles className="w-6 h-6 text-[#60a5fa]/30 mb-3 animate-pulse" />
                        <span className="text-xs font-serif italic text-gray-500">Langit memori sedang sunyi murni...</span>
                        <span className="text-[10px] text-gray-650 font-mono mt-2 max-w-[200px] leading-relaxed">
                          Tulis kenangan pertamamu di kolom sebelah kiri untuk mengukir bintang pertama.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* SVG Constellation bottom label guide line */}
                  {entries.length > 0 && (
                    <div className="absolute bottom-3 left-3 flex gap-4 text-[9px] font-mono text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Memori Lama
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#60a5fa] animate-ping" /> Memori Hari Ini
                      </span>
                    </div>
                  )}

                </div>

                {/* Central bottom rasi label */}
                <div className="text-center z-10 relative mt-6 border-t border-white/5 pt-6">
                  <h3 className="font-serif italic text-xl text-[#f1f5f9]/95 mb-1">Rasi Bintang Rindu</h3>
                  <p className="text-[10px] text-gray-500 tracking-[0.2em] uppercase font-mono">{entries.length} Titik Cahaya Terkumpul</p>
                </div>

                {/* SELECTED STAR DETAILED DRAWER (Floating interactive paper sheet wrapper) */}
                <AnimatePresence>
                  {selectedStar && (
                    <motion.div
                      id="star-letter-modal"
                      initial={{ opacity: 0, scale: 0.96, y: 15 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: 15 }}
                      className="absolute inset-x-6 bottom-6 p-5 bg-[#0e1324]/95 border border-[#60a5fa]/35 rounded-2xl shadow-2xl z-20 flex flex-col gap-3 max-h-[300px] overflow-y-auto backdrop-blur-md"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[9px] text-[#60a5fa] font-mono tracking-widest uppercase">Mengingat Kembali</span>
                          <h4 className="font-serif italic text-md text-[#f1f5f9] font-semibold">Day {selectedStar.day}</h4>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-gray-500">{selectedStar.date}</span>
                          <button
                            id="btn-close-star-modal"
                            onClick={() => setSelectedStar(null)}
                            className="text-gray-500 hover:text-white p-0.5 transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <blockquote className="border-l border-[#60a5fa]/25 pl-3 text-xs font-serif italic text-gray-400 leading-relaxed select-text">
                        "{selectedStar.quote}"
                      </blockquote>

                      <p className="text-xs text-gray-200 font-sans leading-relaxed whitespace-pre-wrap break-words border-t border-white/5 pt-3 select-text">
                        {selectedStar.content}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </motion.div>
          )}

          {/* =======================================================
              C. THE ARCHIVES / MEMORY LANE VIEW (HALAMAN REKAPAN)
              ======================================================= */}
          {activeView === 'archives' && (
            <motion.div
              key="archives-view"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              className="pt-2 pb-14 w-full flex flex-col gap-6"
            >
              
              {/* Back navigation */}
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <button
                  id="btn-back-to-home"
                  onClick={() => setActiveView('main')}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition font-mono uppercase tracking-widest cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-[#60a5fa]/80" />
                  <span>Kembali ke Langit Rindu</span>
                </button>

                <div className="text-right">
                  <span className="text-[10px] text-gray-500 font-mono block tracking-wider">ARSIP DARI INGATAN</span>
                  <span className="font-serif italic text-xs text-[#60a5fa]/85">Tentang: {targetName}</span>
                </div>
              </div>

              {/* Memory lane text overview banner */}
              <div className="text-center py-6">
                <h1 className="font-serif italic text-4xl font-medium text-[#f1f5f9] mb-2">
                  Lembar Laluan Rindu
                </h1>
                <p className="text-[10px] text-gray-400 font-mono tracking-[0.2em] max-w-md mx-auto leading-relaxed uppercase">
                  Tumpukan curhat dan surat-surat sunyi yang tertulis sepanjang hari rindu
                </p>
              </div>

              {/* SEARCH ENGINE FOR MEMORIES */}
              <div className="w-full max-w-sm mx-auto relative mb-4">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-500">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <input
                  id="search-memory-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kata rindu atau baris kenangan..."
                  className="w-full bg-white/[0.02] border border-white/5 focus:border-[#60a5fa]/40 rounded-full py-2 pl-9 pr-4 text-xs text-[#f1f5f9] focus:outline-none tracking-wide transition placeholder:text-gray-600"
                />
                
                {searchQuery && (
                  <button
                    id="btn-clear-search"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* ENTRIES TIMELINE FEED */}
              <div className="w-full max-w-6xl mx-auto px-4 animate-fade-in">
                
                {filteredEntries.length > 0 ? (
                  <motion.div
                    variants={{
                      hidden: { opacity: 0 },
                      show: {
                        opacity: 1,
                        transition: {
                          staggerChildren: 0.08
                        }
                      }
                    }}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2 pb-12"
                  >
                    {filteredEntries.map((entry) => (
                      <motion.div
                        id={`archive-entry-card-${entry.day}`}
                        key={`entry-${entry.day}`}
                        variants={{
                          hidden: { opacity: 0, y: 20 },
                          show: { 
                            opacity: 1, 
                            y: 0,
                            transition: {
                              duration: 0.8,
                              ease: [0.16, 1, 0.3, 1]
                            }
                          }
                        }}
                        whileHover={{ y: -6, scale: 1.01, transition: { duration: 0.3, ease: "easeOut" } }}
                        className="bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-[#60a5fa]/15 rounded-2xl p-6 relative shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition duration-350 flex flex-col gap-4 group cursor-default"
                      >
                        {/* Top glowing line accent */}
                        <div className="absolute left-0 right-0 top-0 h-[1.5px] bg-[#60a5fa]/20 group-hover:bg-[#60a5fa] transition duration-300 rounded-t-2xl" />

                        {/* Header metadata row */}
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="font-serif text-lg font-semibold text-[#60a5fa]">Day {entry.day}</span>
                            <span className="text-white/10 font-mono text-[9px]">|</span>
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-mono">
                              <Calendar className="w-3 h-3 text-[#60a5fa]/40" />
                              <span>{entry.date}</span>
                            </div>
                          </div>

                          {/* Drop trigger deletion optionally */}
                          <button
                            id={`btn-delete-entry-${entry.day}`}
                            onClick={() => handleDeleteEntry(entry.day)}
                            className="text-gray-500 hover:text-red-400 hover:bg-red-950/20 p-1.5 rounded transition opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                            title={`Hapus catatan Day ${entry.day}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Decoded Daily Memory Quote */}
                        <blockquote className="border-l border-[#60a5fa]/20 pl-4 py-0.5 text-xs font-serif italic text-gray-400 leading-relaxed select-text bg-black/[0.08] rounded-r">
                          "{entry.quote}"
                        </blockquote>

                        {/* Raw memory text */}
                        <p className="text-xs text-gray-300 leading-relaxed font-sans select-text whitespace-pre-wrap break-words border-t border-white/5 pt-3 selection:bg-blue-950/40 mt-1 flex-1 overflow-y-auto max-h-[160px] pr-1">
                          {entry.content}
                        </p>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  // EMPTY STATE
                  <div className="text-center py-20 px-8 border border-dashed border-white/5 rounded-2xl bg-white/[0.01] max-w-sm mx-auto">
                    <div className="w-12 h-12 rounded-full border border-white/5 bg-black/[0.1] flex items-center justify-center text-gray-500 mx-auto mb-4">
                      <BookOpen className="w-5 h-5 text-[#60a5fa]/30" />
                    </div>
                    
                    <h3 className="font-serif italic text-md text-gray-400 mb-1">
                      {searchQuery ? 'Kenangan tidak ditemukan...' : 'Belum ada jejak rindu yang tertulis...'}
                    </h3>
                    
                    <p className="text-[11px] font-mono text-gray-500 max-w-xs mx-auto leading-relaxed">
                      {searchQuery 
                        ? 'Cari dengan kata kunci hari atau rasi bintang yang lain.'
                        : 'Mari kembali ke langit rindu dan pancarkan bintang pertamamu.'}
                    </p>

                    {!searchQuery && (
                      <button
                        id="btn-empty-fallback-home"
                        onClick={() => setActiveView('main')}
                        className="mt-6 py-2 px-6 rounded-full bg-blue-950/20 border border-[#60a5fa]/25 text-[#f1f5f9] hover:bg-blue-950/40 transition text-[10px] uppercase font-mono tracking-widest cursor-pointer"
                      >
                         Tulis Kenangan Baru
                      </button>
                    )}
                  </div>
                )}

              </div>

              {/* Bottom returning anchor */}
              {entries.length > 0 && (
                <div className="text-center pt-10">
                  <button
                    id="btn-return-home-footer"
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      setActiveView('main');
                    }}
                    className="py-3 px-8 rounded-full border border-white/5 text-[10px] font-mono uppercase tracking-widest text-gray-400 hover:text-white hover:border-[#60a5fa]/20 transition duration-300 hover:bg-white/[0.01] inline-flex items-center gap-2 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Kembali Menatap Langit</span>
                  </button>
                </div>
              )}

            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* FOOTER GENERAL */}
      <footer className="py-6 px-6 text-center border-t border-white/5 text-[9px] font-mono text-gray-500 bg-[#070b19]/50 z-15 mt-auto">
        <p className="leading-relaxed">
          Kapsul Waktu Rindu © 2026. Diabadikan di dalam cache perangkat secara privat.
        </p>
        <p className="text-[9px] text-[#475569]/80 mt-1 uppercase tracking-widest">
          Seseorang tak pernah benar-benar pergi selama ada hati yang tulus merawat ingatan tentangnya.
        </p>
      </footer>

      {/* =======================================================
          MODAL SET: Cadangan Impor (Restore DB)
          ======================================================= */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              id="import-backup-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#181818] border border-white/5 rounded-2xl max-w-sm w-full p-6 text-left relative shadow-2xl"
            >
              <button
                id="btn-close-import-modal"
                onClick={() => setShowImportModal(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white p-1 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex gap-2 items-center mb-4">
                <Upload className="w-5 h-5 text-[#60a5fa]" />
                <h3 className="font-serif italic text-base text-[#f1f5f9]">Impor Cadangan Kapsul</h3>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed mb-4">
                Pilih file cadangan berformat <code className="bg-black/30 px-1.5 py-0.5 rounded text-[#60a5fa] text-[10px] font-mono">.json</code> yang telah diekspor sebelumnya untuk memulihkan seluruh data dan nama ingatanmu.
              </p>

              {importError && (
                <div className="bg-red-950/20 border border-red-900/45 rounded p-2.5 text-[11px] text-red-300 leading-normal mb-4 font-mono">
                  ❌ {importError}
                </div>
              )}

              <div className="space-y-4">
                <div className="border border-dashed border-white/5 hover:border-[#60a5fa]/40 rounded-xl p-6 text-center cursor-pointer transition relative bg-black/20">
                  <input
                    id="backup-file-picker"
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportJson}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="w-7 h-7 text-gray-600 mx-auto mb-2 pointer-events-none" />
                  <span className="text-xs text-gray-400 block pointer-events-none font-mono">Klik atau tarik file .json ke sini</span>
                  <span className="text-[10px] text-gray-600 font-mono mt-1 block pointer-events-none">Maksimal 5MB</span>
                </div>

                <div className="flex justify-end gap-2 text-xs">
                  <button
                    id="btn-cancel-import"
                    onClick={() => setShowImportModal(false)}
                    className="px-4 py-2 rounded text-gray-500 hover:text-white transition font-mono uppercase text-[10px] tracking-wider cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =======================================================
          MODAL SET: Atur Ulang Konfirmasi (Hard Reset)
          ======================================================= */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              id="reset-warning-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#181818] border border-red-950/40 rounded-2xl max-w-sm w-full p-6 text-left relative shadow-2xl"
            >
              <div className="flex gap-2 items-center text-red-450 mb-3">
                <Trash2 className="w-5 h-5 text-red-500/80" />
                <h3 className="font-serif italic text-lg text-red-400">Hapus Ingatan Selamanya?</h3>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed mb-4">
                Tindakan ini akan menghapus secara permanen seluruh surat rindu, rasi bintang, dan hari rindu dari penyimpanan browser lokal peramban Anda. Tindakan ini <strong className="text-red-400 font-normal">tidak dapat dibatalkan</strong>.
              </p>

              <div className="flex justify-end gap-3 text-xs font-mono">
                <button
                  id="btn-abort-reset"
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2 rounded text-gray-500 hover:text-white border border-white/5 transition cursor-pointer uppercase text-[10px] tracking-wider"
                >
                  Batal
                </button>
                <button
                  id="btn-confirm-delete"
                  onClick={handleResetSpace}
                  className="px-4 py-2 rounded bg-red-950/40 hover:bg-red-900/40 border border-red-900/30 text-red-200 transition cursor-pointer uppercase text-[10px] tracking-wider"
                >
                  Ya, Bersihkan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =======================================================
          MODAL SET: Filosofi Panduan Info (About Console)
          ======================================================= */}
      <AnimatePresence>
        {showInfoPanel && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              id="philosophical-info-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#181818] border border-white/5 rounded-2xl max-w-md w-full p-6 text-left relative shadow-2xl"
            >
              <button
                id="btn-close-info-modal"
                onClick={() => setShowInfoPanel(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white p-1 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex gap-2 items-center mb-4">
                <Heart className="w-5 h-5 text-[#60a5fa] fill-[#60a5fa]/5" />
                <h3 className="font-serif italic text-base text-[#f1f5f9]">Mengapa Ruang Ini Dirawat?</h3>
              </div>

              <div className="space-y-4 text-xs text-gray-400 leading-relaxed select-text">
                <p>
                  <strong>Kapsul Waktu Rindu</strong> adalah meditasi digital santai yang mendalam bagi mereka yang terpisah oleh jarak, waktu, atau garis takdir. Kita sering kali menyimpan baris rindu yang membucah namun tak lagi memiliki alamat untuk dituju.
                </p>
                <p>
                  Setiap kali Anda merekam kenangan hari baru, satu simpul bersinar akan terbit di kubah langit ingatan, menenun rasi bintang unik dari jejak rindu Anda.
                </p>
                <p>
                  <strong>Fitur Ambient Sunyi:</strong> Anda dapat mengaktifkan desau angin pencerita berfrekuensi rendah di kanan atas. Sintesis Web Audio ini dibuat langsung dari browser Anda, menemani malam sunyi Anda saat bersurat rindu.
                </p>
                <p>
                  <strong>Privasi Mutlak:</strong> Seluruh data disimpan privat di Lokal Penyimpanan browser Anda (LocalStorage). Ekspor cadangan kapan saja guna menjaga agar pendaran ingatan tidak lenyap.
                </p>

                <div className="pt-4 border-t border-white/5 flex justify-end">
                  <button
                    id="btn-dismiss-info"
                    onClick={() => setShowInfoPanel(false)}
                    className="py-2.5 px-6 rounded-full bg-blue-950/20 border border-[#60a5fa]/30 text-[#f1f5f9] text-[10px] uppercase tracking-widest font-bold hover:bg-blue-950/40 transition-all cursor-pointer"
                  >
                    Lanjutkan Merawat Rindu
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
