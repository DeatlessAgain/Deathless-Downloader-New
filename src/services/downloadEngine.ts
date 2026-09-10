import { DownloadItem, ChunkProgress, QualityOption, ExtractedMediaInfo } from '../types';
import { createEncryptedMediaRecord } from './cryptoVault';
import { AccentColor } from './accentTheme';
import {
  initStreamDebugSession,
  recordStreamHeaders,
  updateStreamProgress,
  finalizeStreamDebug,
  logStreamEvent,
  saveMediaBlobImproved,
} from './streamDebugService';

const HISTORY_KEY = 'deathless_downloader_history_v1';
const SETTINGS_KEY = 'deathless_downloader_settings_v1';

export interface AppSettings {
  darkMode: boolean;
  autoStartOnPaste: boolean;
  maxConcurrentDownloads: number;
  defaultVideoFormat: 'mp4' | 'mkv' | 'webm';
  defaultVideoQuality: '4K' | '2K' | '1080p' | '720p' | '480p' | '360p';
  defaultAudioQuality: '320k' | '256k' | '192k' | '128k';
  defaultAudioFormat: 'mp3' | 'm4a' | 'flac' | 'wav';
  defaultDownloadFolder: string;
  saveToEncryptedVault: boolean;
  chunkCount: number;
  downloadSpeedLimitMbps: number; // 0 = unlimited
  soundNotifications: boolean;
  desktopNotifications: boolean;
  inAppToastNotifications: boolean;
  // Smart Cleanup
  smartCleanupEnabled: boolean;
  smartCleanupDays: number; // e.g. 1, 3, 7, 14, 30 days
  // UI Color Accent
  accentColor: AccentColor;
  // Download Engine Mode: Residential IP client-side vs Server proxy
  downloadEngineMode: 'smart_auto' | 'client_direct' | 'server_proxy';
}

export const defaultSettings: AppSettings = {
  darkMode: false, // Turned OFF by default as requested
  autoStartOnPaste: false,
  maxConcurrentDownloads: 3,
  defaultVideoFormat: 'mp4',
  defaultVideoQuality: '1080p',
  defaultAudioQuality: '320k',
  defaultAudioFormat: 'mp3',
  defaultDownloadFolder: '~/Downloads/Deathless',
  saveToEncryptedVault: true,
  chunkCount: 8,
  downloadSpeedLimitMbps: 0,
  soundNotifications: true,
  desktopNotifications: true,
  inAppToastNotifications: true,
  smartCleanupEnabled: true,
  smartCleanupDays: 3,
  accentColor: 'cyan',
  downloadEngineMode: 'smart_auto',
};

export function applySmartCleanup(
  activeItems: DownloadItem[],
  history: DownloadItem[],
  days: number,
  enabled: boolean
): { updatedActive: DownloadItem[]; updatedHistory: DownloadItem[]; cleanedCount: number } {
  if (!enabled || days <= 0) {
    return { updatedActive: activeItems, updatedHistory: history, cleanedCount: 0 };
  }

  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  const itemsToKeep: DownloadItem[] = [];
  const itemsToClean: DownloadItem[] = [];

  for (const item of activeItems) {
    if (item.status === 'completed') {
      const completionTime = item.completedAt || item.createdAt;
      if (completionTime < cutoffTime) {
        itemsToClean.push(item);
      } else {
        itemsToKeep.push(item);
      }
    } else {
      itemsToKeep.push(item);
    }
  }

  if (itemsToClean.length === 0) {
    return { updatedActive: activeItems, updatedHistory: history, cleanedCount: 0 };
  }

  // Ensure all cleaned items are preserved in history
  const historyMap = new Map<string, DownloadItem>();
  for (const h of history) {
    historyMap.set(h.id, h);
  }
  for (const cleaned of itemsToClean) {
    if (!historyMap.has(cleaned.id)) {
      historyMap.set(cleaned.id, cleaned);
    }
  }

  const updatedHistory = Array.from(historyMap.values()).sort(
    (a, b) => (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt)
  );

  return {
    updatedActive: itemsToKeep,
    updatedHistory,
    cleanedCount: itemsToClean.length,
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getDownloadHistory(): DownloadItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return getDefaultInitialHistory();
    return JSON.parse(raw);
  } catch {
    return getDefaultInitialHistory();
  }
}

