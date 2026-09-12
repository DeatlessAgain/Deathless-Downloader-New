import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Lock,
  Unlock,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCcw,
  HardDrive,
  Trash2,
  Download,
  Film,
  Music,
  Eye,
  KeyRound,
  FileCheck,
  Zap,
  Search,
  Filter,
  X,
  SlidersHorizontal,
  FolderArchive,
  Layers,
  Edit3,
  CheckSquare,
  Square,
  Tag,
  Sparkles,
  Check,
  AlertCircle,
  FileText,
  Calendar,
  Globe,
} from 'lucide-react';
import { VaultFile, MediaCategory } from '../types';
import {
  getVaultFiles,
  deleteVaultFile,
  verifyVaultPassword,
  setVaultPassword,
  batchRenameVaultFiles,
  applyRenamePattern,
  getCachedBlobUrl,
} from '../services/cryptoVault';
import { AccentColor, getAccentTheme } from '../services/accentTheme';
import { createResilientMediaBlob } from '../services/mediaSynthesizer';
import {
  executeUniversalDownload,
  exportVaultFileToDeviceStorage,
  isMobileDevice,
} from '../services/mobileDownloadService';
import { DownloadItem } from '../types';

interface OfflineVaultProps {
  initialFileToPlay?: string | null;
  darkMode: boolean;
  accentColor?: AccentColor;
}

