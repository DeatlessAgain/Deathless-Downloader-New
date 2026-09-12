/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  DownloadItem,
  QualityOption,
  BatchItem,
  ExtractedMediaInfo,
} from './types';
import { inspectMediaUrl, inspectMediaUrlAsync, generateStandardQualities } from './services/urlParser';
import {
  loadSettings,
  saveSettings,
  getDownloadHistory,
  saveDownloadHistory,
  createDownloadItem,
  AppSettings,
  triggerBrowserFileDownload,
  startRealDownloadStream,
  ActiveDownloadHandle,
  applySmartCleanup,
} from './services/downloadEngine';
import { executeUniversalDownload, isMobileApp } from './services/mobileDownloadService';
import { createResilientMediaBlob, transcodeOrSynthesizeMediaBlob } from './services/mediaSynthesizer';
import { createEncryptedMediaRecord, registerCachedBlobUrl } from './services/cryptoVault';
import { playCompletionChime, sendDesktopNotification, subscribeToToasts, ToastNotification } from './services/notificationService';
import { applyAccentToDocument } from './services/accentTheme';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

import { Header } from './components/Header';
import { UrlInputBar } from './components/UrlInputBar';
import { DownloadModal } from './components/DownloadModal';
import { ActiveDownloads } from './components/ActiveDownloads';
import { SocialFeedBrowser } from './components/SocialFeedBrowser';
import { BatchPlaylistDownloader } from './components/BatchPlaylistDownloader';
import { OfflineVault } from './components/OfflineVault';
import { DownloadHistory } from './components/DownloadHistory';
import { SettingsModal } from './components/SettingsModal';
import { StreamDebuggerModal } from './components/StreamDebuggerModal';
import { OfflineMediaPlayerModal } from './components/OfflineMediaPlayerModal';

