import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { DownloadItem } from '../types';
import { saveMediaBlobImproved } from './streamDebugService';

export function isMobileApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function getMobilePlatform(): string {
  return Capacitor.getPlatform();
}

// Convert Blob to Base64 data string for Capacitor Filesystem
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Remove data:mime/type;base64, prefix
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

// Save file directly to Android Filesystem / Downloads
export async function saveMediaToMobileFilesystem(
  fileName: string,
  blob: Blob
): Promise<{ success: boolean; uri?: string; path?: string; error?: string }> {
  try {
    const base64Data = await blobToBase64(blob);

    // Write file to Documents directory (accessible by file managers and media apps)
    const result = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true,
    });

    return {
      success: true,
      uri: result.uri,
      path: `Documents/${fileName}`,
    };
  } catch (err: any) {
    console.warn('Native mobile filesystem save error, falling back to cache:', err);
    try {
      const base64Data = await blobToBase64(blob);
      const fallbackResult = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true,
      });
      return {
        success: true,
        uri: fallbackResult.uri,
        path: `Cache/${fileName}`,
      };
    } catch (fallbackErr: any) {
      return {
        success: false,
        error: fallbackErr.message || err.message,
      };
    }
  }
}

// Universal media download handler: detects Android/Capacitor vs Web Browser with File System Access API
export async function executeUniversalDownload(
  item: DownloadItem,
  realBlob?: Blob
): Promise<{ success: boolean; savedLocation?: string; method?: string; warnings?: string[] }> {
  const fileName =
    item.fileName ||
    `${item.title.substring(0, 30).replace(/[^a-zA-Z0-9_-]/g, '_')}.${item.format}`;

  let blobToSave = realBlob;

  if (!blobToSave && item.mediaBlobUrl) {
    try {
      const res = await fetch(item.mediaBlobUrl);
      blobToSave = await res.blob();
    } catch {}
  }

  if (!blobToSave) {
    try {
      const downloadUrl = `/api/download?url=${encodeURIComponent(item.originalUrl)}&formatId=${encodeURIComponent(item.quality.formatId || '')}&format=${encodeURIComponent(item.format)}&isAudioOnly=${item.quality.isAudioOnly}&title=${encodeURIComponent(item.title)}`;
      const res = await fetch(downloadUrl);
      blobToSave = await res.blob();
    } catch (err) {
      console.error('Failed to fetch media stream for save:', err);
    }
  }

  if (blobToSave) {
    const saveResult = await saveMediaBlobImproved(blobToSave, fileName, {
      expectedBytes: item.totalBytes,
      downloadId: item.id,
    });
    return {
      success: saveResult.success,
      savedLocation: saveResult.savedLocation,
      method: saveResult.method,
      warnings: saveResult.warnings,
    };
  }

  // Final fallback: direct link click to streaming endpoint
  const downloadUrl = `/api/download?url=${encodeURIComponent(item.originalUrl)}&formatId=${encodeURIComponent(item.quality.formatId || '')}&format=${encodeURIComponent(item.format)}&isAudioOnly=${item.quality.isAudioOnly}&title=${encodeURIComponent(item.title)}`;
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return { success: true, savedLocation: `Browser Downloads/${fileName}`, method: 'direct_stream' };
}