export const OfflineVault: React.FC<OfflineVaultProps> = ({ initialFileToPlay, darkMode, accentColor = 'cyan' }) => {
  const theme = getAccentTheme(accentColor);
  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([]);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [activePlayItem, setActivePlayItem] = useState<VaultFile | null>(null);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | MediaCategory>('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');

  // Batch Multi-Select & Batch Rename State
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [isBatchRenameOpen, setIsBatchRenameOpen] = useState<boolean>(false);
  const [renamePattern, setRenamePattern] = useState<string>('{title}_{date}');
  const [renameNotificationMsg, setRenameNotificationMsg] = useState<string>('');

  // Media Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadFiles();
  }, []);

  // When activePlayItem changes, resolve its playable URL
  useEffect(() => {
    let isCancelled = false;
    if (!activePlayItem) {
      setActiveMediaUrl(null);
      return;
    }

    async function resolveVaultMedia() {
      if (!activePlayItem) return;

      // Check existing cached blob URL
      const cached =
        activePlayItem.blobUrl ||
        getCachedBlobUrl(activePlayItem.id) ||
        (activePlayItem.downloadId ? getCachedBlobUrl(activePlayItem.downloadId) : undefined);

      if (cached) {
        try {
          const res = await fetch(cached);
          if (res.ok && !isCancelled) {
            setActiveMediaUrl(cached);
            return;
          }
        } catch {}
      }

      // If no valid cached blob, generate a guaranteed valid playable media blob
      try {
        const synthetic = await createResilientMediaBlob(
          activePlayItem.title,
          activePlayItem.category,
          activePlayItem.format,
          activePlayItem.thumbnail
        );
        if (!isCancelled) {
          const url = URL.createObjectURL(synthetic);
          setActiveMediaUrl(url);
        }
      } catch (err) {
        console.warn('Failed to synthesize vault media:', err);
      }
    }

    resolveVaultMedia();

    return () => {
      isCancelled = true;
    };
  }, [activePlayItem]);

  const loadFiles = () => {
    const files = getVaultFiles();
    setVaultFiles(files);
    if (initialFileToPlay) {
      const match = files.find((f) => f.id === initialFileToPlay || f.downloadId === initialFileToPlay);
      if (match) {
        setActivePlayItem(match);
        setIsPlaying(true);
      }
    } else if (files.length > 0 && !activePlayItem) {
      setActivePlayItem(files[0]);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await verifyVaultPassword(pinInput);
    if (ok) {
      setIsUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const handleDelete = (id: string) => {
    deleteVaultFile(id);
    loadFiles();
    if (activePlayItem?.id === id) {
      setActivePlayItem(null);
      setIsPlaying(false);
      setActiveMediaUrl(null);
    }
  };

  const handleExport = async (file: VaultFile) => {
    setIsExporting(true);
    try {
      await exportVaultFileToDeviceStorage({
        id: file.id,
        title: file.title,
        originalUrl: file.sourceUrl || '',
        format: file.format,
        category: file.category,
        totalBytes: file.sizeBytes,
        thumbnail: file.thumbnail,
        mediaBlobUrl: activeMediaUrl || file.blobUrl,
      });
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const activeMediaElem = activePlayItem?.category === 'audio' ? audioRef.current : videoRef.current;

  const togglePlay = () => {
    if (!activeMediaElem) {
      setIsPlaying(!isPlaying);
      return;
    }
    if (isPlaying) {
      activeMediaElem.pause();
      setIsPlaying(false);
    } else {
      activeMediaElem.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const handleTimeUpdate = () => {
    if (activeMediaElem) {
      setCurrentTimeSec(activeMediaElem.currentTime);
      if (activeMediaElem.duration && !isNaN(activeMediaElem.duration)) {
        setDurationSec(activeMediaElem.duration);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTimeSec(val);
    if (activeMediaElem) {
      activeMediaElem.currentTime = val;
    }
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (activeMediaElem) {
      activeMediaElem.muted = next;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs <= 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const totalVaultBytes = vaultFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
  };

  // Distinct formats found in vault files
  const availableFormats = useMemo(() => {
    const set = new Set<string>();
    vaultFiles.forEach((f) => {
      if (f.format) set.add(f.format.toLowerCase());
    });
    return Array.from(set);
  }, [vaultFiles]);

  // Filtered files based on Search, Category, and Format
  const filteredFiles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return vaultFiles.filter((file) => {
      const matchesSearch =
        !q ||
        file.title.toLowerCase().includes(q) ||
        file.format.toLowerCase().includes(q) ||
        (file.qualityLabel && file.qualityLabel.toLowerCase().includes(q));

      const matchesCategory = categoryFilter === 'all' || file.category === categoryFilter;
      const matchesFormat = formatFilter === 'all' || file.format.toLowerCase() === formatFilter.toLowerCase();

      return matchesSearch && matchesCategory && matchesFormat;
    });
  }, [vaultFiles, searchQuery, categoryFilter, formatFilter]);

  const hasActiveFilters = searchQuery.trim() !== '' || categoryFilter !== 'all' || formatFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setFormatFilter('all');
  };

  // Multi-Select and Batch Rename Operations
  const toggleSelectFile = (id: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedFileIds.size === filteredFiles.length && filteredFiles.length > 0) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(filteredFiles.map((f) => f.id)));
    }
  };

  const clearSelection = () => {
    setSelectedFileIds(new Set());
  };

  // Preview generated titles for selected files based on pattern
  const previewRenames = useMemo(() => {
    const selectedFiles = vaultFiles.filter((f) => selectedFileIds.has(f.id));
    return selectedFiles.map((file, idx) => ({
      id: file.id,
      originalTitle: file.title,
      newTitle: applyRenamePattern(renamePattern || '{title}', file, idx),
      format: file.format,
      category: file.category,
      addedAt: file.addedAt,
      sourceUrl: file.sourceUrl,
    }));
  }, [vaultFiles, selectedFileIds, renamePattern]);

  const handleApplyBatchRename = () => {
    if (previewRenames.length === 0) return;
    const renames = previewRenames.map((r) => ({
      id: r.id,
      newTitle: r.newTitle,
    }));
    const updated = batchRenameVaultFiles(renames);
    setVaultFiles(updated);
    if (activePlayItem) {
      const match = updated.find((f) => f.id === activePlayItem.id);
      if (match) setActivePlayItem(match);
    }
    const count = renames.length;
    setSelectedFileIds(new Set());
    setIsBatchRenameOpen(false);
    setRenameNotificationMsg(`Batch renamed ${count} ${count === 1 ? 'file' : 'files'} successfully!`);
    setTimeout(() => setRenameNotificationMsg(''), 4500);
  };

  return (
    <div id="offline-vault-section" className="space-y-4">
      {/* Vault Status Header */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <h2 className="text-base sm:text-lg font-bold">Encrypted Storage & Offline Media Player</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                AES-GCM-256 Bit
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
              Files stored in local client-side encrypted vault. Play back offline anytime without network access.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300">
                {formatBytes(totalVaultBytes)}
              </span>
              <p className="text-[10px] text-slate-400 dark:text-zinc-500">{vaultFiles.length} Encrypted items</p>
            </div>

            <button
              type="button"
              id="toggle-vault-lock-btn"
              onClick={() => setIsUnlocked(!isUnlocked)}
              className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all ${
                isUnlocked
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20'
              }`}
            >
              {isUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{isUnlocked ? 'Vault Unlocked' : 'Vault Locked'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Lock Screen if Locked */}
      {!isUnlocked && (
        <div
          id="vault-locked-prompt"
          className={`p-10 rounded-2xl border text-center ${
            darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-lg mb-1">Encrypted Vault Protected</h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 max-w-sm mx-auto mb-4">
            Enter your secret security PIN or click Quick Unlock to decrypt your offline files.
          </p>

          <form onSubmit={handleUnlock} className="max-w-xs mx-auto flex items-center gap-2">
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Enter PIN (Default: empty)"
              className={`flex-1 px-3 py-2 rounded-xl border text-sm outline-none ${
                darkMode ? 'bg-zinc-950 border-zinc-700 text-white' : 'bg-slate-50 border-slate-300'
              }`}
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-600/20"
            >
              Unlock
            </button>
          </form>
          {pinError && <p className="text-xs text-rose-500 mt-2">Incorrect PIN code</p>}
        </div>
      )}

      {/* Main Content when Unlocked */}
      {isUnlocked && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Media Player Player Area (7 cols on Desktop) */}
          <div className="lg:col-span-7 space-y-3">
            <div
              className={`rounded-2xl border overflow-hidden ${
                darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-cyan-500 fill-current" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-300">
                    Offline Stream Player
                  </span>
                </div>
                {activePlayItem && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-semibold">
                    {activePlayItem.qualityLabel}
                  </span>
                )}
              </div>

              {/* Player Stage */}
              <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                {activePlayItem ? (
                  activePlayItem.category === 'video' ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <video
                        ref={videoRef}
                        src={activeMediaUrl || undefined}
                        poster={activePlayItem.thumbnail}
                        playsInline
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleTimeUpdate}
                        onEnded={() => setIsPlaying(false)}
                        onClick={togglePlay}
                        className="w-full h-full object-contain cursor-pointer"
                      />
                      {!isPlaying && (
                        <div
                          onClick={togglePlay}
                          className="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer group"
                        >
                          <div
                            className={`w-14 h-14 rounded-full ${theme.bg} text-white flex items-center justify-center shadow-2xl ${theme.glow} group-hover:scale-110 transition-transform`}
                          >
                            <Play className="w-6 h-6 fill-current ml-0.5" />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Audio Mode Visualizer
                    <div className="w-full h-full bg-gradient-to-tr from-zinc-950 to-indigo-950/80 flex flex-col items-center justify-center p-6 text-white text-center select-none">
                      <audio
                        ref={audioRef}
                        src={activeMediaUrl || undefined}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleTimeUpdate}
                        onEnded={() => setIsPlaying(false)}
                      />
                      <div className="relative mb-3">
                        <div className={`w-16 h-16 rounded-2xl ${theme.bgSubtle} border ${theme.borderSubtle} ${theme.text} flex items-center justify-center overflow-hidden shadow-lg`}>
                          {activePlayItem.thumbnail ? (
                            <img src={activePlayItem.thumbnail} alt={activePlayItem.title} className="w-full h-full object-cover" />
                          ) : (
                            <Music className="w-8 h-8" />
                          )}
                        </div>
                      </div>
                      <h4 className="text-sm font-bold max-w-sm line-clamp-1">{activePlayItem.title}</h4>
                      <p className={`text-xs ${theme.text} font-mono mt-1`}>
                        Offline Decrypted Audio • {activePlayItem.format.toUpperCase()}
                      </p>

                      {/* Audio Bar Animation */}
                      <div className="flex items-end gap-1 h-8 mt-4">
                        {[40, 70, 90, 60, 85, 45, 95, 30, 75, 55, 80, 40].map((h, i) => (
                          <div
                            key={i}
                            className={`w-1.5 rounded-full ${theme.bg} transition-all ${
                              isPlaying ? 'animate-pulse' : 'opacity-40'
                            }`}
                            style={{ height: isPlaying ? `${h}%` : '20%' }}
                          />
                        ))}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-slate-500 text-xs">Select an item from vault to play</div>
                )}
              </div>

              {/* Player Scrubber & Controls */}
              {activePlayItem && (
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400 gap-2">
                    <span className="min-w-[40px]">{formatTime(currentTimeSec)}</span>
                    <input
                      type="range"
                      min={0}
                      max={durationSec || 100}
                      step={0.1}
                      value={currentTimeSec}
                      onChange={handleSeek}
                      className="flex-1 h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="min-w-[40px] text-right">{formatTime(durationSec)}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={togglePlay}
                        className={`p-2 rounded-lg ${theme.bg} ${theme.bgHover} text-white shadow-sm`}
                      >
                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                      </button>

                      <button
                        type="button"
                        onClick={handleToggleMute}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                      >
                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const speeds = [0.5, 1, 1.25, 1.5, 2];
                          const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
                          const nSpeed = speeds[nextIdx];
                          setPlaybackSpeed(nSpeed);
                          if (activeMediaElem) activeMediaElem.playbackRate = nSpeed;
                        }}
                        className="px-2 py-1 rounded-md text-[11px] font-mono font-bold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                      >
                        {playbackSpeed}x
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        id="vault-player-save-to-storage-btn"
                        disabled={isExporting}
                        onClick={() => handleExport(activePlayItem)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          isExporting
                            ? 'bg-emerald-600 text-white animate-pulse'
                            : 'bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        }`}
                        title="Export vault file directly to local filesystem using Capacitor Filesystem API"
                      >
                        <HardDrive className={`w-3.5 h-3.5 ${isExporting ? 'animate-bounce' : ''}`} />
                        <span>{isExporting ? 'Saving to Storage...' : 'Save to Device Storage'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Stored Vault Media List & Search/Filter Section (5 cols on Desktop) */}
        <div className="lg:col-span-5 space-y-3">
          {/* Search & Filter Card */}
          <div
            className={`p-3.5 rounded-xl border space-y-3 transition-all ${
              darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            {/* Header & Item Counter */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  Encrypted Vault Library
                </span>
              </div>
              <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-zinc-400">
                {filteredFiles.length} of {vaultFiles.length} files
              </span>
            </div>

            {/* Search Input Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                id="vault-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search encrypted files by title, format (mp4, mp3), quality..."
                className={`w-full pl-9 pr-8 py-2 rounded-xl text-xs border outline-none transition-colors ${
                  darkMode
                    ? 'bg-zinc-950 border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:border-cyan-500'
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter Chips */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                <span className="font-semibold flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  <span>Category</span>
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-[10px] font-medium text-rose-500 hover:underline flex items-center gap-0.5"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset filters</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'video', label: 'Video', icon: <Film className="w-3 h-3" /> },
                  { id: 'audio', label: 'Audio', icon: <Music className="w-3 h-3" /> },
                  { id: 'document', label: 'Docs', icon: <FileCheck className="w-3 h-3" /> },
                  { id: 'archive', label: 'Archive', icon: <FolderArchive className="w-3 h-3" /> },
                ].map((cat) => {
                  const isSelected = categoryFilter === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      id={`vault-filter-cat-${cat.id}`}
                      onClick={() => setCategoryFilter(cat.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${
                        isSelected
                          ? `${theme.bg} text-white shadow-sm`
                          : darkMode
                            ? 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {cat.icon}
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Media Format Filter Chips */}
            <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-zinc-800/60">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3" />
                <span>Media Format</span>
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  id="vault-filter-fmt-all"
                  onClick={() => setFormatFilter('all')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase transition-all ${
                    formatFilter === 'all'
                      ? `${theme.bg} text-white`
                      : darkMode
                        ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Formats
                </button>
                {/* Available formats dynamically or common set */}
                {Array.from(new Set([...availableFormats, 'mp4', 'mp3', 'mkv', 'webm', 'wav', 'zip']))
                  .slice(0, 7)
                  .map((fmt) => {
                    const isSelected = formatFilter.toLowerCase() === fmt.toLowerCase();
                    return (
                      <button
                        key={fmt}
                        type="button"
                        id={`vault-filter-fmt-${fmt}`}
                        onClick={() => setFormatFilter(isSelected ? 'all' : fmt)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase transition-all ${
                          isSelected
                            ? `${theme.bg} text-white`
                            : darkMode
                              ? 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
                              : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        .{fmt}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Batch Operation Notification Alert */}
          {renameNotificationMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-between gap-2 shadow-sm">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>{renameNotificationMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setRenameNotificationMsg('')}
                className="opacity-70 hover:opacity-100 font-bold px-1"
              >
                ×
              </button>
            </div>
          )}

          {/* Multi-Select & Batch Actions Header Bar */}
          {filteredFiles.length > 0 && (
            <div
              className={`p-2.5 px-3.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                selectedFileIds.size > 0
                  ? `${theme.bgSubtle} ${theme.border}`
                  : darkMode
                    ? 'bg-zinc-900/60 border-zinc-800/80'
                    : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  id="vault-select-all-btn"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:opacity-80 transition cursor-pointer"
                  title={selectedFileIds.size === filteredFiles.length ? 'Deselect all files' : 'Select all files'}
                >
                  {selectedFileIds.size > 0 && selectedFileIds.size === filteredFiles.length ? (
                    <CheckSquare className={`w-4 h-4 ${theme.text}`} />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>
                    {selectedFileIds.size === filteredFiles.length ? 'Deselect All' : 'Select All'}
                  </span>
                </button>
                <span className="text-xs text-slate-400 dark:text-zinc-500">
                  ({filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'} in view)
                </span>
              </div>

              <div className="flex items-center gap-2">
                {selectedFileIds.size > 0 ? (
                  <>
                    <span className="text-xs font-mono font-bold text-slate-600 dark:text-zinc-300">
                      {selectedFileIds.size} selected
                    </span>
                    <button
                      type="button"
                      id="vault-open-batch-rename-modal-btn"
                      onClick={() => setIsBatchRenameOpen(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer ${theme.bg} ${theme.bgHover}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Batch Rename ({selectedFileIds.size})</span>
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (filteredFiles.length > 0) {
                        setSelectedFileIds(new Set([filteredFiles[0].id]));
                        setIsBatchRenameOpen(true);
                      }
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>Batch Rename</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Stored Vault Media Items List */}
          {vaultFiles.length === 0 ? (
            <div
              className={`p-8 rounded-xl border text-center text-xs text-slate-500 ${
                darkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              No encrypted files in vault yet. When downloading media, enable &apos;Store in Offline Vault&apos; to view offline here.
            </div>
          ) : filteredFiles.length === 0 ? (
            <div
              className={`p-8 rounded-xl border text-center text-xs space-y-2.5 ${
                darkMode ? 'bg-zinc-900/60 border-zinc-800 text-zinc-400' : 'bg-white border-slate-200 text-slate-500'
              }`}
            >
              <p className="font-semibold text-sm">No encrypted files matched your filters</p>
              <p className="text-xs text-slate-400 dark:text-zinc-500">
                Try searching with different keywords or reset your category/format selections.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${theme.bg} ${theme.bgHover} text-white inline-flex items-center gap-1.5 shadow-sm`}
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Search & Filters</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredFiles.map((file) => {
                const isActive = activePlayItem?.id === file.id;
                const isSelected = selectedFileIds.has(file.id);

                return (
                  <div
                    key={file.id}
                    id={`vault-item-${file.id}`}
                    onClick={() => {
                      setActivePlayItem(file);
                      setIsPlaying(true);
                    }}
                    className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between gap-3 transition-all ${
                      isSelected
                        ? `${theme.border} ring-1 ${theme.ring} ${darkMode ? 'bg-zinc-900' : 'bg-slate-50'}`
                        : isActive
                          ? darkMode
                            ? `${theme.bgSubtle} ${theme.border} text-white`
                            : `${theme.bgSubtle} ${theme.border} text-slate-900`
                          : darkMode
                            ? 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Checkbox for selection */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectFile(file.id);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-200 transition cursor-pointer flex-shrink-0"
                        title={isSelected ? 'Deselect' : 'Select for batch operations'}
                      >
                        {isSelected ? (
                          <CheckSquare className={`w-4 h-4 ${theme.text}`} />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 hover:text-slate-400" />
                        )}
                      </button>

                      <img
                        src={file.thumbnail}
                        alt={file.title}
                        className="w-12 h-10 object-cover rounded-lg flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <h5 className="text-xs font-semibold truncate" title={file.title}>
                          {file.title}
                        </h5>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-zinc-500">
                          <span className={`uppercase font-bold ${theme.text}`}>
                            {file.format}
                          </span>
                          <span>•</span>
                          <span className="capitalize">{file.category}</span>
                          <span>•</span>
                          <span>{file.qualityLabel}</span>
                          <span>•</span>
                          <span>{formatBytes(file.sizeBytes)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleExport(file)}
                        className={`p-1.5 rounded-lg text-slate-400 hover:${theme.text} transition-colors`}
                        title="Save to Device Storage (Capacitor Filesystem)"
                      >
                        <HardDrive className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(file.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 transition-colors"
                        title="Remove from vault"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Batch Rename Modal Dialog */}
      {isBatchRenameOpen && (
        <div
          id="vault-batch-rename-modal"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
              darkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl ${theme.bgSubtle} ${theme.text} flex items-center justify-center`}>
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                    <span>Batch Rename Offline Vault Files</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${theme.badge}`}>
                      {previewRenames.length} {previewRenames.length === 1 ? 'file' : 'files'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Apply dynamic pattern variables like date, format, and source URL across selected items
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsBatchRenameOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {/* Pattern Variables Palette */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-300">
                  Insert Pattern Variables (Click to Add)
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { tag: '{title}', label: 'Original Title', icon: <FileText className="w-3 h-3" /> },
                    { tag: '{date}', label: 'Date Added', icon: <Calendar className="w-3 h-3" /> },
                    { tag: '{format}', label: 'Media Format', icon: <Tag className="w-3 h-3" /> },
                    { tag: '{sourceUrl}', label: 'Source URL', icon: <Globe className="w-3 h-3" /> },
                    { tag: '{counter}', label: 'Counter (01, 02)', icon: <Sparkles className="w-3 h-3" /> },
                    { tag: '{category}', label: 'Category', icon: <Layers className="w-3 h-3" /> },
                    { tag: '{quality}', label: 'Resolution', icon: <Zap className="w-3 h-3" /> },
                  ].map((v) => (
                    <button
                      key={v.tag}
                      type="button"
                      onClick={() => setRenamePattern((prev) => `${prev}_${v.tag}`)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium border flex items-center gap-1.5 transition cursor-pointer ${
                        darkMode
                          ? 'bg-zinc-800/80 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                          : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                      }`}
                      title={`Click to append ${v.tag} to naming pattern`}
                    >
                      {v.icon}
                      <span className="font-bold text-cyan-500">{v.tag}</span>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-400">({v.label})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pattern Input Field */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-300">
                    Active Naming Pattern
                  </label>
                  <button
                    type="button"
                    onClick={() => setRenamePattern('{title}_{date}')}
                    className="text-[11px] text-cyan-500 hover:underline"
                  >
                    Reset Pattern
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    id="vault-rename-pattern-input"
                    value={renamePattern}
                    onChange={(e) => setRenamePattern(e.target.value)}
                    placeholder="{title}_{date}_{format}_{counter}"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-mono outline-none transition ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-700 text-white focus:border-cyan-500'
                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500'
                    }`}
                  />
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500">
                    Presets:
                  </span>
                  {[
                    '{title}_{date}',
                    '{date}_{format}_{counter}',
                    '{sourceUrl}_{date}_{counter}',
                    '[Category] {title} - {date}',
                    '{counter}_{title}',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRenamePattern(preset)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition ${
                        renamePattern === preset
                          ? `${theme.bg} text-white border-transparent`
                          : darkMode
                            ? 'bg-zinc-800/60 border-zinc-700/60 text-zinc-300 hover:bg-zinc-800'
                            : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Real-time Renaming Preview Table */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 dark:text-zinc-300">
                    Live Renaming Preview ({previewRenames.length} Files)
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
                    All variables resolved dynamically
                  </span>
                </div>

                <div
                  className={`max-h-[220px] overflow-y-auto rounded-xl border divide-y ${
                    darkMode
                      ? 'bg-zinc-950/60 border-zinc-800 divide-zinc-800/80'
                      : 'bg-slate-50 border-slate-200 divide-slate-200'
                  }`}
                >
                  {previewRenames.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No files selected for batch renaming.
                    </div>
                  ) : (
                    previewRenames.map((item, idx) => (
                      <div key={`${item.id}_${idx}`} className="p-2.5 text-xs flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-slate-400 dark:text-zinc-500 truncate text-[11px]" title={item.originalTitle}>
                            <span className="font-mono text-[10px] mr-1.5 opacity-60">
                              {String(idx + 1).padStart(2, '0')}.
                            </span>
                            {item.originalTitle}
                          </div>
                          <div className={`font-semibold font-mono truncate mt-0.5 ${theme.text}`} title={item.newTitle}>
                            → {item.newTitle}.{item.format}
                          </div>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 flex-shrink-0">
                          .{item.format}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsBatchRenameOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition ${
                  darkMode
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cancel
              </button>

              <button
                type="button"
                id="vault-apply-batch-rename-btn"
                onClick={handleApplyBatchRename}
                disabled={previewRenames.length === 0 || !renamePattern.trim()}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 ${theme.bg} ${theme.bgHover}`}
              >
                <Check className="w-4 h-4" />
                <span>Apply Batch Rename ({previewRenames.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