export default function App() {
  // Dark mode defaults to OFF (Light mode) as requested by user
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('deathless_dark_mode');
    return saved === 'true'; // defaults to false if not saved
  });

  const [currentTab, setCurrentTab] = useState<'downloader' | 'social' | 'batch' | 'vault' | 'history'>('downloader');
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStreamDebuggerOpen, setIsStreamDebuggerOpen] = useState(false);
  const [streamDebuggerTargetId, setStreamDebuggerTargetId] = useState<string | undefined>(undefined);

  // Active Downloads & History
  const [activeItems, setActiveItems] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<DownloadItem[]>(getDownloadHistory);

  // Analyzing & Modal state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pendingMediaInfo, setPendingMediaInfo] = useState<ExtractedMediaInfo | null>(null);
  const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);

  // Active item to play in vault or dedicated offline player modal
  const [vaultFileToPlay, setVaultFileToPlay] = useState<string | null>(null);
  const [mediaPlayerItem, setMediaPlayerItem] = useState<DownloadItem | null>(null);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Aggregate Speed
  const [totalSpeedMbps, setTotalSpeedMbps] = useState(0);

  // Subscribe to background toast notifications (file saves, permissions, etc.)
  useEffect(() => {
    return subscribeToToasts((toast) => {
      setToasts((prev) => [toast, ...prev.slice(0, 3)]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 5000);
    });
  }, []);

  // Save dark mode preference
  useEffect(() => {
    localStorage.setItem('deathless_dark_mode', darkMode.toString());
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Apply Accent Theme to document root on boot and when preference changes
  useEffect(() => {
    applyAccentToDocument(settings.accentColor || 'cyan');
  }, [settings.accentColor]);

  // Run Smart Cleanup on completed downloads older than retention days
  const runCleanup = (days?: number, enabled?: boolean): number => {
    const d = days ?? settings.smartCleanupDays ?? 3;
    const isEnabled = enabled ?? settings.smartCleanupEnabled ?? true;
    const result = applySmartCleanup(activeItems, history, d, isEnabled);
    if (result.cleanedCount > 0) {
      setActiveItems(result.updatedActive);
      setHistory(result.updatedHistory);
      saveDownloadHistory(result.updatedHistory);
    }
    return result.cleanedCount;
  };

  // Run Smart Cleanup periodically and on settings change
  useEffect(() => {
    if (settings.smartCleanupEnabled) {
      runCleanup(settings.smartCleanupDays, true);
      const interval = setInterval(() => {
        runCleanup(settings.smartCleanupDays, true);
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [settings.smartCleanupEnabled, settings.smartCleanupDays, activeItems.length]);

  const downloadHandlesRef = useRef<Map<string, ActiveDownloadHandle>>(new Map());
  const completedItemIdsRef = useRef<Set<string>>(new Set());

  // Trigger completion sequence for an item
  const handleItemCompleted = async (completedItem: DownloadItem, realBlob?: Blob) => {
    if (completedItemIdsRef.current.has(completedItem.id)) {
      return;
    }
    completedItemIdsRef.current.add(completedItem.id);

    try {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
    } catch {
      // Ignore if blocked
    }

    if (settings.soundNotifications) {
      playCompletionChime();
    }

    if (settings.desktopNotifications) {
      sendDesktopNotification(completedItem.title, completedItem.fileName);
    }

    // Check if user requested a media format conversion (e.g. MP4 to MP3, WebM to MP4)
    let processedBlob = realBlob;
    let finalItem = completedItem;

    if (completedItem.conversion?.enabled) {
      const conv = completedItem.conversion;
      try {
        const sourceBlobToTranscode = realBlob || (await createResilientMediaBlob(
          completedItem.title,
          completedItem.category,
          conv.sourceFormat,
          completedItem.thumbnail
        ));

        const convertedBlob = await transcodeOrSynthesizeMediaBlob(
          sourceBlobToTranscode,
          conv.sourceFormat,
          conv.targetFormat,
          completedItem.title,
          completedItem.thumbnail
        );

        processedBlob = convertedBlob;
        const convertedUrl = URL.createObjectURL(convertedBlob);
        const newFileName = completedItem.fileName.replace(/\.[^/.]+$/, `.${conv.targetFormat}`);

        finalItem = {
          ...completedItem,
          format: conv.targetFormat,
          category: conv.isAudioOnly ? 'audio' : 'video',
          fileName: newFileName,
          mediaBlobUrl: convertedUrl,
          totalBytes: convertedBlob.size || completedItem.totalBytes,
          downloadedBytes: convertedBlob.size || completedItem.totalBytes,
        };

        // Update active item status in state
        setActiveItems((prev) =>
          prev.map((it) => (it.id === completedItem.id ? finalItem : it))
        );
      } catch (convErr) {
        console.warn('Media synthesizer conversion encountered issue, saving original:', convErr);
      }
    }

    // Register media in offline crypto vault & blob cache for immediate offline playback
    createEncryptedMediaRecord(
      finalItem.title,
      finalItem.category,
      finalItem.format,
      finalItem.quality.label,
      finalItem.totalBytes,
      finalItem.thumbnail,
      processedBlob,
      finalItem.originalUrl,
      finalItem.id
    ).catch((err) => console.error('Failed to vault:', err));

    if (finalItem.mediaBlobUrl) {
      registerCachedBlobUrl(finalItem.id, finalItem.mediaBlobUrl);
    }

    executeUniversalDownload(finalItem, processedBlob);

    setHistory((prevHist) => {
      const filtered = prevHist.filter((h) => h.id !== finalItem.id);
      const newHist = [finalItem, ...filtered];
      saveDownloadHistory(newHist);
      return newHist;
    });

    downloadHandlesRef.current.delete(finalItem.id);
  };

  // Real Streaming and Download loop manager
  useEffect(() => {
    activeItems.forEach((item) => {
      if (item.status === 'downloading' && !downloadHandlesRef.current.has(item.id)) {
        const handle = startRealDownloadStream(
          item,
          (downloadedBytes, totalBytes, speedBytesPerSec, chunks) => {
            setActiveItems((prev) =>
              prev.map((it) => {
                if (it.id !== item.id) return it;
                const eta = Math.ceil((totalBytes - downloadedBytes) / (speedBytesPerSec || 1));
                return {
                  ...it,
                  downloadedBytes,
                  totalBytes,
                  speedBytesPerSec,
                  etaSeconds: eta,
                  chunks,
                };
              })
            );
            setTotalSpeedMbps(speedBytesPerSec / (1024 * 1024));
          },
          (realBlob, isBotFallback) => {
            const blobUrl = URL.createObjectURL(realBlob);
            const actualReceivedBytes = realBlob.size;
            const isBotBlocked = !!isBotFallback || (item.totalBytes > 5 * 1024 * 1024 && actualReceivedBytes < 500 * 1024);

            const finished: DownloadItem = {
              ...item,
              downloadedBytes: actualReceivedBytes,
              totalBytes: actualReceivedBytes,
              status: 'completed',
              speedBytesPerSec: 0,
              etaSeconds: 0,
              completedAt: Date.now(),
              mediaBlobUrl: blobUrl,
              isFallbackStream: isBotBlocked,
              botChallengeTriggered: isBotBlocked,
              chunks: item.chunks.map((c) => ({ ...c, status: 'completed' as const })),
            };

            setActiveItems((prev) =>
              prev.map((it) => (it.id === item.id ? finished : it))
            );

            handleItemCompleted(finished, realBlob);
          },
          (err) => {
            console.warn(`Real stream for ${item.id} encountered error:`, err);
            downloadHandlesRef.current.delete(item.id);
            setActiveItems((prev) =>
              prev.map((it) =>
                it.id === item.id
                  ? {
                      ...it,
                      status: 'error',
                      errorMessage: err?.message || 'Download stream failed. Please retry.',
                    }
                  : it
              )
            );
          }
        );

        downloadHandlesRef.current.set(item.id, handle);
      }
    });
  }, [activeItems, settings]);

  // Aggregate speed tracker and UI state monitor
  useEffect(() => {
    const interval = setInterval(() => {
      let currentAggregateSpeedBytes = 0;
      setActiveItems((prev) => {
        prev.forEach((item) => {
          if (item.status === 'downloading' || item.status === 'resuming') {
            currentAggregateSpeedBytes += item.speedBytesPerSec || 0;
          }
        });
        return prev;
      });
      setTotalSpeedMbps(currentAggregateSpeedBytes / (1024 * 1024));
    }, 400);

    return () => clearInterval(interval);
  }, []);

  // Handle URL analyze (from Manual input or Social media feed)
  const handleAnalyzeUrl = async (rawUrl: string, autoStartImmediately = false) => {
    if (!rawUrl.trim()) return;
    setIsAnalyzing(true);

    try {
      const extracted = await inspectMediaUrlAsync(rawUrl);
      setIsAnalyzing(false);

      if (autoStartImmediately || settings.autoStartOnPaste) {
        const preferredTag = settings.defaultVideoQuality || '1080p';
        const defQuality =
          extracted.availableQualities.find((q) => q.qualityTag === preferredTag) ||
          extracted.availableQualities.find((q) => q.qualityTag === '1080p') ||
          extracted.availableQualities[0];
        startDownloadWithQuality(extracted, defQuality, settings.saveToEncryptedVault);
      } else {
        setPendingMediaInfo(extracted);
        setIsQualityModalOpen(true);
      }
    } catch (err) {
      console.warn('Inspect media failed, falling back to local analysis:', err);
      const extracted = inspectMediaUrl(rawUrl);
      setIsAnalyzing(false);
      setPendingMediaInfo(extracted);
      setIsQualityModalOpen(true);
    }
  };

  const startDownloadWithQuality = (
    info: ExtractedMediaInfo,
    quality: QualityOption,
    encryptInVault: boolean
  ) => {
    const newItem = createDownloadItem(info, quality, true, encryptInVault);
    completedItemIdsRef.current.delete(newItem.id);
    setActiveItems((prev) => {
      const filtered = prev.filter((item) => item.id !== newItem.id);
      return [newItem, ...filtered];
    });
    setCurrentTab('downloader');
  };

  // Pause / Resume individual transfer
  const handleTogglePause = (id: string) => {
    setActiveItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const isPaused = item.status === 'paused';
        const handle = downloadHandlesRef.current.get(id);
        if (isPaused) {
          handle?.resume();
        } else {
          handle?.pause();
        }
        return {
          ...item,
          status: isPaused ? ('downloading' as const) : ('paused' as const),
          speedBytesPerSec: isPaused ? item.speedBytesPerSec : 0,
        };
      })
    );
  };

  // Simulate network drop & automatic deathless resume
  const handleSimulateDrop = (id: string) => {
    setActiveItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          status: 'resuming',
          speedBytesPerSec: 0,
          autoResumeCount: item.autoResumeCount + 1,
          chunks: item.chunks.map((c) => ({ ...c, status: 'retrying' as const })),
        };
      })
    );

    // Auto recover after 2 seconds
    setTimeout(() => {
      setActiveItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            status: 'downloading',
            chunks: item.chunks.map((c) => ({ ...c, status: 'downloading' as const })),
          };
        })
      );
    }, 2000);
  };

  // Cancel / remove task
  const handleCancel = (id: string) => {
    const handle = downloadHandlesRef.current.get(id);
    handle?.abort();
    downloadHandlesRef.current.delete(id);
    setActiveItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Bulk actions
  const handlePauseAll = () => {
    setActiveItems((prev) =>
      prev.map((i) => (i.status === 'downloading' ? { ...i, status: 'paused' as const, speedBytesPerSec: 0 } : i))
    );
  };

  const handleResumeAll = () => {
    setActiveItems((prev) =>
      prev.map((i) => (i.status === 'paused' ? { ...i, status: 'downloading' as const } : i))
    );
  };

  const handleClearCompleted = () => {
    setActiveItems((prev) => prev.filter((i) => i.status !== 'completed'));
  };

  // Batch queue handler
  const handleQueueBatch = (batchItems: BatchItem[]) => {
    const newDownloads: DownloadItem[] = batchItems.map((b) => {
      const mediaInfo = inspectMediaUrl(b.url);
      mediaInfo.title = b.title;
      return createDownloadItem(mediaInfo, b.quality, true, settings.saveToEncryptedVault);
    });

    newDownloads.forEach((d) => completedItemIdsRef.current.delete(d.id));

    setActiveItems((prev) => {
      const newIds = new Set(newDownloads.map((d) => d.id));
      const filtered = prev.filter((item) => !newIds.has(item.id));
      return [...newDownloads, ...filtered];
    });
    setCurrentTab('downloader');
  };

  // Open in Vault or instant modal player
  const handleOpenInVault = (downloadId: string) => {
    const item = activeItems.find((i) => i.id === downloadId) || history.find((i) => i.id === downloadId);
    if (item) {
      setMediaPlayerItem(item);
    } else {
      setVaultFileToPlay(downloadId);
      setCurrentTab('vault');
    }
  };

  // Clear history
  const handleClearHistory = () => {
    setHistory([]);
    saveDownloadHistory([]);
  };

  // Remove history item
  const handleRemoveHistoryItem = (id: string) => {
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    saveDownloadHistory(updated);
  };

  // Re-download from history
  const handleRedownload = (item: DownloadItem) => {
    const mediaInfo = inspectMediaUrl(item.originalUrl);
    mediaInfo.title = item.title;
    startDownloadWithQuality(mediaInfo, item.quality, item.isEncrypted);
  };

  // Save Settings
  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    applyAccentToDocument(newSettings.accentColor || 'cyan');
    if (newSettings.smartCleanupEnabled) {
      runCleanup(newSettings.smartCleanupDays, true);
    }
  };

  const activeDownloadingCount = activeItems.filter(
    (i) => i.status === 'downloading' || i.status === 'resuming'
  ).length;

  return (
    <div
      className={`min-h-screen w-full max-w-full overflow-x-hidden font-sans transition-colors duration-200 ${
        darkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* App Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        activeCount={activeDownloadingCount}
        totalSpeedMbps={totalSpeedMbps}
        accentColor={settings.accentColor}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenStreamDebugger={() => {
          setStreamDebuggerTargetId(undefined);
          setIsStreamDebuggerOpen(true);
        }}
      />

      {/* Main Container */}
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* URL Input Bar is always accessible on Downloader tab or can be quick-pasted anytime */}
        {currentTab === 'downloader' && (
          <UrlInputBar
            onAnalyzeUrl={handleAnalyzeUrl}
            autoStartOnPaste={settings.autoStartOnPaste}
            setAutoStartOnPaste={(val) => {
              const updated = { ...settings, autoStartOnPaste: val };
              setSettings(updated);
              saveSettings(updated);
            }}
            darkMode={darkMode}
            isAnalyzing={isAnalyzing}
            accentColor={settings.accentColor}
          />
        )}

        {/* Dynamic Tab Views */}
        {currentTab === 'downloader' && (
          <ActiveDownloads
            items={activeItems}
            onTogglePause={handleTogglePause}
            onCancel={handleCancel}
            onSimulateDrop={handleSimulateDrop}
            onRetry={handleTogglePause}
            onPauseAll={handlePauseAll}
            onResumeAll={handleResumeAll}
            onClearCompleted={handleClearCompleted}
            onOpenInVault={handleOpenInVault}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenStreamDebugger={(downloadId) => {
              setStreamDebuggerTargetId(downloadId);
              setIsStreamDebuggerOpen(true);
            }}
            darkMode={darkMode}
            accentColor={settings.accentColor}
          />
        )}

        {currentTab === 'social' && (
          <SocialFeedBrowser
            onSelectUrl={(url) => handleAnalyzeUrl(url, false)}
            onSelectVideoForDownload={(url) => handleAnalyzeUrl(url, false)}
            darkMode={darkMode}
          />
        )}

        {currentTab === 'batch' && (
          <BatchPlaylistDownloader
            onQueueStart={(urls) => {
              urls.forEach((url) => handleAnalyzeUrl(url, true));
            }}
            onQueueBatch={handleQueueBatch}
            darkMode={darkMode}
            accentColor={settings.accentColor}
          />
        )}

        {currentTab === 'vault' && (
          <OfflineVault
            initialFileToPlay={vaultFileToPlay}
            darkMode={darkMode}
            accentColor={settings.accentColor}
          />
        )}

        {currentTab === 'history' && (
          <DownloadHistory
            history={history}
            onClearHistory={handleClearHistory}
            onRemoveItem={handleRemoveHistoryItem}
            onRedownload={handleRedownload}
            onOpenInVault={handleOpenInVault}
            onOpenStreamDebugger={(downloadId) => {
              setStreamDebuggerTargetId(downloadId);
              setIsStreamDebuggerOpen(true);
            }}
            darkMode={darkMode}
            accentColor={settings.accentColor}
          />
        )}
      </main>

      {/* Quality & Format Pop-Up Modal */}
      {isQualityModalOpen && pendingMediaInfo && (
        <DownloadModal
          info={pendingMediaInfo}
          onClose={() => {
            setIsQualityModalOpen(false);
            setPendingMediaInfo(null);
          }}
          onConfirmDownload={(quality, encryptInVault) => {
            startDownloadWithQuality(pendingMediaInfo, quality, encryptInVault);
          }}
          darkMode={darkMode}
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setIsSettingsOpen(false)}
          darkMode={darkMode}
          onToggleDarkMode={(val) => setDarkMode(val)}
          onRunManualCleanup={() => runCleanup(settings.smartCleanupDays, true)}
        />
      )}

      {/* Stream & Headers Debugger Modal */}
      <StreamDebuggerModal
        isOpen={isStreamDebuggerOpen}
        onClose={() => setIsStreamDebuggerOpen(false)}
        initialDownloadId={streamDebuggerTargetId}
        activeDownloads={activeItems}
        darkMode={darkMode}
        onOpenSettings={() => {
          setIsStreamDebuggerOpen(false);
          setIsSettingsOpen(true);
        }}
      />

      {/* Instant Offline Media Player Modal */}
      {mediaPlayerItem && (
        <OfflineMediaPlayerModal
          item={mediaPlayerItem}
          onClose={() => setMediaPlayerItem(null)}
          darkMode={darkMode}
          accentColor={settings.accentColor}
        />
      )}

      {/* In-app Toast Banner for Save & Playback Notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-2.5 p-3.5 rounded-xl shadow-xl border backdrop-blur-md transition-all animate-in slide-in-from-bottom-2 ${
                toast.type === 'success'
                  ? 'bg-emerald-950/90 text-emerald-100 border-emerald-500/30'
                  : toast.type === 'error'
                    ? 'bg-rose-950/90 text-rose-100 border-rose-500/30'
                    : 'bg-zinc-900/90 text-zinc-100 border-zinc-700'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              ) : toast.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 text-xs leading-relaxed">{toast.message}</div>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="opacity-70 hover:opacity-100 p-0.5 ml-1 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
