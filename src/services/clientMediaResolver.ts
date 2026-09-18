import { DownloadItem, AlternateStreamOption, ManualDownloadMirror, ChunkProgress } from '../types';
import { saveMediaBlobImproved } from './streamDebugService';
import { getApiUrl } from './apiConfig';

export interface AlternativeStreamResult {
  success: boolean;
  videoId?: string;
  directStreamUrl?: string;
  audioStreamUrl?: string;
  alternateStreams: AlternateStreamOption[];
  webPlayerUrls: {
    embed: string;
    invidious: string;
    piped: string;
  };
  manualDownloadMirrors: ManualDownloadMirror[];
  sourceEngine: 'server_ytdlp' | 'invidious_api' | 'cobalt_api' | 'client_fallback';
  message?: string;
}

export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const cleanUrl = url.trim();
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = cleanUrl.match(regExp);
  if (match && match[2].length === 11) {
    return match[2];
  }
  const shortsMatch = cleanUrl.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) {
    return shortsMatch[1];
  }
  return null;
}

export function buildFallbackMirrors(url: string, videoId?: string | null): ManualDownloadMirror[] {
  const vid = videoId || extractYouTubeVideoId(url) || '';
  const mirrors: ManualDownloadMirror[] = [
    {
      name: 'Cobalt Tools',
      url: 'https://cobalt.tools',
      desc: 'Open-source, zero-ad media saver with high bitrates',
      badge: 'Recommended',
    },
    {
      name: 'SaveFrom Web',
      url: `https://en.savefrom.net/1-youtube-video-downloader-386/?url=${encodeURIComponent(url)}`,
      desc: 'Direct browser download gateway with multiple formats',
      badge: 'Popular',
    },
  ];

  if (vid) {
    mirrors.push(
      {
        name: 'Y2Mate Fast Mirror',
        url: `https://www.y2mate.com/youtube/${vid}`,
        desc: 'Instant MP4 and MP3 conversion from residential browser',
        badge: 'Fast Mirror',
      },
      {
        name: 'Invidious Direct Portal',
        url: `https://yewtu.be/watch?v=${vid}`,
        desc: 'Alternative private front-end without Google tracking',
        badge: 'Privacy-First',
      }
    );
  }

  return mirrors;
}

export function buildWebPlayerUrls(videoId: string) {
  return {
    embed: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`,
    invidious: `https://yewtu.be/embed/${videoId}?autoplay=1`,
    piped: `https://piped.video/watch?v=${videoId}`,
  };
}

/**
 * Resolves direct media stream URLs and alternative web player / mirror links
 * by calling backend scraper endpoints or using client-side fallback resolution.
 */
export async function resolveAlternativeStreams(
  url: string,
  isAudioOnly = false
): Promise<AlternativeStreamResult> {
  const videoId = extractYouTubeVideoId(url);

  try {
    const resolveEndpoint = getApiUrl(`/api/resolve-alternative-streams?url=${encodeURIComponent(url)}&isAudioOnly=${isAudioOnly}`);
    const res = await fetch(resolveEndpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        return {
          success: true,
          videoId: data.videoId || videoId || undefined,
          directStreamUrl: data.directStreamUrl,
          audioStreamUrl: data.audioStreamUrl,
          alternateStreams: data.alternateStreams || [],
          webPlayerUrls: data.webPlayerUrls || (videoId ? buildWebPlayerUrls(videoId) : { embed: '', invidious: '', piped: '' }),
          manualDownloadMirrors: data.manualDownloadMirrors?.length ? data.manualDownloadMirrors : buildFallbackMirrors(url, videoId),
          sourceEngine: data.sourceEngine || 'server_ytdlp',
          message: data.message,
        };
      }
    }
  } catch (err) {
    console.warn('Backend alternative streams endpoint unreachable, using client fallback:', err);
  }

  // Client-side fallback if server endpoint is unavailable
  const fallbackPlayer = videoId ? buildWebPlayerUrls(videoId) : { embed: url, invidious: url, piped: url };
  const fallbackMirrors = buildFallbackMirrors(url, videoId);

  return {
    success: true,
    videoId: videoId || undefined,
    alternateStreams: [],
    webPlayerUrls: fallbackPlayer,
    manualDownloadMirrors: fallbackMirrors,
    sourceEngine: 'client_fallback',
    message: 'Fallback web player and mirrors generated client-side',
  };
}

/**
 * Triggers a direct native browser download using an anchor tag.
 * This runs completely on the client side using the user's residential browser,
 * avoiding CORS restrictions for file saving.
 */
export function triggerDirectBrowserDownload(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
  }, 100);
}

/**
 * Executes a client-side stream download directly from the user's browser.
 * Fetches stream chunks from the user's residential IP to bypass datacenter bot detection.
 */
