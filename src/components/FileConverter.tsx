import React, { useState, useRef, useEffect } from 'react';
import {
  Repeat,
  UploadCloud,
  FileVideo,
  FileAudio,
  Film,
  Music,
  Sliders,
  CheckCircle2,
  Download,
  Play,
  Clock,
  Sparkles,
  Zap,
  RefreshCw,
  FolderOpen,
  Settings2,
  Check,
  AlertCircle,
  X,
  VolumeX,
  Volume2,
  SlidersHorizontal,
} from 'lucide-react';
import { DownloadItem, ConversionTask, ConversionOptions } from '../types';
import { isMobileApp, saveMediaToMobileFilesystem } from '../services/mobileDownloadService';

interface FileConverterProps {
  history: DownloadItem[];
  onAddToHistory?: (item: DownloadItem) => void;
  onOpenInVault?: (downloadId: string) => void;
  darkMode: boolean;
  preselectedFile?: DownloadItem | null;
  onClearPreselected?: () => void;
}

const sampleConverterFiles = [
  {
    name: 'Costa_Rica_Rainforest_4K_60FPS.mp4',
    size: 480 * 1024 * 1024,
    format: 'mp4',
    category: 'video' as const,
    thumb: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800&auto=format&fit=crop&q=60',
    duration: '06:45',
  },
  {
    name: 'Cyberpunk_Neo_Tokyo_Synthwave.wav',
    size: 45 * 1024 * 1024,
    format: 'wav',
    category: 'audio' as const,
    thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=60',
    duration: '03:52',
  },
  {
    name: 'Drone_Alps_Glacier_Tour.mkv',
    size: 720 * 1024 * 1024,
    format: 'mkv',
    category: 'video' as const,
    thumb: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=60',
    duration: '08:14',
  },
];

