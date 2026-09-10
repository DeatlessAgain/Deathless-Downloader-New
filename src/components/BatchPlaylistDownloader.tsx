import React, { useState, useRef } from 'react';
import {
  ListPlus,
  Trash2,
  CheckCircle2,
  Play,
  Layers,
  Upload,
  FileText,
  AlertCircle,
  FileCode,
  Download,
  Copy,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { AccentColor, getAccentTheme } from '../services/accentTheme';

export interface QueueItem {
  id: string;
  url: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  title?: string;
  domain?: string;
  sourceFile?: string;
}

interface BatchPlaylistDownloaderProps {
  onQueueStart?: (urls: string[]) => void;
  onQueueBatch?: (items: any[]) => void;
  darkMode?: boolean;
  accentColor?: AccentColor;
}

const SAMPLE_TEXT_FILE_CONTENT = `# Deathless Downloader - Sample Batch URL List
# Support for YouTube, TikTok, Vimeo, Instagram, and Direct MP4 Streams
https://www.youtube.com/watch?v=aqz-KE-bpKQ
https://www.youtube.com/watch?v=kJQP7kiw5Fk
https://vimeo.com/76979871
https://www.tiktok.com/@natgeo/video/721234567890
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4
`;

export function BatchPlaylistDownloader({
  onQueueStart,
  onQueueBatch,
  darkMode = true,
  accentColor = 'cyan',
}: BatchPlaylistDownloaderProps) {
  const theme = getAccentTheme(accentColor);
  const [inputText, setInputText] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importNotification, setImportNotification] = useState<{
    message: string;
    type: 'success' | 'info' | 'error';
    fileName?: string;
    count?: number;
    duplicates?: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract valid URLs from raw text content (supporting plain text, CSV, TSV, M3U)
  const extractUrlsFromText = (
    rawText: string,
    sourceFileName?: string
  ): { validUrls: string[]; duplicateCount: number } => {
    // Regex matching any http/https URL, stripping surrounding quotes, angle brackets, and whitespace
    const urlRegex = /https?:\/\/[^\s"'<>,;()\[\]{}|\\^]+/gi;
    const matches = rawText.match(urlRegex) || [];

    // Clean trailing punctuation that might attach to URLs in text files
    const cleanedUrls = matches
      .map((u) => u.replace(/[.,:;!?)]+$/, ''))
      .filter((u) => {
        try {
          const parsed = new URL(u);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      });

    // Deduplicate within the file itself
    const uniqueFileUrls = Array.from(new Set(cleanedUrls));
    const duplicatesWithinFile = cleanedUrls.length - uniqueFileUrls.length;

    // Deduplicate against existing queue
    const existingUrlSet = new Set(queue.map((q) => q.url.toLowerCase()));
    const finalNewUrls: string[] = [];
    let alreadyInQueueCount = 0;

    uniqueFileUrls.forEach((u) => {
      if (existingUrlSet.has(u.toLowerCase())) {
        alreadyInQueueCount++;
      } else {
        finalNewUrls.push(u);
      }
    });

    const newItems: QueueItem[] = finalNewUrls.map((url, idx) => {
      let domain = 'Universal Web';
      try {
        domain = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        domain = 'Direct Link';
      }

      const cleanTitle = url.length > 55 ? url.substring(0, 52) + '...' : url;

      return {
        id: `batch_import_${Date.now()}_${idx}`,
        url,
        status: 'pending',
        title: cleanTitle,
        domain,
        sourceFile: sourceFileName,
      };
    });

    if (newItems.length > 0) {
      setQueue((prev) => [...prev, ...newItems]);
    }

    return {
      validUrls: finalNewUrls,
      duplicateCount: duplicatesWithinFile + alreadyInQueueCount,
    };
  };

  // Process text file upload (.txt, .csv, .log, etc.)
  const handleProcessFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        const { validUrls, duplicateCount } = extractUrlsFromText(content, file.name);
        if (validUrls.length > 0) {
          setImportNotification({
            type: 'success',
            message: `Imported ${validUrls.length} ${validUrls.length === 1 ? 'URL' : 'URLs'} from "${file.name}"`,
            fileName: file.name,
            count: validUrls.length,
            duplicates: duplicateCount,
          });
        } else {
          setImportNotification({
            type: 'error',
            message: duplicateCount > 0
              ? `All ${duplicateCount} URLs in "${file.name}" are already in your queue.`
              : `No valid HTTP/HTTPS URLs were found in "${file.name}".`,
            fileName: file.name,
          });
        }
      }
    };
    reader.onerror = () => {
      setImportNotification({
        type: 'error',
        message: `Failed to read "${file.name}". Please ensure it is a valid text file.`,
      });
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleProcessFile(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Drag and Drop handlers for text files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  // Add links manually from textarea
  const handleAddLinks = () => {
    if (!inputText.trim()) return;
    const { validUrls, duplicateCount } = extractUrlsFromText(inputText, 'Manual Input');
    if (validUrls.length > 0) {
      setImportNotification({
        type: 'success',
        message: `Added ${validUrls.length} ${validUrls.length === 1 ? 'URL' : 'URLs'} to batch queue`,
        count: validUrls.length,
        duplicates: duplicateCount,
      });
      setInputText('');
    } else {
      setImportNotification({
        type: 'error',
        message: duplicateCount > 0 ? 'All entered links are already in the queue.' : 'No valid URLs found.',
      });
    }
  };

  // Quick load sample text file template
  const handleLoadSampleFile = () => {
    const { validUrls, duplicateCount } = extractUrlsFromText(SAMPLE_TEXT_FILE_CONTENT, 'sample_playlist.txt');
    setImportNotification({
      type: 'info',
      message: `Loaded ${validUrls.length} sample URLs from playlist template`,
      count: validUrls.length,
      duplicates: duplicateCount,
    });
  };

  // Export current queue to a text file
  const handleExportQueueText = () => {
    if (queue.length === 0) return;
    const content = queue.map((q) => q.url).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch_queue_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Remove single item from queue
  const removeItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  // Clear entire queue
  const clearQueue = () => {
    setQueue([]);
    setIsProcessing(false);
    setImportNotification(null);
  };

  // Start processing the batch queue
  const startBatchDownload = () => {
    if (queue.length === 0) return;
    setIsProcessing(true);

    const pendingItems = queue.filter((q) => q.status === 'pending');
    const pendingUrls = pendingItems.map((q) => q.url);

    if (pendingUrls.length > 0) {
      if (onQueueBatch) {
        onQueueBatch(
          pendingItems.map((item, i) => ({
            id: `batch_${Date.now()}_${i}`,
            url: item.url,
            title: item.title || item.url,
            platform: 'universal',
            selected: true,
            quality: { label: '1080p Full HD', resolution: '1080p', format: 'mp4' },
          }))
        );
      } else if (onQueueStart) {
        onQueueStart(pendingUrls);
      }
    }

    // Simulate batch progression for UI feedback
    let index = 0;
    const interval = setInterval(() => {
      if (index < queue.length) {
        setQueue((prev) =>
          prev.map((item, idx) => {
            if (idx === index) return { ...item, status: 'completed' };
            if (idx === index + 1) return { ...item, status: 'downloading' };
            return item;
          })
        );
        index++;
      } else {
        clearInterval(interval);
        setIsProcessing(false);
      }
    }, 1500);
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Hidden File Input for Bulk Text File Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept=".txt,.csv,.tsv,.log,.m3u,.m3u8,text/plain,text/csv"
        className="hidden"
        id="batch-url-file-input"
      />

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl ${theme.bgSubtle} border ${theme.borderSubtle} flex items-center justify-center`}>
            <Layers className={`w-5 h-5 ${theme.text}`} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-wide">
              Batch & Playlist Downloader
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Bulk-import URLs from text files (.txt, .csv) or paste multi-line playlists
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleLoadSampleFile}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              darkMode
                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Load Sample .txt</span>
          </button>

          <button
            type="button"
            id="batch-import-file-btn"
            onClick={() => fileInputRef.current?.click()}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-all ${theme.bg} ${theme.bgHover}`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import from Text File</span>
          </button>
        </div>
      </div>

      {/* Import Notification Banner */}
      {importNotification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${
            importNotification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : importNotification.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {importNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-500" />
            ) : importNotification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
            ) : (
              <FileText className="w-4 h-4 flex-shrink-0 text-cyan-500" />
            )}
            <div>
              <span className="font-semibold">{importNotification.message}</span>
              {importNotification.duplicates ? (
                <span className="ml-1 opacity-80">
                  ({importNotification.duplicates} duplicate {importNotification.duplicates === 1 ? 'link' : 'links'} skipped)
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setImportNotification(null)}
            className="opacity-70 hover:opacity-100 font-bold px-1 text-sm"
          >
            ×
          </button>
        </div>
      )}

      {/* Dual Input Area: Drag & Drop File Target + Textarea */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Drag & Drop File Zone (5 cols) */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`md:col-span-5 p-5 rounded-2xl border-2 border-dashed cursor-pointer text-center flex flex-col items-center justify-center transition-all ${
            isDraggingFile
              ? `${theme.border} ${theme.bgSubtle} scale-[1.01]`
              : darkMode
                ? 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
                : 'bg-slate-50/80 border-slate-300 hover:border-slate-400 hover:bg-white'
          }`}
        >
          <div className={`w-12 h-12 rounded-2xl ${theme.bgSubtle} ${theme.text} flex items-center justify-center mb-3 transition-transform group-hover:scale-110`}>
            <FileCode className="w-6 h-6" />
          </div>
          <h4 className="text-xs sm:text-sm font-bold mb-1">
            Drop .txt or .csv File Here
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 max-w-xs mb-3">
            Drag and drop any text file containing URLs or click to browse. Formats supported: <code className="font-mono text-[10px] text-cyan-500">.txt</code>, <code className="font-mono text-[10px] text-cyan-500">.csv</code>, <code className="font-mono text-[10px] text-cyan-500">.m3u</code>.
          </p>
          <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${theme.badge}`}>
            Choose File (.txt / .csv)
          </span>
        </div>

        {/* Textarea Paste Area (7 cols) */}
        <div
          className={`md:col-span-7 p-4 rounded-2xl border space-y-3 shadow-sm ${
            darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-300">
              Or Paste URL List (One per line)
            </label>
            <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
              Auto-detects YouTube, TikTok, Vimeo, Direct MP4
            </span>
          </div>
          <textarea
            rows={4}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=...&#10;https://www.instagram.com/p/...&#10;https://www.tiktok.com/@user/video/...&#10;https://domain.com/video.mp4"
            className={`w-full rounded-xl p-3 text-xs font-mono outline-none transition resize-none ${
              darkMode
                ? 'bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-600 focus:border-cyan-500'
                : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'
            }`}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">
              {inputText.split('\n').filter((l) => l.trim().length > 0).length} potential links entered
            </span>
            <button
              type="button"
              id="batch-add-textarea-links-btn"
              onClick={handleAddLinks}
              disabled={!inputText.trim()}
              className={`px-4 py-2 text-white font-semibold text-xs rounded-xl transition shadow-sm disabled:opacity-40 flex items-center gap-1.5 cursor-pointer ${theme.bg} ${theme.bgHover}`}
            >
              <ListPlus className="w-4 h-4" />
              <span>Parse &amp; Add to Queue</span>
            </button>
          </div>
        </div>
      </div>

      {/* Queue Management Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <span>Batch Download Queue</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${theme.badge}`}>
                {queue.length}
              </span>
            </h3>
            {queue.length > 0 && (
              <span className="text-xs text-slate-400 dark:text-zinc-500 hidden sm:inline">
                ({queue.filter((q) => q.status === 'pending').length} ready to download)
              </span>
            )}
          </div>

          {queue.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportQueueText}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition cursor-pointer px-2 py-1 rounded hover:bg-zinc-800"
                title="Export current queue to text file"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export .txt</span>
              </button>
              <button
                type="button"
                onClick={clearQueue}
                className="text-xs text-rose-500 hover:text-rose-400 flex items-center gap-1 transition cursor-pointer px-2 py-1 rounded hover:bg-rose-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Queue</span>
              </button>
            </div>
          )}
        </div>

        {queue.length === 0 ? (
          <div
            className={`text-center py-12 border border-dashed rounded-2xl transition-all ${
              darkMode ? 'bg-zinc-900/40 border-zinc-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-zinc-800/60 text-slate-500 flex items-center justify-center mx-auto mb-2">
              <Layers className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold mb-1">Queue is empty</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
              Import a list of URLs from a text file (.txt, .csv) or paste multiple links above to start batch downloading.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
              {queue.map((item, index) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                    darkMode ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-slate-400 dark:text-zinc-500 w-6 text-right">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate font-mono" title={item.url}>
                        {item.title}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                        <span className={`font-semibold ${theme.text}`}>{item.domain}</span>
                        {item.sourceFile && (
                          <>
                            <span>•</span>
                            <span className="italic truncate max-w-[140px]">{item.sourceFile}</span>
                          </>
                        )}
                        <span>•</span>
                        <span className="capitalize">{item.status}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.status === 'completed' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                    {item.status === 'downloading' && (
                      <div className={`w-4 h-4 border-2 ${theme.border} border-t-transparent rounded-full animate-spin`} />
                    )}
                    {item.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-slate-400 hover:text-rose-500 transition p-1 cursor-pointer"
                        title="Remove link from queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Start Queue Action */}
            <div className="pt-2">
              <button
                type="button"
                id="start-batch-download-btn"
                onClick={startBatchDownload}
                disabled={isProcessing || queue.length === 0}
                className={`w-full py-3.5 text-white font-bold text-sm rounded-xl transition shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer ${theme.bg} ${theme.bgHover} ${theme.glow}`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {isProcessing
                    ? `Processing Batch Queue (${queue.filter((q) => q.status === 'completed').length}/${queue.length})...`
                    : `Start Batch Download (${queue.length} items)`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
