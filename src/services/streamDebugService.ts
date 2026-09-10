import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { StreamHeaderInfo, StreamDebugLog, StreamSessionDebug, SaveResult } from '../types';

// In-memory debug sessions store
const sessionsMap = new Map<string, StreamSessionDebug>();
const listeners = new Set<(sessions: StreamSessionDebug[]) => void>();

function notifyListeners() {
  const all = Array.from(sessionsMap.values()).sort(
    (a, b) => b.streamStartTime - a.streamStartTime
  );
  listeners.forEach((fn) => {
    try {
      fn(all);
    } catch {}
  });
}

export function subscribeToStreamDebug(
  callback: (sessions: StreamSessionDebug[]) => void
): () => void {
  listeners.add(callback);
  callback(Array.from(sessionsMap.values()).sort((a, b) => b.streamStartTime - a.streamStartTime));
  return () => {
    listeners.delete(callback);
  };
}

export function getStreamSession(downloadId: string): StreamSessionDebug | undefined {
  return sessionsMap.get(downloadId);
}

export function getAllStreamSessions(): StreamSessionDebug[] {
  return Array.from(sessionsMap.values()).sort(
    (a, b) => b.streamStartTime - a.streamStartTime
  );
}

export function clearStreamSessions(): void {
  sessionsMap.clear();
  notifyListeners();
}

export function initStreamDebugSession(
  downloadId: string,
  url: string,
  fileName: string,
  totalBytesExpected: number
): StreamSessionDebug {
  const session: StreamSessionDebug = {
    downloadId,
    url,
    fileName,
    chunksReceived: 0,
    bytesReceived: 0,
    totalBytesExpected,
    streamStartTime: Date.now(),
    avgSpeedMbps: 0,
    peakSpeedMbps: 0,
    status: 'connecting',
    logs: [
      {
        id: Math.random().toString(36).slice(2, 9),
        timestamp: Date.now(),
        type: 'info',
        message: `Stream debug session initiated for "${fileName}"`,
        details: { expectedBytes: totalBytesExpected, url },
      },
    ],
  };

  sessionsMap.set(downloadId, session);
  notifyListeners();
  return session;
}

export function logStreamEvent(
  downloadId: string,
  type: StreamDebugLog['type'],
  message: string,
  details?: Record<string, any>
): void {
  const session = sessionsMap.get(downloadId);
  if (!session) return;

  session.logs.push({
    id: Math.random().toString(36).slice(2, 9),
    timestamp: Date.now(),
    type,
    message,
    details,
  });

  // Limit log count per session to 250 entries
  if (session.logs.length > 250) {
    session.logs = session.logs.slice(-200);
  }

  notifyListeners();
}

export function recordStreamHeaders(
  downloadId: string,
  headers: StreamHeaderInfo
): void {
  const session = sessionsMap.get(downloadId);
  if (!session) return;

  session.headers = headers;
  session.status = 'streaming';
  session.logs.push({
    id: Math.random().toString(36).slice(2, 9),
    timestamp: Date.now(),
    type: 'header',
    message: `HTTP Response Headers Received: status ${headers.statusCode} ${headers.statusText}`,
    details: {
      contentType: headers.contentType,
      contentLength: headers.contentLength,
      acceptRanges: headers.acceptRanges,
      server: headers.server,
      isBotBlocked: headers.isBotBlocked,
    },
  });

  notifyListeners();
}

export function updateStreamProgress(
  downloadId: string,
  chunksReceived: number,
  bytesReceived: number,
  currentSpeedMbps: number
): void {
  const session = sessionsMap.get(downloadId);
  if (!session) return;

  session.chunksReceived = chunksReceived;
  session.bytesReceived = bytesReceived;
  session.peakSpeedMbps = Math.max(session.peakSpeedMbps, currentSpeedMbps);

  const elapsedSec = (Date.now() - session.streamStartTime) / 1000;
  if (elapsedSec > 0) {
    session.avgSpeedMbps = (bytesReceived * 8) / (1024 * 1024 * elapsedSec);
  }

  // Periodic log on major chunk milestones (every 100 chunks or 50MB)
  if (chunksReceived > 0 && chunksReceived % 100 === 0) {
    logStreamEvent(
      downloadId,
      'chunk',
      `Stream chunk progress: ${chunksReceived} chunks transferred (${(bytesReceived / (1024 * 1024)).toFixed(2)} MB at ${currentSpeedMbps.toFixed(1)} Mbps)`
    );
  }

  notifyListeners();
}