export function saveDownloadHistory(history: DownloadItem[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.error('Failed to save history to storage:', err);
  }
}

export function createDownloadItem(
  info: ExtractedMediaInfo,
  quality: QualityOption,
  autoStart = true,
  encryptInVault = true
): DownloadItem {
  const totalBytes = quality.approxSizeMb * 1024 * 1024;
  const chunkCount = 8;
  const chunkSize = Math.floor(totalBytes / chunkCount);

  const chunks: ChunkProgress[] = Array.from({ length: chunkCount }, (_, idx) => {
    const startByte = idx * chunkSize;
    const endByte = idx === chunkCount - 1 ? totalBytes - 1 : (idx + 1) * chunkSize - 1;
    return {
      id: idx,
      startByte,
      endByte,
      downloadedBytes: 0,
      totalBytes: endByte - startByte + 1,
      status: 'pending',
      speedMbps: 0,
    };
  });

  const settings = loadSettings();
  const safeName = info.title
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 50);
  const ext = (quality.format || 'mp4').toLowerCase();
  const fileName = `${safeName || 'download'}_${quality.qualityTag}.${ext}`;
  const folder = settings.defaultDownloadFolder || '~/Downloads/Deathless';
  const downloadPath = `${folder}/${fileName}`;

  const item: DownloadItem = {
    id: 'dl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    title: info.title,
    fileName,
    downloadPath,
    originalUrl: info.url,
    platform: info.platform,
    category: quality.isAudioOnly ? 'audio' : 'video',
    format: quality.format,
    quality,
    totalBytes,
    downloadedBytes: 0,
    status: autoStart ? 'downloading' : 'queued',
    speedBytesPerSec: 0,
    etaSeconds: 0,
    chunks,
    thumbnail: info.thumbnail,
    duration: info.duration,
    createdAt: Date.now(),
    cdnInfo: info.cdnInfo,
    isEncrypted: encryptInVault,
    vaultStored: false,
    autoResumeCount: 0,
    engineMode: settings.downloadEngineMode || 'smart_auto',
    directStreamUrl: quality.directStreamUrl || quality.directUrl || info.directStreamUrl,
    webPlayerUrl: info.webPlayerUrl,
    alternateStreams: info.alternateStreams,
    manualDownloadMirrors: info.manualDownloadMirrors,
  };

  return item;
}

