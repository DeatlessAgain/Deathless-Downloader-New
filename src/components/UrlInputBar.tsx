import React, { useState } from 'react';
import {
  Link2,
  Download,
  Clipboard,
  Sparkles,
  Search,
  CheckCircle2,
  Globe,
  Radio,
  FileCheck,
} from 'lucide-react';
import { detectPlatform, normalizeUrl } from '../services/urlParser';
import { PlatformType } from '../types';
import { AccentColor, getAccentTheme } from '../services/accentTheme';

interface UrlInputBarProps {
  onAnalyzeUrl: (url: string, autoStartImmediately?: boolean) => void;
  autoStartOnPaste: boolean;
  setAutoStartOnPaste: (val: boolean) => void;
  darkMode: boolean;
  isAnalyzing: boolean;
  accentColor?: AccentColor;
}

const sampleUrls = [
  {
    name: 'YouTube 4K 60fps',
    platform: 'youtube',
    url: 'https://youtube.com/watch?v=LXb3EKWsInQ',
    tag: '4K Ultra HD',
  },
  {
    name: 'TikTok Viral Sound',
    platform: 'tiktok',
    url: 'https://tiktok.com/@beats_producer/video/78923411',
    tag: '320kbps MP3',
  },
  {
    name: 'Facebook Watch 1080p',
    platform: 'facebook',
    url: 'https://facebook.com/watch/?v=492019385721',
    tag: 'Full HD',
  },
  {
    name: 'Direct ISO 1.2GB',
    platform: 'direct',
    url: 'https://archive.mirror.direct/ubuntu-24.04-desktop.iso',
    tag: 'Resumable HTTP/3',
  },
];

export const UrlInputBar: React.FC<UrlInputBarProps> = ({
  onAnalyzeUrl,
  autoStartOnPaste,
  setAutoStartOnPaste,
  darkMode,
  isAnalyzing,
  accentColor = 'cyan',
}) => {
  const theme = getAccentTheme(accentColor);
  const [inputUrl, setInputUrl] = useState('');
  const [detectedPlatform, setDetectedPlatform] = useState<PlatformType | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputUrl(val);
    if (val.trim().length > 5) {
      setDetectedPlatform(detectPlatform(val));
    } else {
      setDetectedPlatform(null);
    }
  };

  const handlePasteEvent = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted && pasted.trim()) {
      const cleaned = normalizeUrl(pasted.trim());
      setInputUrl(cleaned);
      setDetectedPlatform(detectPlatform(cleaned));
      if (autoStartOnPaste) {
        setTimeout(() => onAnalyzeUrl(cleaned, true), 80);
      }
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const cleaned = normalizeUrl(text.trim());
          setInputUrl(cleaned);
          setDetectedPlatform(detectPlatform(cleaned));
          if (autoStartOnPaste) {
            onAnalyzeUrl(cleaned, true);
          } else {
            onAnalyzeUrl(cleaned, false);
          }
          return;
        }
      }
    } catch {
      // Clipboard access might be blocked in iframe
    }
    // Fallback focus
    const el = document.getElementById('manual-url-input');
    el?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    const cleaned = normalizeUrl(inputUrl.trim());
    setInputUrl(cleaned);
    onAnalyzeUrl(cleaned, autoStartOnPaste);
  };

  const handleQuickSample = (url: string) => {
    setInputUrl(url);
    setDetectedPlatform(detectPlatform(url));
    onAnalyzeUrl(url, autoStartOnPaste);
  };

  return (
    <div
      id="url-input-container"
      className={`rounded-2xl border p-5 sm:p-6 transition-all shadow-sm ${
        darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
            <Radio className={`w-5 h-5 ${theme.text} animate-pulse`} />
            <span>Universal Media Link Inspector</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
            Paste any media or file link to detect host CDN, resolution streams, and commence chunked transfer
          </p>
        </div>

        {/* Auto-Start vs Modal Toggle */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-100 dark:bg-zinc-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700/60">
          <label className="text-xs font-medium cursor-pointer select-none flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-start-on-paste-toggle"
              checked={autoStartOnPaste}
              onChange={(e) => setAutoStartOnPaste(e.target.checked)}
              className={`w-4 h-4 rounded ${theme.accentCheck} cursor-pointer`}
            />
            <span className="text-slate-700 dark:text-zinc-300">Auto-start on paste</span>
          </label>
        </div>
      </div>

      {/* Main URL Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative flex items-center">
          <div className="absolute left-4 text-slate-400 dark:text-zinc-500 pointer-events-none">
            <Link2 className="w-5 h-5" />
          </div>

          <input
            id="manual-url-input"
            type="url"
            value={inputUrl}
            onChange={handleInputChange}
            onPaste={handlePasteEvent}
            placeholder="Paste YouTube, TikTok, Facebook, or direct link..."
            className={`w-full pl-10 sm:pl-12 pr-28 sm:pr-36 py-3 sm:py-4 rounded-xl text-xs sm:text-base border outline-none transition-all ${
              darkMode
                ? 'bg-zinc-950 border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
                : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
            }`}
          />

          <div className="absolute right-1.5 sm:right-2 flex items-center gap-1.5">
            {/* Clipboard Paste button */}
            <button
              type="button"
              id="paste-clipboard-btn"
              onClick={handlePasteClipboard}
              className={`hidden sm:flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                darkMode
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title="Paste from clipboard"
            >
              <Clipboard className="w-3.5 h-3.5 text-cyan-500" />
              <span>Paste</span>
            </button>

            {/* Inspect / Download Action Button */}
            <button
              type="submit"
              id="inspect-download-submit-btn"
              disabled={isAnalyzing || !inputUrl.trim()}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold ${theme.bg} ${theme.bgHover} text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${theme.glow} transition-all active:scale-95 flex-shrink-0`}
            >
              {isAnalyzing ? (
                <>
                  <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="hidden sm:inline">Analyzing...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Inspect & </span>
                  <span>Download</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Platform Detection Indicator */}
        {detectedPlatform && (
          <div className={`flex items-center gap-2 px-1 text-xs ${theme.text} font-medium animate-fadeIn`}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              Detected Origin:{' '}
              <strong className="capitalize">{detectedPlatform}</strong> Media Protocol • Range-resume verified
            </span>
          </div>
        )}
      </form>

      {/* Quick Test Links & Platform Badges */}
      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-400 dark:text-zinc-500 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Quick Samples:
          </span>
          {sampleUrls.map((s, idx) => (
            <button
              key={idx}
              type="button"
              id={`sample-url-btn-${idx}`}
              onClick={() => handleQuickSample(s.url)}
              className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-all ${
                darkMode
                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:border-cyan-500 hover:text-cyan-400'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-cyan-500 hover:text-cyan-600'
              }`}
            >
              {s.name}{' '}
              <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold ml-1">
                ({s.tag})
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-zinc-500">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <span>Supports: YT, TikTok, FB, Insta, X, Reddit, Vimeo, ISO, ZIP</span>
        </div>
      </div>
    </div>
  );
};