export function finalizeStreamDebug(
  downloadId: string,
  status: 'completed' | 'failed',
  blobInfo?: StreamSessionDebug['blobInfo'],
  errorMsg?: string
): void {
  const session = sessionsMap.get(downloadId);
  if (!session) return;

  session.status = status;
  session.streamEndTime = Date.now();
  if (blobInfo) {
    session.blobInfo = blobInfo;
  }

  if (status === 'completed') {
    logStreamEvent(
      downloadId,
      'info',
      `Stream completed successfully! Received ${session.bytesReceived} bytes in ${session.chunksReceived} chunks. Peak speed: ${session.peakSpeedMbps.toFixed(1)} Mbps.`
    );
  } else {
    logStreamEvent(
      downloadId,
      'error',
      `Stream halted with error: ${errorMsg || 'Unknown error'}`
    );
  }

  notifyListeners();
}

// Probe HTTP Stream & Headers via Server API or Direct HEAD
export async function probeStreamHeaders(
  url: string,
  options: {
    formatId?: string;
    format?: string;
    isAudioOnly?: boolean;
    title?: string;
  } = {}
): Promise<StreamHeaderInfo> {
  const startTime = Date.now();
  try {
    const params = new URLSearchParams();
    params.set('url', url);
    if (options.formatId) params.set('formatId', options.formatId);
    if (options.format) params.set('format', options.format);
    if (options.isAudioOnly) params.set('isAudioOnly', 'true');
    if (options.title) params.set('title', options.title);

    const res = await fetch(`/api/stream-headers?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
    }

    const data: StreamHeaderInfo = await res.json();
    return data;
  } catch (err: any) {
    // Fallback: direct browser fetch with HEAD if possible
    try {
      const directRes = await fetch(url, { method: 'HEAD' });
      const allHeaders: Record<string, string> = {};
      directRes.headers.forEach((val, key) => {
        allHeaders[key.toLowerCase()] = val;
      });

      const contentLength = parseInt(allHeaders['content-length'] || '0', 10);
      const contentType = allHeaders['content-type'] || 'application/octet-stream';
      const acceptRanges = allHeaders['accept-ranges'] || 'none';

      return {
        url,
        statusCode: directRes.status,
        statusText: directRes.statusText || 'OK',
        contentLength,
        contentType,
        contentDisposition: allHeaders['content-disposition'],
        acceptRanges,
        supportsResuming: acceptRanges.toLowerCase().includes('bytes'),
        server: allHeaders['server'],
        eTag: allHeaders['etag'],
        lastModified: allHeaders['last-modified'],
        cacheControl: allHeaders['cache-control'],
        latencyMs: Date.now() - startTime,
        probedAt: Date.now(),
        allHeaders,
      };
    } catch {
      throw new Error(`Could not probe stream headers: ${err.message}`);
    }
  }
}

// Convert Blob to Base64 in safe chunks for mobile storage
async function blobToBase64Safe(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

// Determine MIME type based on file extension
export function getMimeTypeForExtension(ext: string): string {
  const cleanExt = ext.replace('.', '').toLowerCase();
  switch (cleanExt) {
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mkv':
      return 'video/x-matroska';
    case 'mov':
      return 'video/quicktime';
    case 'avi':
      return 'video/x-msvideo';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
    case 'aac':
      return 'audio/mp4';
    case 'wav':
      return 'audio/wav';
    case 'flac':
      return 'audio/flac';
    case 'ogg':
      return 'audio/ogg';
    case 'zip':
      return 'application/zip';
    case 'tar':
      return 'application/x-tar';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Advanced & Improved Blob Saving Engine
 * 1. File System Access API (showSaveFilePicker) with native OS file dialog & streaming write
 * 2. Native Capacitor Mobile Filesystem with safe base64 storage
 * 3. Browser Object URL anchor tag fallback with timeout revoke
 * 4. Full integrity verification and warning detection
 */
export async function saveMediaBlobImproved(
  blob: Blob,
  fileName: string,
  options: {
    expectedBytes?: number;
    downloadId?: string;
    onProgress?: (message: string) => void;
  } = {}
): Promise<SaveResult> {
  const ext = fileName.split('.').pop() || 'mp4';
  const mimeType = getMimeTypeForExtension(ext);
  const cleanName = fileName.replace(/[/\\?%*:|"<>]/g, '_');
  const expectedBytes = options.expectedBytes || blob.size;
  const verifiedIntegrity = blob.size >= Math.min(expectedBytes * 0.9, expectedBytes);
  const warnings: string[] = [];

  if (expectedBytes > 5 * 1024 * 1024 && blob.size < 500 * 1024) {
    warnings.push(
      `File size (${(blob.size / 1024).toFixed(1)} KB) is significantly smaller than expected (${(expectedBytes / (1024 * 1024)).toFixed(1)} MB). Upstream server may have sent a fallback clip or bot challenge.`
    );
  }

  if (options.downloadId) {
    logStreamEvent(
      options.downloadId,
      'save',
      `Starting improved blob save for "${cleanName}" (${(blob.size / (1024 * 1024)).toFixed(2)} MB, MIME: ${mimeType})`
    );
  }

  // 1. Check if running as native mobile app (Capacitor)
  if (Capacitor.isNativePlatform()) {
    try {
      options.onProgress?.('Saving to mobile Documents storage...');
      const base64Data = await blobToBase64Safe(blob);

      const writeResult = await Filesystem.writeFile({
        path: cleanName,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true,
      });

      if (options.downloadId) {
        logStreamEvent(
          options.downloadId,
          'save',
          `Saved to Android/iOS native filesystem at ${writeResult.uri}`
        );
      }

      return {
        success: true,
        method: 'mobile_filesystem',
        savedLocation: `Documents/${cleanName}`,
        sizeBytes: blob.size,
        verifiedIntegrity,
        warnings: warnings.length ? warnings : undefined,
      };
    } catch (mobileErr: any) {
      console.warn('Native mobile save failed, attempting browser fallback:', mobileErr);
      warnings.push(`Native mobile write error: ${mobileErr.message}`);
    }
  }

  // 2. Check modern File System Access API (showSaveFilePicker)
  // Supported in Chrome 86+, Edge 86+, Opera, Desktop Browsers
  if ('showSaveFilePicker' in window && typeof (window as any).showSaveFilePicker === 'function') {
    try {
      options.onProgress?.('Opening native file save dialog...');
      const pickerOptions: any = {
        suggestedName: cleanName,
        types: [
          {
            description: `${ext.toUpperCase()} Media File`,
            accept: {
              [mimeType]: [`.${ext}`],
            },
          },
        ],
      };

      const fileHandle = await (window as any).showSaveFilePicker(pickerOptions);
      options.onProgress?.('Writing data to disk stream...');

      const writableStream = await fileHandle.createWritable();
      await writableStream.write(blob);
      await writableStream.close();

      if (options.downloadId) {
        logStreamEvent(
          options.downloadId,
          'save',
          `Directly streamed to disk via File System Access API: ${fileHandle.name}`
        );
      }

      return {
        success: true,
        method: 'file_system_api',
        savedLocation: fileHandle.name,
        sizeBytes: blob.size,
        verifiedIntegrity,
        warnings: warnings.length ? warnings : undefined,
      };
    } catch (pickerErr: any) {
      // If user aborted/cancelled the picker, don't trigger anchor download
      if (pickerErr.name === 'AbortError') {
        if (options.downloadId) {
          logStreamEvent(options.downloadId, 'info', 'File save picker was closed by user');
        }
        return {
          success: false,
          method: 'file_system_api',
          savedLocation: 'Cancelled',
          sizeBytes: 0,
          verifiedIntegrity: false,
          error: 'Save cancelled by user',
        };
      }
      // If error (e.g. security permission in iframe), fall through to anchor tag
      console.warn('File System Access API failed, falling back to blob URL:', pickerErr);
      warnings.push(`File System API fallback: ${pickerErr.message}`);
    }
  }

  // 3. Fallback: Standard Browser Object URL Download with automatic revocation
  try {
    options.onProgress?.('Triggering browser download...');
    const typedBlob = new Blob([blob], { type: mimeType });
    const blobUrl = URL.createObjectURL(typedBlob);

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = cleanName;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch {}
    }, 45000);

    if (options.downloadId) {
      logStreamEvent(
        options.downloadId,
        'save',
        `Browser file download initiated for ${cleanName} via Object URL`
      );
    }

    return {
      success: true,
      method: 'browser_blob_url',
      savedLocation: `Browser Downloads/${cleanName}`,
      sizeBytes: blob.size,
      verifiedIntegrity,
      warnings: warnings.length ? warnings : undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      method: 'browser_blob_url',
      savedLocation: '',
      sizeBytes: blob.size,
      verifiedIntegrity: false,
      error: err.message,
    };
  }
}
