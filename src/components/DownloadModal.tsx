import React, { useState } from 'react';
import {
  X,
  Download,
  Film,
  Music,
  Server,
  ShieldCheck,
  Check,
  Zap,
  HardDrive,
  Copy,
  FolderDown,
  Layers,
  Terminal,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { ExtractedMediaInfo, QualityOption, StreamHeaderInfo } from '../types';
import { loadSettings } from '../services/downloadEngine';
import { probeStreamHeaders } from '../services/streamDebugService';

interface DownloadModalProps {
  info: ExtractedMediaInfo;
  onClose: () => void;
  onConfirmDownload: (quality: QualityOption, encryptInVault: boolean) => void;
  darkMode: boolean;
}

type VideoFormatType = 'mp4' | 'mkv' | 'webm';
type VideoQualityType = '4K' | '2K' | '1080p' | '720p' | '480p' | '360p';

type AudioFormatType = 'mp3' | 'm4a' | 'flac' | 'wav';
type AudioQualityType = '320k' | '256k' | '192k' | '128k';

export const DownloadModal: React.FC<DownloadModalProps> = ({
  info,
  onClose,
  onConfirmDownload,
  darkMode,
}) => {
  const settings = loadSettings();

  // Mode: Video or Audio
  const [downloadMode, setDownloadMode] = useState<'video' | 'audio'>('video');

  // Video options: format (MP4, MKV, WebM) & quality (360p, 720p, 1080p, 4K)
  const [videoFormat, setVideoFormat] = useState<VideoFormatType>(settings.defaultVideoFormat || 'mp4');
  const [videoQuality, setVideoQuality] = useState<VideoQualityType>(
    (settings.defaultVideoQuality as VideoQualityType) || '1080p'
  );

  // Audio options: format (MP3, M4A, FLAC, WAV) & quality (128k, 192k, 256k, 320k)
  const [audioFormat, setAudioFormat] = useState<AudioFormatType>(
    (settings.defaultAudioFormat as AudioFormatType) || 'mp3'
  );
  const [audioQuality, setAudioQuality] = useState<AudioQualityType>(
    (settings.defaultAudioQuality as AudioQualityType) || '320k'
  );

  const [encryptInVault, setEncryptInVault] = useState(settings.saveToEncryptedVault);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isProbingHeaders, setIsProbingHeaders] = useState(false);
  const [probedHeaderInfo, setProbedHeaderInfo] = useState<StreamHeaderInfo | null>(null);
  const [showHeadersPreview, setShowHeadersPreview] = useState(false);

  const handleInspectHeaders = async () => {
    setIsProbingHeaders(true);
    setShowHeadersPreview(true);
    try {
      const res = await probeStreamHeaders(info.url, {
        title: info.title,
        format: downloadMode === 'video' ? videoFormat : audioFormat,
        isAudioOnly: downloadMode === 'audio',
      });
      setProbedHeaderInfo(res);
    } catch (err) {
      console.error('Failed to probe headers:', err);
    } finally {
      setIsProbingHeaders(false);
    }
  };

  // Specifications table
  const videoSpecs: Record<
    VideoQualityType,
    { label: string; res: string; bitrate: number; fps: number; baseMb: number; codec: string; badge?: string }
  > = {
    '4K': {
      label: '4K Ultra HD (2160p @ 60fps)',
      res: '3840 x 2160',
      bitrate: 24000,
      fps: 60,
      baseMb: 1450,
      codec: 'AV1 / HEVC Main 10',
      badge: 'ULTRA HD',
    },
    '2K': {
      label: '2K Quad HD (1440p @ 60fps)',
      res: '2560 x 1440',
      bitrate: 12000,
      fps: 60,
      baseMb: 780,
      codec: 'VP9 High Profile',
    },
    '1080p': {
      label: '1080p Full HD (60fps High Bitrate)',
      res: '1920 x 1080',
      bitrate: 6500,
      fps: 60,
      baseMb: 420,
      codec: 'H.264 / AVC High@L4.2',
      badge: 'POPULAR',
    },
    '720p': {
      label: '720p HD Ready (Standard)',
      res: '1280 x 720',
      bitrate: 3200,
      fps: 30,
      baseMb: 210,
      codec: 'H.264 / AVC Main',
    },
    '480p': {
      label: '480p SD Mobile Balanced',
      res: '854 x 480',
      bitrate: 1500,
      fps: 30,
      baseMb: 110,
      codec: 'H.264 Baseline',
    },
    '360p': {
      label: '360p Fast Data Saver',
      res: '640 x 360',
      bitrate: 800,
      fps: 30,
      baseMb: 60,
      codec: 'H.264 Low Profile',
    },
  };

  const audioSpecs: Record<
    AudioQualityType,
    { label: string; sampleRate: string; bitrate: number; baseMb: number; codec: string; badge?: string }
  > = {
    '320k': {
      label: '320 kbps Studio Fidelity (Max Quality)',
      sampleRate: '48.0 kHz / Stereo',
      bitrate: 320,
      baseMb: 16,
      codec: 'LAME MP3 v3.100 / FLAC 24-bit',
      badge: 'STUDIO HQ',
    },
    '256k': {
      label: '256 kbps High Definition AAC',
      sampleRate: '44.1 kHz / Stereo',
      bitrate: 256,
      baseMb: 12,
      codec: 'Apple CoreAudio AAC',
    },
    '192k': {
      label: '192 kbps Standard Broadcast Quality',
      sampleRate: '44.1 kHz / Stereo',
      bitrate: 192,
      baseMb: 9,
      codec: 'MPEG-4 Audio / MP3',
    },
    '128k': {
      label: '128 kbps Data Saver (Lightweight)',
      sampleRate: '44.1 kHz / Stereo',
      bitrate: 128,
      baseMb: 6,
      codec: 'Standard MP3',
    },
  };

  // Build the effective QualityOption
  const currentVideoSpec = videoSpecs[videoQuality];
  const currentAudioSpec = audioSpecs[audioQuality];

  const constructedQuality: QualityOption =
    downloadMode === 'video'
      ? {
          id: `custom-video-${videoQuality}-${videoFormat}`,
          label: `${currentVideoSpec.label} [${videoFormat.toUpperCase()}]`,
          resolution: currentVideoSpec.res,
          qualityTag: videoQuality,
          format: videoFormat,
          isAudioOnly: false,
          bitrateKbps: currentVideoSpec.bitrate,
          fps: currentVideoSpec.fps,
          codec: `${currentVideoSpec.codec} in .${videoFormat}`,
          approxSizeMb: currentVideoSpec.baseMb,
        }
      : {
          id: `custom-audio-${audioQuality}-${audioFormat}`,
          label: `${currentAudioSpec.label} [${audioFormat.toUpperCase()}]`,
          resolution: currentAudioSpec.sampleRate,
          qualityTag: audioQuality,
          format: audioFormat,
          isAudioOnly: true,
          bitrateKbps: currentAudioSpec.bitrate,
          codec: `${currentAudioSpec.codec} in .${audioFormat}`,
          approxSizeMb: currentAudioSpec.baseMb,
        };

  // Preview generated filename
  const cleanTitle = info.title
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 40);
  const previewFileName = `${cleanTitle || 'download'}_${constructedQuality.qualityTag}.${constructedQuality.format}`;
  const previewPath = `${settings.defaultDownloadFolder || '~/Downloads/Deathless'}/${previewFileName}`;

  const handleCopyDirectUrl = () => {
    navigator.clipboard?.writeText(info.cdnInfo.directStreamUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleStart = () => {
    onConfirmDownload(constructedQuality, encryptInVault);
    onClose();
  };

  return (
    <div
      id="quality-selector-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="quality-selector-modal"
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden my-auto transition-all ${
          darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">Advanced Download Options</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Select format (MP4, MKV, etc.) & quality (360p - 4K, 128k - 320kbps)
              </p>
            </div>
          </div>
          <button
            id="close-quality-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Media Info Banner */}
          <div className="flex flex-col sm:flex-row gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800">
            <img
              src={info.thumbnail}
              alt={info.title}
              className="w-full sm:w-36 h-24 object-cover rounded-lg flex-shrink-0"
            />
            <div className="flex-1 min-w-0 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                    {info.platform}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-zinc-400">
                    Duration: {info.duration}
                  </span>
                  {info.platform === 'youtube' && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      Smart Stream Active
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-semibold line-clamp-2" title={info.title}>
                  {info.title}
                </h4>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Author: {info.author}</p>
            </div>
          </div>

          {/* Mode Switcher: Video vs Audio */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
              Download Media Stream Type
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-xl">
              <button
                type="button"
                id="select-mode-video"
                onClick={() => setDownloadMode('video')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  downloadMode === 'video'
                    ? 'bg-white dark:bg-zinc-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                }`}
              >
                <Film className="w-4 h-4" />
                <span>Video Download (MP4, MKV, 4K - 360p)</span>
              </button>
              <button
                type="button"
                id="select-mode-audio"
                onClick={() => setDownloadMode('audio')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  downloadMode === 'audio'
                    ? 'bg-white dark:bg-zinc-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                }`}
              >
                <Music className="w-4 h-4" />
                <span>Audio Extraction (MP3, 128k - 320kbps)</span>
              </button>
            </div>
          </div>

          {/* ===================== VIDEO CONFIGURATION ===================== */}
          {downloadMode === 'video' && (
            <div className="space-y-4 pt-1">
              {/* Video Format Container Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    Video Container Format
                  </label>
                  <span className="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium">
                    Selected: .{videoFormat.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['mp4', 'mkv', 'webm'] as VideoFormatType[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      id={`format-video-${fmt}`}
                      onClick={() => setVideoFormat(fmt)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 ${
                        videoFormat === fmt
                          ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                          : darkMode
                            ? 'bg-zinc-950/40 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {videoFormat === fmt && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      <span>.{fmt}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Video Quality Selection (4K, 2K, 1080p, 720p, 480p, 360p) */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                  Video Resolution & Quality
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(['4K', '2K', '1080p', '720p', '480p', '360p'] as VideoQualityType[]).map((q) => {
                    const spec = videoSpecs[q];
                    const isSelected = videoQuality === q;
                    return (
                      <div
                        key={q}
                        id={`quality-video-${q}`}
                        onClick={() => setVideoQuality(q)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? darkMode
                              ? 'bg-cyan-950/40 border-cyan-500 text-white shadow-md shadow-cyan-500/10'
                              : 'bg-cyan-50/80 border-cyan-500 text-slate-900 shadow-md shadow-cyan-500/10'
                            : darkMode
                              ? 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                              isSelected
                                ? 'border-cyan-500 bg-cyan-500 text-white'
                                : 'border-slate-400 dark:border-zinc-600'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs">{q}</span>
                              {spec.badge && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-500 font-bold">
                                  {spec.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
                              {spec.res} • {spec.fps}fps
                            </p>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0 ml-2">
                          <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
                            ~{spec.baseMb >= 1000 ? `${(spec.baseMb / 1024).toFixed(1)} GB` : `${spec.baseMb} MB`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ===================== AUDIO CONFIGURATION ===================== */}
          {downloadMode === 'audio' && (
            <div className="space-y-4 pt-1">
              {/* Audio Format Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    Audio Encoding Format
                  </label>
                  <span className="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium">
                    Selected: .{audioFormat.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(['mp3', 'm4a', 'flac', 'wav'] as AudioFormatType[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      id={`format-audio-${fmt}`}
                      onClick={() => setAudioFormat(fmt)}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold uppercase transition-all flex items-center justify-center gap-1 ${
                        audioFormat === fmt
                          ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                          : darkMode
                            ? 'bg-zinc-950/40 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {audioFormat === fmt && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      <span>.{fmt}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio Bitrate Quality Selection (320kbps, 256kbps, 192kbps, 128kbps) */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                  Audio Quality & Bitrate
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(['320k', '256k', '192k', '128k'] as AudioQualityType[]).map((q) => {
                    const spec = audioSpecs[q];
                    const isSelected = audioQuality === q;
                    return (
                      <div
                        key={q}
                        id={`quality-audio-${q}`}
                        onClick={() => setAudioQuality(q)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? darkMode
                              ? 'bg-cyan-950/40 border-cyan-500 text-white shadow-md shadow-cyan-500/10'
                              : 'bg-cyan-50/80 border-cyan-500 text-slate-900 shadow-md shadow-cyan-500/10'
                            : darkMode
                              ? 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                              isSelected
                                ? 'border-cyan-500 bg-cyan-500 text-white'
                                : 'border-slate-400 dark:border-zinc-600'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs">{spec.bitrate} kbps</span>
                              {spec.badge && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-500 font-bold">
                                  {spec.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono truncate">
                              {spec.sampleRate}
                            </p>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0 ml-2">
                          <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
                            ~{spec.baseMb} MB
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Destination Path and File Details Preview */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/40 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                <FolderDown className="w-3.5 h-3.5 text-cyan-500" />
                Target Download Location:
              </span>
              <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400 font-semibold truncate max-w-[260px]">
                {previewPath}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 dark:border-zinc-800/80">
              <span className="text-slate-500 dark:text-zinc-400">CDN Origin Route:</span>
              <span className="font-medium text-slate-700 dark:text-zinc-300 truncate max-w-[260px]">
                {info.cdnInfo.nodeLocation} ({info.cdnInfo.protocol})
              </span>
            </div>
          </div>

          {/* Stream & Headers Pre-flight Probe Button */}
          <div className="pt-1">
            <div className="flex items-center justify-between">
              <button
                type="button"
                id="preflight-headers-probe-btn"
                onClick={handleInspectHeaders}
                disabled={isProbingHeaders}
                className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1.5"
              >
                <Terminal className={`w-3.5 h-3.5 ${isProbingHeaders ? 'animate-spin' : ''}`} />
                <span>
                  {isProbingHeaders
                    ? 'Probing Stream HTTP Headers...'
                    : showHeadersPreview && probedHeaderInfo
                    ? 'Re-check Stream Headers'
                    : 'Check File Stream Headers'}
                </span>
              </button>

              {probedHeaderInfo && (
                <span className="text-[11px] text-slate-500 font-mono">
                  {probedHeaderInfo.statusCode} {probedHeaderInfo.statusText} ({probedHeaderInfo.latencyMs}ms)
                </span>
              )}
            </div>

            {/* Probed Headers Mini Card */}
            {showHeadersPreview && probedHeaderInfo && (
              <div className="mt-2 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/70 text-[11px] space-y-1.5 font-mono animate-fadeIn">
                <div className="flex items-center justify-between text-slate-600 dark:text-zinc-300">
                  <span className="font-bold text-cyan-600 dark:text-cyan-400">Content-Length:</span>
                  <span>{(probedHeaderInfo.contentLength / (1024 * 1024)).toFixed(2)} MB ({probedHeaderInfo.contentLength.toLocaleString()} bytes)</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-zinc-300">
                  <span className="font-bold text-cyan-600 dark:text-cyan-400">Content-Type:</span>
                  <span className="truncate max-w-[220px]">{probedHeaderInfo.contentType}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-zinc-300">
                  <span className="font-bold text-cyan-600 dark:text-cyan-400">Accept-Ranges:</span>
                  <span className="text-emerald-500 font-semibold">{probedHeaderInfo.acceptRanges || 'bytes'}</span>
                </div>
                {probedHeaderInfo.isBotBlocked && (
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center gap-1.5 text-[10px]">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Bot protection detected: 127 KB fallback clip active. Add YouTube cookies in Settings to bypass.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vault Storage Checkbox */}
          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
              <input
                type="checkbox"
                id="vault-encryption-checkbox"
                checked={encryptInVault}
                onChange={(e) => setEncryptInVault(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 accent-cyan-600 cursor-pointer"
              />
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-zinc-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Save encrypted AES-GCM copy for instant in-app offline media playback
              </span>
            </label>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/40">
          <div className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-cyan-500" />
            <span>Ready: {constructedQuality.label}</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              id="cancel-quality-modal-btn"
              onClick={onClose}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                darkMode
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Cancel
            </button>
            <button
              type="button"
              id="confirm-start-download-btn"
              onClick={handleStart}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/30 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Start Downloading</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
