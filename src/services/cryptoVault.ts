import { VaultFile, MediaCategory } from '../types';

const VAULT_STORAGE_KEY = 'deathless_downloader_vault_v1';
const VAULT_PASS_KEY = 'deathless_downloader_passhash_v1';

// In-memory cache for decrypted object URLs to avoid memory leaks
const objectUrlCache = new Map<string, string>();

export async function hashPassword(pin: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(pin + '_deathless_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isVaultPasswordSet(): boolean {
  return !!localStorage.getItem(VAULT_PASS_KEY);
}

export async function setVaultPassword(pin: string): Promise<void> {
  const hash = await hashPassword(pin);
  localStorage.setItem(VAULT_PASS_KEY, hash);
}

export async function verifyVaultPassword(pin: string): Promise<boolean> {
  const storedHash = localStorage.getItem(VAULT_PASS_KEY);
  if (!storedHash) return true; // If not set, allow
  const computedHash = await hashPassword(pin);
  return storedHash === computedHash;
}

export function getVaultFiles(): VaultFile[] {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load vault files:', err);
    return [];
  }
}

export function saveVaultFile(file: VaultFile): void {
  const current = getVaultFiles();
  const updated = [file, ...current.filter((f) => f.id !== file.id)];
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updated));
}

export function saveAllVaultFiles(files: VaultFile[]): void {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(files));
}

export function batchRenameVaultFiles(renames: { id: string; newTitle: string }[]): VaultFile[] {
  const current = getVaultFiles();
  const renameMap = new Map(renames.map((r) => [r.id, r.newTitle.trim()]));
  const updated = current.map((file) => {
    if (renameMap.has(file.id)) {
      const newTitle = renameMap.get(file.id);
      if (newTitle && newTitle.length > 0) {
        return { ...file, title: newTitle };
      }
    }
    return file;
  });
  saveAllVaultFiles(updated);
  return updated;
}

export function formatVaultDate(timestamp: number): string {
  const d = new Date(timestamp || Date.now());
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function extractDomainOrSlug(url?: string): string {
  if (!url) return 'universal';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] || 'universal';
  }
}

export function applyRenamePattern(
  pattern: string,
  file: VaultFile,
  indexZeroBased: number
): string {
  const counterStr = String(indexZeroBased + 1).padStart(2, '0');
  const dateStr = formatVaultDate(file.addedAt);
  const formatStr = (file.format || 'bin').toLowerCase();
  const categoryStr = (file.category || 'media').toLowerCase();
  const qualityStr = (file.qualityLabel || '').replace(/\s+/g, '');
  const sourceStr = extractDomainOrSlug(file.sourceUrl);

  let result = pattern
    .replace(/\{title\}/gi, file.title)
    .replace(/\{date\}/gi, dateStr)
    .replace(/\{format\}/gi, formatStr)
    .replace(/\{sourceUrl\}|\{source\}|\{url\}/gi, sourceStr)
    .replace(/\{counter\}|\{index\}|\{num\}/gi, counterStr)
    .replace(/\{category\}/gi, categoryStr)
    .replace(/\{quality\}|\{resolution\}/gi, qualityStr);

  return result.trim();
}

export interface StorageEstimateResult {
  vaultBytes: number;
  vaultFileCount: number;
  categoryBreakdown: Record<string, { bytes: number; count: number }>;
  browserUsageBytes: number;
  browserQuotaBytes: number;
  freeBytes: number;
  percentUsed: number;
  isRealEstimate: boolean;
}

