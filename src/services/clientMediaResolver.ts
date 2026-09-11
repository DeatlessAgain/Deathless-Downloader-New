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