export function triggerBrowserFileDownload(item: DownloadItem, realBlob?: Blob): void {
  // If we have a realBlob or an existing mediaBlobUrl, use the improved saving engine
  if (realBlob) {
    saveMediaBlobImproved(realBlob, item.fileName, {
      expectedBytes: item.totalBytes,
      downloadId: item.id,
    });
    return;
  }

  if (item.mediaBlobUrl) {
    fetch(item.mediaBlobUrl)
      .then((res) => res.blob())
      .then((blob) => {
        saveMediaBlobImproved(blob, item.fileName, {
          expectedBytes: item.totalBytes,
          downloadId: item.id,
        });
      })
      .catch(() => {
        // Fallback anchor click
        const a = document.createElement('a');
        a.href = item.mediaBlobUrl!;
        a.download = item.fileName || `${item.title.substring(0, 30)}.${item.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    return;
  }

  // Direct server stream download
  const downloadUrl = `/api/download?url=${encodeURIComponent(item.originalUrl)}&formatId=${encodeURIComponent(item.quality.formatId || '')}&format=${encodeURIComponent(item.format)}&isAudioOnly=${item.quality.isAudioOnly}&title=${encodeURIComponent(item.title)}`;
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = item.fileName || `${item.title.substring(0, 30)}.${item.format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export interface ActiveDownloadHandle {
  abort: () => void;
  pause: () => void;
  resume: () => void;
}

export function startRealDownloadStream(
  item: DownloadItem,
  onProgress: (downloadedBytes: number, totalBytes: number, speedBytesPerSec: number, chunks: ChunkProgress[]) => void,
  onComplete: (realBlob: Blob, isBotFallback?: boolean) => void,
  onError: (err: any) => void
): ActiveDownloadHandle {
  const controller = new AbortController();
  let isPaused = false;
  let aborted = false;

  const downloadUrl = `/api/download?url=${encodeURIComponent(item.originalUrl)}&formatId=${encodeURIComponent(item.quality.formatId || '')}&format=${encodeURIComponent(item.format)}&isAudioOnly=${item.quality.isAudioOnly}&title=${encodeURIComponent(item.title)}`;

  // Initialize stream debug session
  initStreamDebugSession(item.id, item.originalUrl, item.fileName, item.totalBytes);
  const streamStartTime = Date.now();

  (async () => {
    try {
      let activeFetchUrl = downloadUrl;
      let usingClientDirect = false;

      // If item has a direct media stream URL and engineMode is not explicitly forced to server_proxy,
      // attempt client-side direct stream fetching from the user's residential IP
      if (
        item.directStreamUrl &&
        item.directStreamUrl.startsWith('http') &&
        item.engineMode !== 'server_proxy'
      ) {
        try {
          logStreamEvent(item.id, 'info', `Attempting client-side residential stream: ${item.directStreamUrl.substring(0, 60)}...`);
          const testRes = await fetch(item.directStreamUrl, {
            signal: controller.signal,
            headers: { Accept: '*/*' },
          });
          if (testRes.ok && testRes.body) {
            activeFetchUrl = item.directStreamUrl;
            usingClientDirect = true;
            logStreamEvent(item.id, 'info', 'Client-side residential connection established successfully (bypassing bot blocks)');
          }
        } catch {
          logStreamEvent(item.id, 'warn', 'Client direct stream CORS restricted, falling back to server stream');
          activeFetchUrl = downloadUrl;
        }
      }

      logStreamEvent(item.id, 'info', `Connecting to stream endpoint: ${activeFetchUrl}`);
      const response = await fetch(activeFetchUrl, { signal: controller.signal });
      if (!response.ok || !response.body) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const allHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        allHeaders[key.toLowerCase()] = val;
      });

      const isBotFallbackHeader =
        response.headers.get('x-bot-blocked') === '1' ||
        response.headers.get('x-fallback-stream') === '1';

      const totalHeader = response.headers.get('content-length');
      const totalBytes = totalHeader ? parseInt(totalHeader, 10) : item.totalBytes;

      // Record headers in debugger
      recordStreamHeaders(item.id, {
        url: downloadUrl,
        statusCode: response.status,
        statusText: response.statusText || 'OK',
        contentLength: totalBytes,
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        contentDisposition: response.headers.get('content-disposition') || undefined,
        acceptRanges: response.headers.get('accept-ranges') || undefined,
        supportsResuming: (response.headers.get('accept-ranges') || '').toLowerCase().includes('bytes'),
        isBotBlocked: isBotFallbackHeader,
        isFallbackStream: isBotFallbackHeader,
        server: response.headers.get('server') || undefined,
        latencyMs: Date.now() - streamStartTime,
        probedAt: Date.now(),
        allHeaders,
      });

      const reader = response.body.getReader();
      const collectedChunks: Uint8Array[] = [];
      let downloaded = 0;
      let lastTime = Date.now();
      let lastBytes = 0;
      let currentSpeed = 0;

      while (!aborted) {
        if (isPaused) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }

        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          collectedChunks.push(value);
          downloaded += value.byteLength;

          const now = Date.now();
          const elapsed = (now - lastTime) / 1000;
          if (elapsed >= 0.25) {
            currentSpeed = (downloaded - lastBytes) / elapsed;
            lastTime = now;
            lastBytes = downloaded;

            const speedMbps = (currentSpeed * 8) / (1024 * 1024);
            updateStreamProgress(item.id, collectedChunks.length, downloaded, speedMbps);

            const chunkCount = item.chunks.length || 8;
            const targetTotal = totalBytes || item.totalBytes;
            const chunkSize = Math.max(1, Math.floor(targetTotal / chunkCount));
            const updatedChunks: ChunkProgress[] = item.chunks.map((ch, idx) => {
              const start = idx * chunkSize;
              const end = idx === chunkCount - 1 ? targetTotal : (idx + 1) * chunkSize;
              const targetSize = end - start;
              const chunkDownloaded = Math.min(targetSize, Math.max(0, downloaded - start));
              return {
                ...ch,
                downloadedBytes: chunkDownloaded,
                totalBytes: targetSize,
                status: chunkDownloaded >= targetSize ? 'completed' : chunkDownloaded > 0 ? 'downloading' : 'pending',
                speedMbps: (currentSpeed * 8) / (1024 * 1024 * chunkCount),
              };
            });

            onProgress(downloaded, targetTotal, currentSpeed, updatedChunks);
          }
        }
      }

      if (!aborted) {
        const mimeType =
          item.category === 'audio'
            ? 'audio/mpeg'
            : item.format === 'zip'
            ? 'application/zip'
            : 'video/mp4';
        const finalBlob = new Blob(collectedChunks, { type: mimeType });
        const isBotFallback =
          isBotFallbackHeader ||
          (item.totalBytes > 10 * 1024 * 1024 && finalBlob.size < 400 * 1024);

        finalizeStreamDebug(item.id, 'completed', {
          sizeBytes: finalBlob.size,
          mimeType,
          saveMethodUsed: 'browser_blob_url',
          verifiedIntegrity: !isBotFallback,
        });

        onComplete(finalBlob, isBotFallback);
      }
    } catch (err: any) {
      if (!aborted) {
        finalizeStreamDebug(item.id, 'failed', undefined, err.message);
        onError(err);
      }
    }
  })();

  return {
    abort: () => {
      aborted = true;
      try {
        controller.abort();
      } catch {}
    },
    pause: () => {
      isPaused = true;
    },
    resume: () => {
      isPaused = false;
    },
  };
}

function getDefaultInitialHistory(): DownloadItem[] {
  return [
    {
      id: 'dl_hist_1',
      title: 'YouTube 4K Nature Documentary - Costa Rica Rainforests in 60FPS HDR',
      fileName: 'Costa_Rica_Rainforests_60FPS_HDR_4K.mp4',
      downloadPath: '~/Downloads/Deathless/Costa_Rica_Rainforests_60FPS_HDR_4K.mp4',
      originalUrl: 'https://youtube.com/watch?v=LXb3EKWsInQ',
      platform: 'youtube',
      category: 'video',
      format: 'mp4',
      quality: {
        id: 'q-4k',
        label: '4K Ultra HD (2160p @ 60fps)',
        resolution: '3840 x 2160',
        qualityTag: '4K',
        format: 'mp4',
        isAudioOnly: false,
        bitrateKbps: 24000,
        fps: 60,
        codec: 'AV1 / HEVC Main 10',
        approxSizeMb: 1420,
      },
      totalBytes: 1420 * 1024 * 1024,
      downloadedBytes: 1420 * 1024 * 1024,
      status: 'completed',
      speedBytesPerSec: 0,
      etaSeconds: 0,
      chunks: [],
      thumbnail: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800&auto=format&fit=crop&q=60',
      duration: '18:45',
      createdAt: Date.now() - 3600 * 1000 * 2,
      completedAt: Date.now() - 3600 * 1000 * 2 + 65000,
      cdnInfo: {
        cdnProvider: 'Google Video Backbone (Googlevideo CDN)',
        nodeLocation: 'Frankfurt Central Edge IX (FRA-02), DE',
        edgeServerIp: '172.217.18.206',
        protocol: 'HTTP/3 (QUIC-RFC9000)',
        latencyMs: 14,
        supportsRangeResume: true,
        directStreamUrl: 'https://rr2---sn-4g5edn7k.googlevideo.com/videoplayback?id=cr1',
        contentLength: 1488977920,
        contentType: 'video/mp4',
      },
      isEncrypted: true,
      vaultStored: true,
      autoResumeCount: 1,
    },
    {
      id: 'dl_hist_2',
      title: 'TikTok Viral Sound Studio Remix (Original Audio 320kbps MP3)',
      fileName: 'TikTok_Viral_Sound_Studio_Remix_320k.mp3',
      downloadPath: '~/Downloads/Deathless/TikTok_Viral_Sound_Studio_Remix_320k.mp3',
      originalUrl: 'https://tiktok.com/@creator/video/719283749281',
      platform: 'tiktok',
      category: 'audio',
      format: 'mp3',
      quality: {
        id: 'q-audio-320',
        label: 'Audio Only - 320 kbps High Fidelity MP3',
        resolution: 'Studio Stereo',
        qualityTag: '320k',
        format: 'mp3',
        isAudioOnly: true,
        bitrateKbps: 320,
        codec: 'LAME MP3 v3.100 (48.0 kHz)',
        approxSizeMb: 18,
      },
      totalBytes: 18 * 1024 * 1024,
      downloadedBytes: 18 * 1024 * 1024,
      status: 'completed',
      speedBytesPerSec: 0,
      etaSeconds: 0,
      chunks: [],
      thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=60',
      duration: '03:12',
      createdAt: Date.now() - 3600 * 1000 * 5,
      completedAt: Date.now() - 3600 * 1000 * 5 + 4000,
      cdnInfo: {
        cdnProvider: 'ByteDance Akamai Edge Infrastructure',
        nodeLocation: 'Singapore Central POP (SIN-05), SG',
        edgeServerIp: '104.93.88.14',
        protocol: 'HTTP/3 (QUIC-Q050)',
        latencyMs: 19,
        supportsRangeResume: true,
        directStreamUrl: 'https://v16-webapp-prime.tiktokcdn.com/audio/320k',
        contentLength: 18874368,
        contentType: 'audio/mpeg',
      },
      isEncrypted: true,
      vaultStored: true,
      autoResumeCount: 0,
    },
    {
      id: 'dl_hist_3',
      title: 'Facebook Watch - Architectural Marvels of Istanbul (1080p 60fps)',
      fileName: 'Architectural_Marvels_of_Istanbul_1080p.mkv',
      downloadPath: '~/Downloads/Deathless/Architectural_Marvels_of_Istanbul_1080p.mkv',
      originalUrl: 'https://facebook.com/watch/?v=982347102938',
      platform: 'facebook',
      category: 'video',
      format: 'mkv',
      quality: {
        id: 'q-1080p60',
        label: '1080p Full HD (60fps High Bitrate MKV)',
        resolution: '1920 x 1080',
        qualityTag: '1080p',
        format: 'mkv',
        isAudioOnly: false,
        bitrateKbps: 6500,
        fps: 60,
        codec: 'H.264 / AVC High@L4.2',
        approxSizeMb: 520,
      },
      totalBytes: 520 * 1024 * 1024,
      downloadedBytes: 520 * 1024 * 1024,
      status: 'completed',
      speedBytesPerSec: 0,
      etaSeconds: 0,
      chunks: [],
      thumbnail: 'https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=800&auto=format&fit=crop&q=60',
      duration: '09:20',
      createdAt: Date.now() - 3600 * 1000 * 12,
      completedAt: Date.now() - 3600 * 1000 * 12 + 28000,
      cdnInfo: {
        cdnProvider: 'Meta Edge Network (FNA Point of Presence)',
        nodeLocation: 'Ashburn Data Center Tier-4 (IAD-12), US',
        edgeServerIp: '157.240.22.35',
        protocol: 'HTTP/2 (Zero-RTT TLS 1.3)',
        latencyMs: 24,
        supportsRangeResume: true,
        directStreamUrl: 'https://video.fash1-1.fna.fbcdn.net/v/t39.25447-2/direct.mp4',
        contentLength: 545259520,
        contentType: 'video/mp4',
      },
      isEncrypted: true,
      vaultStored: true,
      autoResumeCount: 0,
    },
  ];
}