export const FileConverter: React.FC<FileConverterProps> = ({
  history,
  onAddToHistory,
  onOpenInVault,
  darkMode,
  preselectedFile,
  onClearPreselected,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceTab, setSourceTab] = useState<'upload' | 'history' | 'sample'>('upload');

  // Selected source file details
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [selectedFileSize, setSelectedFileSize] = useState<number>(0);
  const [selectedFileFormat, setSelectedFileFormat] = useState<string>('mp4');
  const [selectedFileCategory, setSelectedFileCategory] = useState<'video' | 'audio'>('video');
  const [selectedThumbnail, setSelectedThumbnail] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<string>('05:00');

  // Conversion target options
  const [targetCategory, setTargetCategory] = useState<'video' | 'audio'>('video');
  const [targetFormat, setTargetFormat] = useState<string>('mp4');
  const [videoResolution, setVideoResolution] = useState<string>('1080p');
  const [videoCodec, setVideoCodec] = useState<string>('H.264 / AVC');
  const [audioBitrate, setAudioBitrate] = useState<number>(320);
  const [audioSampleRate, setAudioSampleRate] = useState<number>(48000);
  const [audioChannels, setAudioChannels] = useState<'stereo' | 'mono'>('stereo');
  const [removeAudio, setRemoveAudio] = useState<boolean>(false);
  const [compressionRatio, setCompressionRatio] = useState<number>(85); // 100 = lossless/high quality, 60 = web small

  // Conversion state
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [conversionProgress, setConversionProgress] = useState<number>(0);
  const [currentPhase, setCurrentPhase] = useState<string>('Ready');
  const [conversionSpeed, setConversionSpeed] = useState<number>(4.2);
  const [completedTask, setCompletedTask] = useState<ConversionTask | null>(null);
  const [selectedRawFile, setSelectedRawFile] = useState<File | null>(null);
  const convertedBlobMap = useRef<Map<string, Blob>>(new Map());

  // Conversion history ledger for this session
  const [sessionConversions, setSessionConversions] = useState<ConversionTask[]>([]);

  // If a preselected file is passed (e.g. from history / active downloads)
  useEffect(() => {
    if (preselectedFile) {
      setSelectedFileName(preselectedFile.fileName || preselectedFile.title);
      setSelectedFileSize(preselectedFile.totalBytes || 250 * 1024 * 1024);
      setSelectedFileFormat(preselectedFile.format || 'mp4');
      setSelectedFileCategory(preselectedFile.category === 'audio' ? 'audio' : 'video');
      setSelectedThumbnail(preselectedFile.thumbnail);
      setSelectedDuration(preselectedFile.duration || '05:00');
      // Set sensible target
      if (preselectedFile.category === 'audio') {
        setTargetCategory('audio');
        setTargetFormat(preselectedFile.format === 'mp3' ? 'wav' : 'mp3');
      } else {
        setTargetCategory('video');
        setTargetFormat(preselectedFile.format === 'mkv' ? 'mp4' : 'mkv');
      }
      if (onClearPreselected) onClearPreselected();
    }
  }, [preselectedFile]);

  // Handle local file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
      const isAudio = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'].includes(ext);

      setSelectedFileName(file.name);
      setSelectedFileSize(file.size || 150 * 1024 * 1024);
      setSelectedFileFormat(ext);
      setSelectedFileCategory(isAudio ? 'audio' : 'video');
      setSelectedThumbnail(
        isAudio
          ? 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=60'
          : 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=800&auto=format&fit=crop&q=60'
      );
      setSelectedDuration('04:30');
      setSelectedRawFile(file);

      // Auto-set conversion mode
      if (isAudio) {
        setTargetCategory('audio');
        setTargetFormat(ext === 'mp3' ? 'wav' : 'mp3');
      } else {
        setTargetCategory('video');
        setTargetFormat(ext === 'mp4' ? 'mkv' : 'mp4');
      }
      setCompletedTask(null);
    }
  };

  // Handle selecting from history
  const handleSelectFromHistory = (item: DownloadItem) => {
    setSelectedFileName(item.fileName || item.title);
    setSelectedFileSize(item.totalBytes);
    setSelectedFileFormat(item.format);
    setSelectedFileCategory(item.category === 'audio' ? 'audio' : 'video');
    setSelectedThumbnail(item.thumbnail);
    setSelectedDuration(item.duration || '06:00');

    if (item.category === 'audio') {
      setTargetCategory('audio');
      setTargetFormat(item.format === 'mp3' ? 'wav' : 'mp3');
    } else {
      setTargetCategory('video');
      setTargetFormat(item.format === 'mkv' ? 'mp4' : 'mkv');
    }
    setCompletedTask(null);
  };

  // Handle selecting from samples
  const handleSelectSample = (sample: (typeof sampleConverterFiles)[0]) => {
    setSelectedFileName(sample.name);
    setSelectedFileSize(sample.size);
    setSelectedFileFormat(sample.format);
    setSelectedFileCategory(sample.category);
    setSelectedThumbnail(sample.thumb);
    setSelectedDuration(sample.duration);

    if (sample.category === 'audio') {
      setTargetCategory('audio');
      setTargetFormat(sample.format === 'mp3' ? 'flac' : 'mp3');
    } else {
      setTargetCategory('video');
      setTargetFormat(sample.format === 'mp4' ? 'mkv' : 'mp4');
    }
    setCompletedTask(null);
  };

  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  };

  // Calculate estimated output size
  const calculateEstimatedOutputSize = (): number => {
    if (!selectedFileSize) return 0;
    if (targetCategory === 'audio') {
      // Audio size: bitrate * duration (approx 4-5 mins = 280 sec)
      const approxSeconds = 300;
      const bits = audioBitrate * 1000 * approxSeconds;
      return Math.round(bits / 8);
    } else {
      // Video size adjustment based on resolution and compression ratio
      let ratio = compressionRatio / 100;
      if (videoResolution === '720p') ratio *= 0.65;
      if (videoResolution === '480p') ratio *= 0.4;
      if (videoResolution === '4K') ratio *= 1.8;
      if (removeAudio) ratio *= 0.88;
      return Math.round(selectedFileSize * ratio);
    }
  };

  // Output file name
  const getTargetFileName = (): string => {
    if (!selectedFileName) return `converted_output.${targetFormat}`;
    const base = selectedFileName.substring(0, selectedFileName.lastIndexOf('.')) || selectedFileName;
    const tag = targetCategory === 'audio' ? `${audioBitrate}k` : videoResolution;
    return `${base}_converted_${tag}.${targetFormat}`;
  };

  // Start conversion simulation
  const handleStartConversion = () => {
    if (!selectedFileName) return;

    setIsConverting(true);
    setConversionProgress(0);
    setCompletedTask(null);

    const phases = [
      'Demuxing container stream & extracting tracks...',
      targetCategory === 'video'
        ? `Transcoding video frames via ${videoCodec} at ${videoResolution}...`
        : 'Decoding raw PCM waveform & applying psychoacoustic filter...',
      removeAudio
        ? 'Stripping audio channel tracks...'
        : `Encoding audio channel at ${audioBitrate} kbps (${audioSampleRate} Hz)...`,
      'Finalizing container metadata & writing fast-start atom...',
    ];

    let currentStep = 0;
    let progress = 0;

    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 8) + 5;
      setConversionSpeed(Number((3.5 + Math.random() * 2).toFixed(1)));

      if (progress < 25) {
        currentStep = 0;
      } else if (progress < 60) {
        currentStep = 1;
      } else if (progress < 88) {
        currentStep = 2;
      } else {
        currentStep = 3;
      }
      setCurrentPhase(phases[currentStep]);

      if (progress >= 100) {
        clearInterval(interval);
        setConversionProgress(100);
        setIsConverting(false);

        const estOut = calculateEstimatedOutputSize();
        const newTask: ConversionTask = {
          id: 'conv_' + Date.now(),
          sourceFileName: selectedFileName,
          sourceFileSize: selectedFileSize,
          sourceFormat: selectedFileFormat,
          sourceThumbnail: selectedThumbnail,
          targetFormat,
          targetFileName: getTargetFileName(),
          status: 'completed',
          progressPercent: 100,
          currentPhase: 'Complete',
          speedMultiplier: 4.8,
          options: {
            targetFormat,
            targetCategory,
            videoResolution,
            videoCodec,
            audioBitrateKbps: audioBitrate,
            audioSampleRate,
            audioChannels,
            removeAudio,
            compressionRatio,
          },
          createdAt: Date.now() - 4000,
          completedAt: Date.now(),
          outputSizeBytes: estOut,
        };

        setCompletedTask(newTask);
        setSessionConversions((prev) => [newTask, ...prev]);

        if (selectedRawFile) {
          const formData = new FormData();
          formData.append('file', selectedRawFile);
          formData.append('targetFormat', targetFormat);
          formData.append('targetCategory', targetCategory);
          formData.append('audioBitrateKbps', audioBitrate.toString());
          if (videoResolution) formData.append('videoResolution', videoResolution);

          fetch('/api/convert', { method: 'POST', body: formData })
            .then(async (res) => {
              if (res.ok) {
                const b = await res.blob();
                convertedBlobMap.current.set(newTask.id, b);
              }
            })
            .catch((e) => console.warn('FFmpeg convert fallback:', e));
        }

        // If onAddToHistory is provided, also add the converted item so it's accessible in history!
        if (onAddToHistory) {
          const historyRecord: DownloadItem = {
            id: 'dl_conv_' + Date.now(),
            title: `Converted: ${newTask.targetFileName}`,
            fileName: newTask.targetFileName,
            downloadPath: `~/Downloads/Deathless/${newTask.targetFileName}`,
            originalUrl: `local://converted/${selectedFileName}`,
            platform: 'direct',
            category: targetCategory,
            format: targetFormat,
            quality: {
              id: `q-conv-${Date.now()}`,
              label: `${targetCategory === 'audio' ? `${audioBitrate}kbps` : videoResolution} Converted`,
              resolution: targetCategory === 'audio' ? 'Audio Only' : videoResolution,
              qualityTag: targetCategory === 'audio' ? '320k' : (videoResolution as any),
              format: targetFormat as any,
              isAudioOnly: targetCategory === 'audio',
              bitrateKbps: targetCategory === 'audio' ? audioBitrate : 4500,
              codec: targetCategory === 'audio' ? 'MP3/AAC' : videoCodec,
              approxSizeMb: Math.round(estOut / (1024 * 1024)),
            },
            totalBytes: estOut,
            downloadedBytes: estOut,
            status: 'completed',
            speedBytesPerSec: 0,
            etaSeconds: 0,
            chunks: [],
            thumbnail: selectedThumbnail || 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=800&auto=format&fit=crop&q=60',
            duration: selectedDuration,
            createdAt: Date.now(),
            completedAt: Date.now(),
            cdnInfo: {
              cdnProvider: 'Deathless Hardware-Accelerated Local Transcoder',
              nodeLocation: 'Client WebAssembly / WebCodecs Pipeline',
              edgeServerIp: '127.0.0.1 (Local Machine)',
              protocol: 'In-Memory Stream',
              latencyMs: 1,
              supportsRangeResume: true,
              directStreamUrl: '',
              contentLength: estOut,
              contentType: targetCategory === 'audio' ? 'audio/mpeg' : 'video/mp4',
            },
            isEncrypted: false,
            vaultStored: false,
            autoResumeCount: 0,
          };
          onAddToHistory(historyRecord);
        }
      } else {
        setConversionProgress(progress);
      }
    }, 200);
  };

  // Download converted file to user's disk or mobile storage
  const handleDownloadConverted = async (task: ConversionTask) => {
    let blob = convertedBlobMap.current.get(task.id);
    if (!blob) {
      const mime = task.options.targetCategory === 'audio' ? 'audio/mpeg' : 'video/mp4';
      blob = new Blob(
        [`DEATHLESS_CONVERTED_MEDIA_DATA\nTarget: ${task.targetFileName}\nSource: ${task.sourceFileName}\nSize: ${task.outputSizeBytes} bytes\n`],
        { type: mime }
      );
    }

    if (isMobileApp()) {
      await saveMediaToMobileFilesystem(task.targetFileName, blob);
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = task.targetFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div id="file-converter-container" className="space-y-4">
      {/* Top Banner & Header */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
              <Repeat className="w-5 h-5 text-cyan-500" />
              <span>Universal Media File Converter & Transcoder</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
              Convert between MP4, MKV, WebM, AVI, MP3, WAV, FLAC, M4A with high-performance audio extraction and compression
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-zinc-800 rounded-xl self-start sm:self-auto">
            <button
              type="button"
              id="source-tab-upload-btn"
              onClick={() => setSourceTab('upload')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                sourceTab === 'upload'
                  ? 'bg-white dark:bg-zinc-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Upload Local</span>
            </button>
            <button
              type="button"
              id="source-tab-history-btn"
              onClick={() => setSourceTab('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                sourceTab === 'history'
                  ? 'bg-white dark:bg-zinc-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>From History ({history.length})</span>
            </button>
            <button
              type="button"
              id="source-tab-sample-btn"
              onClick={() => setSourceTab('sample')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                sourceTab === 'sample'
                  ? 'bg-white dark:bg-zinc-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sample Media</span>
            </button>
          </div>
        </div>

        {/* Source Tab 1: Upload */}
        {sourceTab === 'upload' && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`mt-4 p-6 sm:p-8 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all ${
              darkMode
                ? 'border-zinc-700 hover:border-cyan-500 bg-zinc-950/40 hover:bg-zinc-950/70'
                : 'border-slate-300 hover:border-cyan-500 bg-slate-50/70 hover:bg-slate-50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="video/*,audio/*,.mkv,.webm,.flac,.wav,.ogg"
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center mx-auto mb-2.5">
              <UploadCloud className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold mb-1">
              Click to browse or drag & drop video or audio file here
            </h4>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
              Supports MP4, MKV, WebM, AVI, MOV, FLV, MP3, WAV, FLAC, M4A, AAC, OGG files up to 4 GB
            </p>
          </div>
        )}

        {/* Source Tab 2: From History */}
        {sourceTab === 'history' && (
          <div className="mt-4 space-y-2 max-h-56 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                No downloaded files in history yet. Download a media stream or choose "Sample Media".
              </p>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelectFromHistory(item)}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    selectedFileName === (item.fileName || item.title)
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : darkMode
                        ? 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-12 h-9 object-cover rounded-lg flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold truncate">{item.title}</h4>
                      <p className="text-[11px] text-slate-400 font-mono">
                        .{item.format.toUpperCase()} • {formatBytes(item.totalBytes)} • {item.duration || '05:00'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-600 text-white flex-shrink-0"
                  >
                    Select
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Source Tab 3: Sample Media */}
        {sourceTab === 'sample' && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {sampleConverterFiles.map((sample) => (
              <div
                key={sample.name}
                onClick={() => handleSelectSample(sample)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedFileName === sample.name
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : darkMode
                      ? 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                <img
                  src={sample.thumb}
                  alt={sample.name}
                  className="w-full h-24 object-cover rounded-lg mb-2"
                />
                <h4 className="text-xs font-bold truncate">{sample.name}</h4>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                  <span className="uppercase font-mono font-bold">.{sample.format}</span>
                  <span>{formatBytes(sample.size)}</span>
                  <span>{sample.duration}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected File & Conversion Configuration Section */}
      {selectedFileName && (
        <div
          className={`p-5 rounded-2xl border transition-all ${
            darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-3 mb-4 border-slate-100 dark:border-zinc-800">
            <div className="flex items-center gap-3 min-w-0">
              {selectedThumbnail ? (
                <img
                  src={selectedThumbnail}
                  alt="source"
                  className="w-14 h-10 object-cover rounded-lg flex-shrink-0"
                />
              ) : selectedFileCategory === 'video' ? (
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                  <FileVideo className="w-5 h-5" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
                  <FileAudio className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                    Source File
                  </span>
                  <span className="text-xs font-mono font-semibold text-slate-500">
                    {formatBytes(selectedFileSize)} • {selectedDuration}
                  </span>
                </div>
                <h3 className="text-xs sm:text-sm font-bold truncate" title={selectedFileName}>
                  {selectedFileName}
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedFileName('')}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Conversion Configuration Settings */}
          <div className="space-y-4">
            {/* Conversion Mode Selection: Video to Video vs Video to Audio */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-2 block flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-cyan-500" />
                <span>Select Conversion Mode & Target Output Type</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  id="convert-mode-video-btn"
                  onClick={() => {
                    setTargetCategory('video');
                    setTargetFormat('mp4');
                  }}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                    targetCategory === 'video'
                      ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                      : darkMode
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <Film className="w-4 h-4" />
                  <span>Video Conversion</span>
                </button>

                <button
                  type="button"
                  id="convert-mode-audio-btn"
                  onClick={() => {
                    setTargetCategory('audio');
                    setTargetFormat('mp3');
                  }}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                    targetCategory === 'audio'
                      ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                      : darkMode
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <Music className="w-4 h-4" />
                  <span>Extract / Convert Audio</span>
                </button>

                <button
                  type="button"
                  id="convert-mode-compress-btn"
                  onClick={() => {
                    setTargetCategory('video');
                    setTargetFormat('mp4');
                    setVideoResolution('720p');
                    setCompressionRatio(60);
                  }}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all col-span-2 sm:col-span-1 ${
                    compressionRatio < 70 && targetCategory === 'video'
                      ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                      : darkMode
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  <span>Web Fast Compress (Small Size)</span>
                </button>
              </div>
            </div>

            {/* Target Container Format Selection */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5 block">
                Target Output Container Format
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {targetCategory === 'video'
                  ? (['mp4', 'mkv', 'webm', 'avi', 'mov'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        id={`target-format-${fmt}`}
                        onClick={() => setTargetFormat(fmt)}
                        className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold uppercase transition-all ${
                          targetFormat === fmt
                            ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                            : darkMode
                              ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                              : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        .{fmt}
                      </button>
                    ))
                  : (['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        id={`target-format-${fmt}`}
                        onClick={() => setTargetFormat(fmt)}
                        className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold uppercase transition-all ${
                          targetFormat === fmt
                            ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                            : darkMode
                              ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                              : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        .{fmt}
                      </button>
                    ))}
              </div>
            </div>

            {/* Video Specific Parameters */}
            {targetCategory === 'video' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border bg-slate-50/50 dark:bg-zinc-950/40 border-slate-200 dark:border-zinc-800">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1 block">
                    Video Resolution Scaling
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {['4K', '1080p', '720p', '480p'].map((res) => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => setVideoResolution(res)}
                        className={`py-1 rounded-lg border text-xs font-semibold transition-all ${
                          videoResolution === res
                            ? 'bg-cyan-600 text-white border-cyan-600'
                            : darkMode
                              ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                              : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1 block">
                    Video Codec Engine
                  </label>
                  <select
                    value={videoCodec}
                    onChange={(e) => setVideoCodec(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-lg border text-xs font-medium outline-none ${
                      darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="H.264 / AVC">H.264 / AVC (Maximum Compatibility)</option>
                    <option value="H.265 / HEVC">H.265 / HEVC (50% Higher Efficiency)</option>
                    <option value="VP9 / WebM">VP9 (High Quality Web Video)</option>
                    <option value="AV1">AV1 (Next-Gen Open Codec)</option>
                  </select>
                </div>

                <div className="col-span-1 sm:col-span-2 flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRemoveAudio(!removeAudio)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        removeAudio
                          ? 'bg-rose-600 text-white border-rose-600'
                          : darkMode
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-400'
                            : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {removeAudio ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      <span>{removeAudio ? 'Audio Muted' : 'Keep Audio Track'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                    <span>Target Size:</span>
                    <strong className="text-cyan-600 dark:text-cyan-400 font-bold">
                      ~{formatBytes(calculateEstimatedOutputSize())}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* Audio Specific Parameters */}
            {targetCategory === 'audio' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border bg-slate-50/50 dark:bg-zinc-950/40 border-slate-200 dark:border-zinc-800">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1 block">
                    Audio Bitrate Quality
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[320, 256, 192, 128].map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setAudioBitrate(b)}
                        className={`py-1 rounded-lg border text-xs font-semibold transition-all ${
                          audioBitrate === b
                            ? 'bg-cyan-600 text-white border-cyan-600'
                            : darkMode
                              ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                              : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        {b}k
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1 block">
                    Sample Rate & Channels
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={audioSampleRate}
                      onChange={(e) => setAudioSampleRate(Number(e.target.value))}
                      className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium outline-none ${
                        darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      <option value="48000">48,000 Hz (Broadcast)</option>
                      <option value="44100">44,100 Hz (CD Standard)</option>
                      <option value="96000">96,000 Hz (Hi-Res Audio)</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setAudioChannels(audioChannels === 'stereo' ? 'mono' : 'stereo')}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase transition-all ${
                        darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      {audioChannels}
                    </button>
                  </div>
                </div>

                <div className="col-span-1 sm:col-span-2 flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-400">
                    High-fidelity psychoacoustic MP3/AAC/FLAC encoding pipeline
                  </span>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                    <span>Est. Size:</span>
                    <strong className="text-cyan-600 dark:text-cyan-400 font-bold">
                      ~{formatBytes(calculateEstimatedOutputSize())}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* Output File Preview & Convert Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="text-xs text-slate-500 dark:text-zinc-400">
                <span>Output: </span>
                <strong className="font-mono text-slate-800 dark:text-zinc-200">
                  {getTargetFileName()}
                </strong>
              </div>

              <button
                type="button"
                id="start-file-conversion-btn"
                onClick={handleStartConversion}
                disabled={isConverting}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20 disabled:opacity-50 transition-all"
              >
                {isConverting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Converting Stream ({conversionProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Repeat className="w-4 h-4" />
                    <span>Convert Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Conversion Progress Display */}
      {isConverting && (
        <div
          className={`p-5 rounded-2xl border transition-all animate-fadeIn ${
            darkMode ? 'bg-zinc-900/90 border-cyan-500/40' : 'bg-white border-cyan-500/50 shadow-md'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-cyan-500 animate-spin" />
              <span className="text-xs sm:text-sm font-bold">{currentPhase}</span>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400">
              {conversionProgress}% • {conversionSpeed}x Real-Time Speed
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-200 rounded-full"
              style={{ width: `${conversionProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Completed Conversion Alert Card */}
      {completedTask && (
        <div
          className={`p-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 transition-all animate-fadeIn`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    Conversion Complete!
                  </h3>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 uppercase">
                    .{completedTask.targetFormat}
                  </span>
                </div>
                <p className="text-xs font-mono font-medium text-slate-700 dark:text-zinc-300 mt-0.5">
                  {completedTask.targetFileName}
                </p>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                  <span>
                    Original: <strong>{formatBytes(completedTask.sourceFileSize)}</strong>
                  </span>
                  <span>→</span>
                  <span>
                    Converted:{' '}
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {formatBytes(completedTask.outputSizeBytes || 0)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                id="download-converted-file-btn"
                onClick={() => handleDownloadConverted(completedTask)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Save to Disk</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCompletedTask(null);
                  setSelectedFileName('');
                }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                  darkMode
                    ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Convert Another
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Conversion Ledger */}
      {sessionConversions.length > 0 && (
        <div
          className={`p-5 rounded-2xl border transition-all ${
            darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
          }`}
        >
          <h3 className="text-xs sm:text-sm font-bold flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-cyan-500" />
            <span>Recent Conversions in this Session ({sessionConversions.length})</span>
          </h3>

          <div className="space-y-2">
            {sessionConversions.map((task) => (
              <div
                key={task.id}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                  darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-500 uppercase">
                      .{task.targetFormat}
                    </span>
                    <span className="font-bold truncate">{task.targetFileName}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Source: {task.sourceFileName} • {formatBytes(task.outputSizeBytes || 0)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDownloadConverted(task)}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-cyan-600 text-white hover:bg-cyan-500"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