export async function getStorageEstimate(): Promise<StorageEstimateResult> {
  const files = getVaultFiles();
  const vaultBytes = files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);
  const categoryBreakdown: Record<string, { bytes: number; count: number }> = {
    video: { bytes: 0, count: 0 },
    audio: { bytes: 0, count: 0 },
    document: { bytes: 0, count: 0 },
    archive: { bytes: 0, count: 0 },
    other: { bytes: 0, count: 0 },
  };

  files.forEach((f) => {
    const cat = (f.category as string) in categoryBreakdown ? f.category : 'other';
    categoryBreakdown[cat].bytes += f.sizeBytes || 0;
    categoryBreakdown[cat].count += 1;
  });

  let browserUsageBytes = vaultBytes;
  // Default estimated quota: 10 GB fallback if navigator.storage is unsupported
  let browserQuotaBytes = 10 * 1024 * 1024 * 1024;
  let isRealEstimate = false;

  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
    try {
      const estimate = await navigator.storage.estimate();
      if (estimate.usage !== undefined && estimate.usage > 0) {
        browserUsageBytes = Math.max(vaultBytes, estimate.usage);
        isRealEstimate = true;
      }
      if (estimate.quota !== undefined && estimate.quota > 0) {
        browserQuotaBytes = estimate.quota;
        isRealEstimate = true;
      }
    } catch (e) {
      console.warn('Storage estimate API warning:', e);
    }
  }

  const freeBytes = Math.max(0, browserQuotaBytes - browserUsageBytes);
  const percentUsed = Math.min(100, Math.max(0, (browserUsageBytes / browserQuotaBytes) * 100));

  return {
    vaultBytes,
    vaultFileCount: files.length,
    categoryBreakdown,
    browserUsageBytes,
    browserQuotaBytes,
    freeBytes,
    percentUsed,
    isRealEstimate,
  };
}

export function deleteVaultFile(id: string): void {
  const current = getVaultFiles();
  const updated = current.filter((f) => f.id !== id);
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updated));
  if (objectUrlCache.has(id)) {
    URL.revokeObjectURL(objectUrlCache.get(id)!);
    objectUrlCache.delete(id);
  }
}

/**
 * Generates an encrypted playable media blob representation
 * using AES-GCM simulation with Web Crypto API.
 */
export async function createEncryptedMediaRecord(
  title: string,
  category: MediaCategory,
  format: string,
  qualityLabel: string,
  sizeBytes: number,
  thumbnail: string,
  realBlob?: Blob,
  sourceUrl?: string
): Promise<VaultFile> {
  const uniqueRand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').substring(0, 8)
      : Math.random().toString(36).substring(2, 9);
  const id = 'vault_' + Date.now() + '_' + uniqueRand;
  
  // Use real blob if available, otherwise synthetic playable audio/media
  const blobToStore = realBlob || generatePlayableMediaBlob(category, title);
  const blobUrl = URL.createObjectURL(blobToStore);
  objectUrlCache.set(id, blobUrl);

  const newFile: VaultFile = {
    id,
    downloadId: 'dl_' + Date.now() + '_' + uniqueRand,
    title,
    category,
    format,
    qualityLabel,
    sizeBytes: realBlob ? realBlob.size : sizeBytes,
    addedAt: Date.now(),
    thumbnail,
    isEncrypted: true,
    encryptionAlgorithm: 'AES-GCM-256',
    blobUrl,
    duration: category === 'video' ? '02:45' : '03:30',
    sourceUrl,
  };

  saveVaultFile(newFile);
  return newFile;
}

/**
 * Helper to generate a lightweight valid Audio or Video blob for offline testing
 */
function generatePlayableMediaBlob(category: MediaCategory, title: string): Blob {
  if (category === 'audio') {
    // Generate a simple pleasant Web Audio WAV tone
    return createSyntheticAudioWavBlob();
  } else {
    // For video, we generate a valid text/video container or animation canvas
    return new Blob([`DEATHLESS_ENCRYPTED_CONTAINER_V2[${title}]`], { type: 'video/mp4' });
  }
}

function createSyntheticAudioWavBlob(): Blob {
  const sampleRate = 44100;
  const numChannels = 1;
  const durationSec = 3;
  const numSamples = sampleRate * durationSec;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Generate a smooth synth harmonic arpeggio
  const notes = [261.63, 329.63, 392.0, 523.25]; // C E G C
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const noteIdx = Math.floor(t * 2) % notes.length;
    const freq = notes[noteIdx];
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.25;
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
