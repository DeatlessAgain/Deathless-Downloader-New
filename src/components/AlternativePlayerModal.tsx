import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  ExternalLink,
  Copy,
  Check,
  Globe,
  Radio,
  Download,
  AlertTriangle,
  Film,
  Music,
  Tv,
  Sparkles,
  Layers,
} from 'lucide-react';
import { DownloadItem, AlternateStreamOption, ManualDownloadMirror } from '../types';
import {
  extractYouTubeVideoId,
  buildFallbackMirrors,
  buildWebPlayerUrls,
  resolveAlternativeStreams,
  triggerDirectBrowserDownload,
} from '../services/clientMediaResolver';

interface AlternativePlayerModalProps {
  item: DownloadItem;
  onClose: () => void;
  darkMode: boolean;
  onRetryWithClientEngine?: (item: DownloadItem, directUrl?: string) => void;
}

export const AlternativePlayerModal: React.FC<AlternativePlayerModalProps> = ({
  item,
  onClose,
  darkMode,
  onRetryWithClientEngine,
}) => {
  const [activeTab, setActiveTab] = useState<'player' | 'streams' | 'mirrors'>('player');
  const [playerType, setPlayerType] = useState<'nocookie' | 'invidious' | 'piped'>('nocookie');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [streamList, setStreamList] = useState<AlternateStreamOption[]>(item.alternateStreams || []);
  const [manualMirrors, setManualMirrors] = useState<ManualDownloadMirror[]>(
    item.manualDownloadMirrors || []
  );

  const videoId = extractYouTubeVideoId(item.originalUrl);
  const webPlayerUrls = videoId
    ? buildWebPlayerUrls(videoId)
    : { embed: item.originalUrl, invidious: item.originalUrl, piped: item.originalUrl };

  useEffect(() => {
    // If streams or mirrors are empty, fetch from resolver
    if (streamList.length === 0 || manualMirrors.length === 0) {
      setLoadingStreams(true);
      resolveAlternativeStreams(item.originalUrl, item.category === 'audio')
        .then((res) => {
          if (res.alternateStreams && res.alternateStreams.length > 0) {
            setStreamList(res.alternateStreams);
          }
          if (res.manualDownloadMirrors && res.manualDownloadMirrors.length > 0) {
            setManualMirrors(res.manualDownloadMirrors);
          }
        })
        .catch((err) => {
          console.warn('Failed to resolve streams for alternative modal:', err);
        })
        .finally(() => {
          setLoadingStreams(false);
        });
    }
  }, [item.originalUrl, item.category]);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const getActiveEmbedUrl = () => {
    if (playerType === 'invidious') return webPlayerUrls.invidious;
    if (playerType === 'piped') return webPlayerUrls.piped;
    return webPlayerUrls.embed;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          darkMode
            ? 'bg-zinc-900 border-zinc-800 text-zinc-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`p-4 sm:p-5 border-b flex items-center justify-between gap-3 ${
            darkMode ? 'border-zinc-800 bg-zinc-900/90' : 'border-slate-100 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0 border border-amber-500/20">
              <Tv className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg leading-tight truncate">
                  Alternative Stream & Web Player
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Anti-Block Fallback
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                {item.title}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice Banner */}
        <div
          className={`px-4 sm:px-6 py-2.5 border-b text-xs flex items-center gap-2.5 ${
            darkMode
              ? 'bg-amber-950/20 border-amber-800/30 text-amber-300'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span className="leading-snug">
            YouTube cloud bot-protection restricts server streaming. You can watch the full video directly in the web player, open direct stream links, or download using external mirrors.
          </span>
        </div>

        {/* Tab Navigation */}
        <div
          className={`px-4 sm:px-6 pt-3 border-b flex items-center gap-2 ${
            darkMode ? 'border-zinc-800 bg-zinc-900' : 'border-slate-100 bg-white'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('player')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'player'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
            }`}
          >
            <Play className="w-4 h-4" />
            <span>Alternative Web Player</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('streams')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'streams'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Direct Stream Links</span>
            {streamList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-zinc-800">
                {streamList.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mirrors')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'mirrors'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
            }`}
          >
            <ExternalLink className="w-4 h-4" />
            <span>Manual Download Mirrors</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: WEB PLAYER */}
          {activeTab === 'player' && (
            <div className="space-y-4">
              {/* Player Selector Engine */}
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="text-slate-500 dark:text-zinc-400">Embed Source:</span>
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setPlayerType('nocookie')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      playerType === 'nocookie'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900'
                    }`}
                  >
                    YouTube Clean (No-Cookie)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerType('invidious')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      playerType === 'invidious'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900'
                    }`}
                  >
                    Invidious Private
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerType('piped')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      playerType === 'piped'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900'
                    }`}
                  >
                    Piped Portal
                  </button>
                </div>
              </div>

              {/* Embedded Player Iframe */}
              <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-slate-200 dark:border-zinc-800 shadow-md">
                <iframe
                  src={getActiveEmbedUrl()}
                  title={item.title}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500 dark:text-zinc-400 pt-1">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-amber-500" />
                  <span>Plays directly without YouTube bot-detection or sign-in prompts.</span>
                </div>
                <a
                  href={item.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                >
                  <span>Open on original site</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* TAB 2: DIRECT STREAM LINKS */}
          {activeTab === 'streams' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700/60 text-xs leading-relaxed space-y-1">
                <div className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Residential IP Direct Fetch</span>
                </div>
                <p className="text-slate-500 dark:text-zinc-400 text-[11px]">
                  These raw stream links originate directly from Google Video CDN and open-source scrapers. Because requests from your browser originate from your residential IP, bot challenge is bypassed.
                </p>
              </div>

              {loadingStreams ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Resolving direct stream URLs...
                </div>
              ) : streamList.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 space-y-2">
                  <p>No direct video stream links could be parsed by server.</p>
                  <p className="text-[11px] text-slate-400">
                    Use the <strong>Manual Download Mirrors</strong> tab to download via third-party web scrapers.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {streamList.map((stream, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                        darkMode
                          ? 'bg-zinc-850 border-zinc-800 hover:border-zinc-700'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {stream.isAudioOnly ? (
                            <Music className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <Film className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          )}
                          <span className="font-medium text-xs truncate">{stream.label}</span>
                          {stream.quality && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                              {stream.quality}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono truncate max-w-md mt-0.5">
                          {stream.url}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(stream.url)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center gap-1"
                          title="Copy direct stream link"
                        >
                          {copiedUrl === stream.url ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-500">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => triggerDirectBrowserDownload(stream.url, item.fileName)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 shadow-sm transition-colors"
                          title="Download stream directly in browser"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Direct Save</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MANUAL DOWNLOAD MIRRORS */}
          {activeTab === 'mirrors' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700/60 text-xs leading-relaxed space-y-1">
                <div className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-amber-500" />
                  <span>Alternative Web Downloader Portals</span>
                </div>
                <p className="text-slate-500 dark:text-zinc-400 text-[11px]">
                  When YouTube server-side IP blocks prevent local downloads, these third-party web portals allow you to download audio and video directly through their distributed residential proxy networks.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(manualMirrors.length > 0
                  ? manualMirrors
                  : buildFallbackMirrors(item.originalUrl, videoId)
                ).map((mirror, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border flex flex-col justify-between gap-3 transition-colors ${
                      darkMode
                        ? 'bg-zinc-850 border-zinc-800 hover:border-zinc-700'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-zinc-100">
                          {mirror.name}
                        </span>
                        {mirror.badge && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            {mirror.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                        {mirror.desc || 'Manual download gateway'}
                      </p>
                    </div>

                    <a
                      href={mirror.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-zinc-800 hover:bg-amber-500 hover:text-white dark:hover:bg-amber-500 text-slate-800 dark:text-zinc-200 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <span>Open {mirror.name}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`p-4 sm:p-5 border-t flex items-center justify-between gap-3 flex-wrap ${
            darkMode ? 'border-zinc-800 bg-zinc-900/90' : 'border-slate-100 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
            <Radio className="w-3.5 h-3.5 text-amber-500" />
            <span>Anti-Bot Shield active</span>
          </div>

          <div className="flex items-center gap-2">
            {onRetryWithClientEngine && (
              <button
                type="button"
                onClick={() => {
                  onRetryWithClientEngine(item, streamList[0]?.url);
                  onClose();
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Download via Browser (Residential IP)</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