export function startClientSideDownloadStream(
  directUrl: string,
  item: DownloadItem,
  onProgress: (downloadedBytes: number, totalBytes: number, speedBytesPerSec: number, chunks: ChunkProgress[]) => void,
  onComplete: (realBlob: Blob) => void,
  onError: (err: any) => void
): { abort: () => void } {
  const controller = new AbortController();
  let aborted = false;

  (async () => {
    try {
      const response = await fetch(directUrl, {
        signal: controller.signal,
        headers: {
          'Accept': '*/*',
        },
      });

      if (!response.ok || !response.body) {
        throw new Error(`Client direct fetch failed with HTTP ${response.status}`);
      }

      const totalHeader = response.headers.get('content-length');
      const totalBytes = totalHeader ? parseInt(totalHeader, 10) : item.totalBytes;
      const reader = response.body.getReader();
      const collectedChunks: Uint8Array[] = [];
      let downloaded = 0;
      let lastTime = Date.now();
      let lastBytes = 0;
      let currentSpeed = 0;

      while (!aborted) {
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
        const mimeType = item.category === 'audio' ? 'audio/mpeg' : 'video/mp4';
        const finalBlob = new Blob(collectedChunks, { type: mimeType });
        onComplete(finalBlob);
      }
    } catch (err: any) {
      if (!aborted) {
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
  };
}

export interface DirectStreamResolution {
  directUrl?: string;
  source: 'direct_url' | 'cobalt_api' | 'invidious_api' | 'client_fallback';
  mirrors: ManualDownloadMirror[];
  qualityTag?: string;
}

/**
 * Resolves direct media streams for YouTube, TikTok, Instagram, Twitter, and direct links
 * using public client-side endpoints and extraction without requiring private backend servers.
 */
export async function resolveDirectMediaStream(
  url: string,
  isAudioOnly = false
): Promise<DirectStreamResolution> {
  const cleanUrl = url.trim();
  const videoId = extractYouTubeVideoId(cleanUrl);
  const fallbackMirrors = buildFallbackMirrors(cleanUrl, videoId);

  // 1. Direct media file URLs (.mp4, .mp3, .mkv, .webm, .wav, .zip, .iso, etc.)
  if (/\.(mp4|mp3|mkv|webm|m4a|wav|flac|aac|ogg|zip|rar|tar|gz|7z|iso|bin|apk)(\?.*)?$/i.test(cleanUrl)) {
    return {
      directUrl: cleanUrl,
      source: 'direct_url',
      mirrors: fallbackMirrors,
    };
  }

  // 2. Try Cobalt API public instances (supports YouTube, TikTok, Instagram, Twitter, Reddit, Facebook)
  const cobaltInstances = [
    'https://api.cobalt.tools',
    'https://cobalt-api.kwiatekm.tokyo',
    'https://co.wuk.sh',
  ];

  for (const instance of cobaltInstances) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(instance, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: cleanUrl,
          videoQuality: isAudioOnly ? undefined : '720',
          downloadMode: isAudioOnly ? 'audio' : 'auto',
          audioFormat: 'mp3',
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const streamUrl = data.url || (data.stream && data.stream.url);
        if (streamUrl && typeof streamUrl === 'string' && streamUrl.startsWith('http')) {
          return {
            directUrl: streamUrl,
            source: 'cobalt_api',
            mirrors: fallbackMirrors,
            qualityTag: '720p',
          };
        }
      }
    } catch {
      // Continue to next instance or resolver
    }
  }

  // 3. For YouTube: Try Invidious Public API instances for direct format streams
  if (videoId) {
    const invidiousInstances = [
      'https://invidious.nerdvpn.de',
      'https://inv.nadeko.net',
      'https://yewtu.be',
      'https://invidious.jing.rocks',
    ];

    for (const invInstance of invidiousInstances) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(`${invInstance}/api/v1/videos/${videoId}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timer);

        if (res.ok) {
          const data = await res.json();
          const formatStreams = data.formatStreams || [];
          const adaptiveFormats = data.adaptiveFormats || [];

          if (isAudioOnly) {
            const audioStream = adaptiveFormats.find(
              (f: any) => (f.type?.includes('audio') || f.container === 'm4a') && f.url
            );
            if (audioStream?.url) {
              return {
                directUrl: audioStream.url,
                source: 'invidious_api',
                mirrors: fallbackMirrors,
                qualityTag: 'Audio',
              };
            }
          } else {
            const video720 =
              formatStreams.find((f: any) => f.qualityLabel?.includes('720') && f.url) ||
              formatStreams.find((f: any) => f.qualityLabel?.includes('360') && f.url) ||
              formatStreams[0];
            if (video720?.url) {
              return {
                directUrl: video720.url,
                source: 'invidious_api',
                mirrors: fallbackMirrors,
                qualityTag: video720.qualityLabel || '720p',
              };
            }
          }
        }
      } catch {
        // Try next instance
      }
    }
  }

  // Fallback to manual mirrors
  return {
    source: 'client_fallback',
    mirrors: fallbackMirrors,
  };
}

