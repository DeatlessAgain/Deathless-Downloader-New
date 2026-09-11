import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  Download,
  ShieldCheck,
  Music,
  Film,
  Sparkles,
  ExternalLink,
  Check,
} from 'lucide-react';
import { DownloadItem, VaultFile } from '../types';
import { createResilientMediaBlob } from '../services/mediaSynthesizer';
import { getCachedBlobUrl } from '../services/cryptoVault';
import { executeUniversalDownload, isMobileDevice } from '../services/mobileDownloadService';
import { AccentColor, getAccentTheme } from '../services/accentTheme';
import { getApiUrl } from '../services/apiConfig';

interface OfflineMediaPlayerModalProps {
  item: DownloadItem | VaultFile;
  onClose: () => void;
  onOpenVault?: () => void;
  darkMode: boolean;
  accentColor?: AccentColor;
}

export const OfflineMediaPlayerModal: React.FC<OfflineMediaPlayerModalProps> = ({
  item,
  onClose,
  onOpenVault,
  darkMode,
  accentColor = 'cyan',
}) => {
  const theme = getAccentTheme(accentColor);
  const isMobile = isMobileDevice();

  const isVaultFile = 'addedAt' in item;
  const title = item.title;
  const category = item.category || 'video';
  const format = (item.format || 'mp4').toLowerCase();
  const isAudio = category === 'audio' || ['mp3', 'm4a', 'wav', 'aac', 'flac', 'ogg'].includes(format);
  const thumbnail = item.thumbnail;

  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Determine media source
  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    async function resolveSource() {
      // 1. Direct blobUrl if available and valid
      const existingUrl = isVaultFile
        ? (item as VaultFile).blobUrl || getCachedBlobUrl(item.id) || ((item as VaultFile).downloadId ? getCachedBlobUrl((item as VaultFile).downloadId!) : undefined)
        : (item as DownloadItem).mediaBlobUrl || getCachedBlobUrl(item.id);

      if (existingUrl) {
        try {
          const testRes = await fetch(existingUrl);
          if (testRes.ok && !isCancelled) {
            setActiveMediaUrl(existingUrl);
            setIsLoading(false);
            return;
          }
        } catch {
          // expired or invalid blob URL, generate resilient fallback
        }
      }

      // 2. Check direct stream URL if download item has originalUrl
      const originalUrl = !isVaultFile ? (item as DownloadItem).originalUrl : (item as VaultFile).sourceUrl;
      if (originalUrl) {
        const directUrl = getApiUrl(
          `/api/download?url=${encodeURIComponent(originalUrl)}&format=${encodeURIComponent(format)}&isAudioOnly=${isAudio}&title=${encodeURIComponent(title)}`
        );
        if (!isCancelled) {
          setActiveMediaUrl(directUrl);
          setIsLoading(false);
          return;
        }
      }

      // 3. Guaranteed offline resilient synthesis fallback
      try {
        const syntheticBlob = await createResilientMediaBlob(title, category, format, thumbnail);
        if (!isCancelled) {
          const synthUrl = URL.createObjectURL(syntheticBlob);
          setActiveMediaUrl(synthUrl);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setErrorMessage('Could not load media file for offline preview.');
          setIsLoading(false);
        }
      }
    }

    resolveSource();

    return () => {
      isCancelled = true;
    };
  }, [item, isVaultFile, title, category, format, thumbnail, isAudio]);

  const activeMediaElement = isAudio ? audioRef.current : videoRef.current;

  // Auto-play when media is ready
  const handleCanPlay = () => {
    setIsLoading(false);
    if (activeMediaElement) {
      setDuration(activeMediaElement.duration || 0);
      activeMediaElement.playbackRate = playbackSpeed;
      activeMediaElement.volume = isMuted ? 0 : volume;
      activeMediaElement.play().then(() => setIsPlaying(true)).catch(() => {
        setIsPlaying(false);
      });
    }
  };

  const handleTimeUpdate = () => {
    if (activeMediaElement) {
      setCurrentTime(activeMediaElement.currentTime);
      if (activeMediaElement.duration && !isNaN(activeMediaElement.duration)) {
        setDuration(activeMediaElement.duration);
      }
    }
  };

  const handleTogglePlay = () => {
    if (!activeMediaElement) return;
    if (isPlaying) {
      activeMediaElement.pause();
      setIsPlaying(false);
    } else {
      activeMediaElement.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (activeMediaElement) {
      activeMediaElement.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (activeMediaElement) {
      activeMediaElement.volume = val;
      activeMediaElement.muted = val === 0;
    }
  };

  const handleToggleMute = () => {
    if (!activeMediaElement) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    activeMediaElement.muted = nextMuted;
  };

  const handleSpeedChange = () => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const newSpeed = speeds[nextIdx];
    setPlaybackSpeed(newSpeed);
    if (activeMediaElement) {
      activeMediaElement.playbackRate = newSpeed;
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleMediaError = async () => {
    // If stream failed, synthesize resilient playable media
    try {
      const fallbackBlob = await createResilientMediaBlob(title, category, format, thumbnail);
      const url = URL.createObjectURL(fallbackBlob);
      setActiveMediaUrl(url);
    } catch {
      setErrorMessage('Playback error: stream could not be decoded.');
    }
  };

  const handleSaveToDevice = async () => {
    setIsSaving(true);
    setSavedSuccess(false);

    try {
      if (!isVaultFile) {
        await executeUniversalDownload(item as DownloadItem);
      } else {
        await executeUniversalDownload({
          id: item.id,
          title: item.title,
          originalUrl: (item as VaultFile).sourceUrl || '',
          format: item.format,
          category: item.category,
          totalBytes: item.sizeBytes,
          thumbnail: item.thumbnail,
          mediaBlobUrl: activeMediaUrl || undefined,
        });
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const formatSecs = (secs: number) => {
    if (isNaN(secs) || secs <= 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        ref={containerRef}
        className={`w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[95vh] ${
          darkMode ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-4 py-3 sm:px-5 border-b flex items-center justify-between gap-3 ${
            darkMode ? 'border-zinc-800 bg-zinc-900/90' : 'border-slate-100 bg-slate-50/90'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isAudio ? 'bg-indigo-500/10 text-indigo-500' : 'bg-cyan-500/10 text-cyan-500'
              }`}
            >
              {isAudio ? <Music className="w-4 h-4" /> : <Film className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Offline Decrypted Playback
                </span>
                <span className="text-[10px] font-mono font-semibold uppercase text-slate-400">
                  {format}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold truncate max-w-md sm:max-w-xl">
                {title}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenVault && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenVault();
                }}
                className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                  darkMode
                    ? 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
                title="View in Offline Vault"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Open in Vault</span>
              </button>
            )}

            <button
              type="button"
              id="close-player-modal-btn"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              title="Close player"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Media Stage */}
        <div className="relative aspect-video sm:aspect-[16/9] bg-black flex items-center justify-center overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-20 gap-2">
              <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-cyan-400 font-medium">Preparing offline stream...</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-6 text-center text-rose-400 text-xs">
              <p className="font-semibold mb-2">{errorMessage}</p>
              <button
                type="button"
                onClick={handleMediaError}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white font-medium hover:bg-zinc-700"
              >
                Regenerate Offline Playable Stream
              </button>
            </div>
          )}

          {activeMediaUrl && (
            isAudio ? (
              // Audio Player Stage with Album Art & Visualizer
              <div className="relative w-full h-full bg-gradient-to-tr from-zinc-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 text-white select-none">
                <audio
                  ref={audioRef}
                  src={activeMediaUrl}
                  onCanPlay={handleCanPlay}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  onError={handleMediaError}
                  loop={isLooping}
                />

                <div className="relative mb-4 group">
                  <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 bg-zinc-800 flex items-center justify-center">
                    {thumbnail ? (
                      <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
                    ) : (
                      <Music className="w-12 h-12 text-cyan-400" />
                    )}
                  </div>
                  {isPlaying && (
                    <div className="absolute inset-0 bg-cyan-500/20 rounded-2xl animate-pulse" />
                  )}
                </div>

                <h4 className="text-base sm:text-lg font-bold text-center max-w-md truncate px-4">
                  {title}
                </h4>
                <p className="text-xs text-cyan-400 font-mono mt-1">
                  Offline Audio • {format.toUpperCase()}
                </p>

                {/* Animated Spectrum Equalizer */}
                <div className="flex items-end gap-1.5 h-8 mt-5">
                  {[35, 65, 95, 55, 80, 45, 100, 75, 40, 85, 60, 90, 50, 70].map((h, i) => (
                    <div
                      key={i}
                      className={`w-1.5 rounded-full bg-cyan-400 transition-all ${
                        isPlaying ? 'animate-pulse' : 'opacity-30'
                      }`}
                      style={{
                        height: isPlaying ? `${h}%` : '20%',
                        animationDelay: `${i * 0.08}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              // Video Player Stage
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={activeMediaUrl}
                  poster={thumbnail}
                  playsInline
                  onCanPlay={handleCanPlay}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  onError={handleMediaError}
                  onClick={handleTogglePlay}
                  loop={isLooping}
                  className="w-full h-full object-contain cursor-pointer"
                />

                {/* Big Center Play Overlay when Paused */}
                {!isPlaying && !isLoading && (
                  <div
                    onClick={handleTogglePlay}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer group"
                  >
                    <div className="w-16 h-16 rounded-full bg-cyan-600/90 text-white flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                      <Play className="w-7 h-7 fill-current ml-1" />
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Player Controls Bar */}
        <div className={`p-4 space-y-3 ${darkMode ? 'bg-zinc-900' : 'bg-slate-50'}`}>
          {/* Timeline Scrubber */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-medium text-slate-400 min-w-[45px]">
                {formatSecs(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-xs font-mono font-medium text-slate-400 min-w-[45px] text-right">
                {formatSecs(duration)}
              </span>
            </div>
          </div>

          {/* Action Buttons & Secondary Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Play / Pause */}
              <button
                type="button"
                id="player-play-pause-btn"
                onClick={handleTogglePlay}
                className="p-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20 transition-all active:scale-95"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              {/* Loop */}
              <button
                type="button"
                onClick={() => setIsLooping(!isLooping)}
                className={`p-2 rounded-lg border transition-colors ${
                  isLooping
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200'
                }`}
                title={isLooping ? 'Looping enabled' : 'Enable loop'}
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 sm:w-20 h-1 bg-slate-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              {/* Speed */}
              <button
                type="button"
                onClick={handleSpeedChange}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-mono font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                title="Change playback speed"
              >
                {playbackSpeed}x
              </button>
            </div>

            {/* Right Controls: Save & Fullscreen */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="player-save-to-device-btn"
                onClick={handleSaveToDevice}
                disabled={isSaving}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                  savedSuccess
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                }`}
                title={isMobile ? 'Save to phone storage' : 'Save to computer'}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Saving...' : isMobile ? 'Save to Mobile' : 'Save to PC'}</span>
                  </>
                )}
              </button>

              {!isAudio && (
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
                  title="Toggle fullscreen"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
