export type PlatformType =
  | 'youtube'
  | 'tiktok'
  | 'facebook'
  | 'instagram'
  | 'twitter'
  | 'vimeo'
  | 'reddit'
  | 'direct';

export type MediaCategory = 'video' | 'audio' | 'document' | 'archive';

export interface QualityOption {
  id: string;
  label: string; // e.g., '4K Ultra HD (2160p)', '1080p 60fps', '320kbps MP3'
  resolution?: string; // e.g., '3840x2160', '1920x1080', 'Audio'
  qualityTag: '4K' | '2K' | '1080p' | '720p' | '480p' | '360p' | '320k' | '256k' | '128k' | 'original';
  format: 'mp4' | 'mkv' | 'webm' | 'mp3' | 'm4a' | 'flac' | 'wav' | 'zip';
  isAudioOnly: boolean;
  isVideoOnly?: boolean;
  bitrateKbps: number;
  fps?: number;
  codec: string;
  approxSizeMb: number;
  formatId?: string;
  directUrl?: string;
  directStreamUrl?: string;
  conversion?: {
    sourceFormat: string;
    targetFormat: string;
    isAudioOnly: boolean;
    enabled: boolean;
  };
}

export interface ChunkProgress {
  id: number;
  startByte: number;
  endByte: number;
  downloadedBytes: number;
  totalBytes: number;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'retrying';
  speedMbps: number;
}

export interface CdnMetadata {
  cdnProvider: string;
  nodeLocation: string;
  edgeServerIp: string;
  protocol: string;
  latencyMs: number;
  supportsRangeResume: boolean;
  directStreamUrl: string;
  contentLength: number;
  contentType: string;
}

export interface AlternateStreamOption {
  label: string;
  url: string;
  quality?: string;
  isAudioOnly?: boolean;
  type?: string;
  itag?: number;
  filesizeApprox?: number;
}

export interface ManualDownloadMirror {
  name: string;
  url: string;
  desc?: string;
  badge?: string;
}

export interface DownloadItem {
  id: string;
  title: string;
  fileName: string;
  downloadPath: string;
  originalUrl: string;
  platform: PlatformType;
  category: MediaCategory;
  format: string;
  quality: QualityOption;
  totalBytes: number;
  downloadedBytes: number;
  status: 'queued' | 'downloading' | 'paused' | 'resuming' | 'completed' | 'failed';
  speedBytesPerSec: number;
  etaSeconds: number;
  chunks: ChunkProgress[];
  thumbnail: string;
  duration?: string;
  createdAt: number;
  completedAt?: number;
  cdnInfo: CdnMetadata;
  isEncrypted: boolean;
  vaultStored: boolean;
  mediaBlobUrl?: string;
  errorMessage?: string;
  autoResumeCount: number;
  isFallbackStream?: boolean;
  botChallengeTriggered?: boolean;
  engineMode?: 'smart_auto' | 'client_direct' | 'server_proxy';
  directStreamUrl?: string;
  webPlayerUrl?: string;
  alternateStreams?: AlternateStreamOption[];
  manualDownloadMirrors?: ManualDownloadMirror[];
  conversion?: {
    sourceFormat: string;
    targetFormat: string;
    isAudioOnly: boolean;
    enabled: boolean;
  };
}

export interface BatchItem {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  platform: PlatformType;
  selected: boolean;
  quality: QualityOption;
  status: 'idle' | 'queued' | 'downloading' | 'done';
}

export interface SocialPost {
  id: string;
  platform: PlatformType;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  caption: string;
  thumbnail: string;
  videoPreviewUrl: string;
  views: string;
  likes: string;
  shares: string;
  duration: string;
  mediaUrl: string;
  date: string;
}

export interface VaultFile {
  id: string;
  downloadId: string;
  title: string;
  category: MediaCategory;
  format: string;
  qualityLabel: string;
  sizeBytes: number;
  addedAt: number;
  thumbnail: string;
  isEncrypted: boolean;
  encryptionAlgorithm: 'AES-GCM-256';
  blobUrl?: string;
  duration?: string;
  sourceUrl?: string;
}

export interface ConversionOptions {
  targetFormat: string;
  targetCategory: MediaCategory;
  videoResolution?: string;
  videoCodec?: string;
  videoBitrateKbps?: number;
  audioBitrateKbps?: number;
  audioSampleRate?: number;
  audioChannels?: 'mono' | 'stereo' | 'surround';
  removeAudio?: boolean;
  compressionRatio?: number; // 1 to 100
}

export interface ConversionTask {
  id: string;
  sourceFileName: string;
  sourceFileSize: number;
  sourceFormat: string;
  sourceThumbnail?: string;
  targetFormat: string;
  targetFileName: string;
  status: 'idle' | 'converting' | 'completed' | 'failed';
  progressPercent: number;
  currentPhase: string;
  speedMultiplier: number;
  options: ConversionOptions;
  createdAt: number;
  completedAt?: number;
  outputSizeBytes?: number;
}

export interface ExtractedMediaInfo {
  url: string;
  platform: PlatformType;
  title: string;
  thumbnail: string;
  duration: string;
  author: string;
  cdnInfo: CdnMetadata;
  availableQualities: QualityOption[];
  isPlaylist?: boolean;
  playlistItemsCount?: number;
  videoId?: string;
  directStreamUrl?: string;
  webPlayerUrl?: string;
  alternateStreams?: AlternateStreamOption[];
  manualDownloadMirrors?: ManualDownloadMirror[];
}

export interface StreamHeaderInfo {
  url: string;
  statusCode: number;
  statusText: string;
  contentLength: number;
  contentType: string;
  contentDisposition?: string;
  parsedFileName?: string;
  acceptRanges?: string;
  contentRange?: string;
  supportsResuming?: boolean;
  isBotBlocked?: boolean;
  isFallbackStream?: boolean;
  server?: string;
  eTag?: string;
  lastModified?: string;
  cacheControl?: string;
  latencyMs: number;
  probedAt: number;
  hasCookiesConfigured?: boolean;
  botErrorMessage?: string;
  allHeaders: Record<string, string>;
}

export interface StreamDebugLog {
  id: string;
  timestamp: number;
  type: 'info' | 'header' | 'chunk' | 'save' | 'warn' | 'error';
  message: string;
  details?: Record<string, any>;
}

export interface StreamSessionDebug {
  downloadId: string;
  url: string;
  fileName: string;
  headers?: StreamHeaderInfo;
  chunksReceived: number;
  bytesReceived: number;
  totalBytesExpected: number;
  streamStartTime: number;
  streamEndTime?: number;
  avgSpeedMbps: number;
  peakSpeedMbps: number;
  status: 'idle' | 'connecting' | 'streaming' | 'assembling_blob' | 'saving' | 'completed' | 'failed';
  blobInfo?: {
    sizeBytes: number;
    mimeType: string;
    saveMethodUsed: 'file_system_api' | 'mobile_filesystem' | 'browser_blob_url' | 'direct_stream' | 'mobile_share_api';
    savedLocation?: string;
    verifiedIntegrity: boolean;
  };
  logs: StreamDebugLog[];
}

export interface SaveResult {
  success: boolean;
  method: 'file_system_api' | 'mobile_filesystem' | 'browser_blob_url' | 'direct_stream' | 'mobile_share_api';
  savedLocation: string;
  sizeBytes: number;
  verifiedIntegrity: boolean;
  warnings?: string[];
  error?: string;
}
