import React, { useState } from 'react';
import {
  Clock,
  Search,
  Trash2,
  HardDrive,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Film,
  Music,
  FileArchive,
  Download,
  Copy,
  Check,
  Server,
  Play,
  Folder,
  Calendar,
  FileText,
  Filter,
  ArrowUpDown,
  Repeat,
  X,
  Terminal,
} from 'lucide-react';
import { DownloadItem, MediaCategory, PlatformType } from '../types';
import { triggerBrowserFileDownload } from '../services/downloadEngine';
import { AccentColor, getAccentTheme } from '../services/accentTheme';

interface DownloadHistoryProps {
  history: DownloadItem[];
  onClearHistory: () => void;
  onRemoveItem: (id: string) => void;
  onRedownload: (item: DownloadItem) => void;
  onOpenInVault: (downloadId: string) => void;
  onConvertToConverter?: (item: DownloadItem) => void;
  onOpenStreamDebugger?: (downloadId: string) => void;
  darkMode: boolean;
  accentColor?: AccentColor;
}

export const DownloadHistory: React.FC<DownloadHistoryProps> = ({
  history,
  onClearHistory,
  onRemoveItem,
  onRedownload,
  onOpenInVault,
  onConvertToConverter,
  onOpenStreamDebugger,
  darkMode,
  accentColor = 'cyan',
}) => {
  const theme = getAccentTheme(accentColor);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | MediaCategory>('all');
  const [filterPlatform, setFilterPlatform] = useState<'all' | PlatformType>('all');
  const [filterFormat, setFilterFormat] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | 'week'>('all');
  const [sortBy, setSortBy] = useState<
    'date-desc' | 'date-asc' | 'size-desc' | 'size-asc' | 'name-asc' | 'name-desc'
  >('date-desc');

  const [copiedLinkMap, setCopiedLinkMap] = useState<Record<string, boolean>>({});
  const [copiedPathMap, setCopiedPathMap] = useState<Record<string, boolean>>({});

  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;

  const filteredItems = history.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      item.title.toLowerCase().includes(q) ||
      (item.fileName && item.fileName.toLowerCase().includes(q)) ||
      (item.downloadPath && item.downloadPath.toLowerCase().includes(q)) ||
      item.originalUrl.toLowerCase().includes(q);

    const matchesCat = filterCategory === 'all' || item.category === filterCategory;
    const matchesPlat = filterPlatform === 'all' || item.platform === filterPlatform;
    const matchesFormat = filterFormat === 'all' || item.format.toLowerCase() === filterFormat.toLowerCase();

    const itemDate = item.completedAt || item.createdAt;
    let matchesDate = true;
    if (filterDateRange === 'today') {
      matchesDate = now - itemDate <= oneDay;
    } else if (filterDateRange === 'week') {
      matchesDate = now - itemDate <= oneWeek;
    }

    return matchesSearch && matchesCat && matchesPlat && matchesFormat && matchesDate;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    const dateA = a.completedAt || a.createdAt;
    const dateB = b.completedAt || b.createdAt;
    if (sortBy === 'date-desc') return dateB - dateA;
    if (sortBy === 'date-asc') return dateA - dateB;
    if (sortBy === 'size-desc') return (b.totalBytes || 0) - (a.totalBytes || 0);
    if (sortBy === 'size-asc') return (a.totalBytes || 0) - (b.totalBytes || 0);
    if (sortBy === 'name-asc') return a.title.localeCompare(b.title);
    if (sortBy === 'name-desc') return b.title.localeCompare(a.title);
    return 0;
  });

  const totalBytes = history.reduce((acc, i) => acc + (i.downloadedBytes || 0), 0);

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
  };

  const handleCopyLink = (item: DownloadItem) => {
    navigator.clipboard?.writeText(item.originalUrl);
    setCopiedLinkMap((prev) => ({ ...prev, [item.id]: true }));
    setTimeout(() => {
      setCopiedLinkMap((prev) => ({ ...prev, [item.id]: false }));
    }, 2000);
  };

  const handleCopyPath = (item: DownloadItem) => {
    const path = item.downloadPath || `~/Downloads/Deathless/${item.fileName || item.title}`;
    navigator.clipboard?.writeText(path);
    setCopiedPathMap((prev) => ({ ...prev, [item.id]: true }));
    setTimeout(() => {
      setCopiedPathMap((prev) => ({ ...prev, [item.id]: false }));
    }, 2000);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div id="download-history-page" className="space-y-4">
      {/* Header & Metrics Banner */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className={`w-5 h-5 ${theme.text}`} />
              <h2 className="text-base sm:text-lg font-bold">Download History & File Archive</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
              View all completed transfers, exact file names, timestamps, and target storage locations
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="text-left sm:text-right">
              <div className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium">Total Downloaded</div>
              <div className={`text-base font-bold font-mono ${theme.text}`}>
                {formatBytes(totalBytes)}
              </div>
            </div>
            <div className="text-left sm:text-right pl-3 sm:pl-4 border-l border-slate-200 dark:border-zinc-800">
              <div className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium">Files In Ledger</div>
              <div className="text-base font-bold font-mono text-slate-700 dark:text-zinc-200">
                {history.length}
              </div>
            </div>

            {history.length > 0 && (
              <button
                type="button"
                id="clear-all-history-btn"
                onClick={onClearHistory}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 transition-colors ml-auto sm:ml-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>

        {/* Search and Filters Toolbar */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800/80 space-y-3">
          {/* Top row: Search input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              id="history-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search file name, location, video title, domain..."
              className={`w-full pl-9 pr-8 py-2 rounded-xl text-xs sm:text-sm border outline-none ${
                darkMode
                  ? 'bg-zinc-950 border-zinc-700 text-zinc-100 placeholder-zinc-500'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter row: Categories, Platform, Format, Date Range, and Sort */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {(['all', 'video', 'audio', 'archive'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition-all ${
                    filterCategory === cat
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : darkMode
                        ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Platform Selector */}
              <select
                value={filterPlatform}
                onChange={(e) => setFilterPlatform(e.target.value as any)}
                aria-label="Filter by Platform"
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold outline-none ${
                  darkMode ? 'bg-zinc-950 border-zinc-700 text-zinc-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="all">All Platforms</option>
                <option value="youtube">YouTube</option>
                <option value="tiktok">TikTok</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="twitter">X / Twitter</option>
                <option value="direct">Direct File</option>
              </select>

              {/* Format Filter */}
              <select
                value={filterFormat}
                onChange={(e) => setFilterFormat(e.target.value)}
                aria-label="Filter by Format"
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold outline-none uppercase ${
                  darkMode ? 'bg-zinc-950 border-zinc-700 text-zinc-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="all">All Formats</option>
                <option value="mp4">.MP4</option>
                <option value="mkv">.MKV</option>
                <option value="webm">.WEBM</option>
                <option value="mp3">.MP3</option>
                <option value="wav">.WAV</option>
                <option value="flac">.FLAC</option>
                <option value="m4a">.M4A</option>
              </select>

              {/* Date Filter */}
              <select
                value={filterDateRange}
                onChange={(e) => setFilterDateRange(e.target.value as any)}
                aria-label="Filter by Date Range"
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold outline-none ${
                  darkMode ? 'bg-zinc-950 border-zinc-700 text-zinc-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="all">All Time</option>
                <option value="today">Today Only</option>
                <option value="week">Past 7 Days</option>
              </select>

              {/* Sort Selector */}
              <div className="flex items-center gap-1">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Sort History By"
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold outline-none ${
                    darkMode ? 'bg-zinc-950 border-zinc-700 text-zinc-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <option value="date-desc">Newest First</option>
                  <option value="date-asc">Oldest First</option>
                  <option value="size-desc">Largest Size</option>
                  <option value="size-asc">Smallest Size</option>
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History Items List */}
      {sortedItems.length === 0 ? (
        <div
          className={`p-10 rounded-2xl border text-center ${
            darkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-slate-200'
          }`}
        >
          <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h4 className="font-semibold text-sm">No Download History Found</h4>
          <p className="text-xs text-slate-400 mt-0.5">
            No downloaded files match your active filter and search options.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedItems.map((item) => {
            const fileName =
              item.fileName ||
              `${item.title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_')}_${item.quality.qualityTag}.${item.format}`;
            const downloadPath = item.downloadPath || `~/Downloads/Deathless/${fileName}`;
            const dateStr = formatDate(item.completedAt || item.createdAt);

            return (
              <div
                key={item.id}
                id={`history-row-${item.id}`}
                className={`p-4 rounded-2xl border transition-all hover:shadow-md ${
                  darkMode
                    ? 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Top Section: Media Info & Action Buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800/80">
                  <div className="flex items-start gap-3 min-w-0">
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-16 h-12 object-cover rounded-lg flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                          {item.platform}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                          .{item.format.toUpperCase()} • {item.quality.label}
                        </span>
                        {item.isEncrypted && (
                          <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <ShieldCheck className="w-3 h-3" />
                            Encrypted
                          </span>
                        )}
                        <span className="text-xs font-mono font-medium text-slate-400">
                          ~{formatBytes(item.totalBytes)}
                        </span>
                      </div>

                      <h4 className="text-sm font-semibold truncate leading-tight" title={item.title}>
                        {item.title}
                      </h4>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
                    {/* Play in Vault */}
                    <button
                      type="button"
                      id={`play-history-btn-${item.id}`}
                      onClick={() => onOpenInVault(item.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all"
                      title="Play in offline media player"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Play</span>
                    </button>

                    {/* Native File Download */}
                    <button
                      type="button"
                      id={`save-history-btn-${item.id}`}
                      onClick={() => triggerBrowserFileDownload(item)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        darkMode
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                          : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                      }`}
                      title="Save to computer disk"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Save</span>
                    </button>

                    {/* Convert / Transcode */}
                    {onConvertToConverter && (
                      <button
                        type="button"
                        id={`convert-history-btn-${item.id}`}
                        onClick={() => onConvertToConverter(item)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          darkMode
                            ? 'bg-zinc-800 border-zinc-700 text-cyan-400 hover:bg-zinc-700'
                            : 'bg-slate-100 border-slate-200 text-cyan-600 hover:bg-slate-200'
                        }`}
                        title="Transcode or convert this file in File Converter"
                      >
                        <Repeat className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Convert</span>
                      </button>
                    )}

                    {/* Redownload */}
                    <button
                      type="button"
                      id={`redownload-history-btn-${item.id}`}
                      onClick={() => onRedownload(item)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Re-download stream"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    {/* Copy Link */}
                    <button
                      type="button"
                      onClick={() => handleCopyLink(item)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Copy Source Media URL"
                    >
                      {copiedLinkMap[item.id] ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <ExternalLink className="w-4 h-4" />
                      )}
                    </button>

                    {/* Inspect Stream Headers & Debug */}
                    {onOpenStreamDebugger && (
                      <button
                        type="button"
                        id={`inspect-headers-history-btn-${item.id}`}
                        onClick={() => onOpenStreamDebugger(item.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Inspect HTTP Response Headers and Stream Telemetry"
                      >
                        <Terminal className="w-4 h-4" />
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      type="button"
                      id={`delete-history-btn-${item.id}`}
                      onClick={() => onRemoveItem(item.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Remove record"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Bottom Section: Explicit File Name, Date, and Download Location */}
                <div className="mt-2.5 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                  {/* 1. File Name */}
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/80 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">File Name</div>
                      <div className="font-mono text-slate-800 dark:text-zinc-200 truncate font-semibold" title={fileName}>
                        {fileName}
                      </div>
                    </div>
                  </div>

                  {/* 2. Date & Time */}
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/80 min-w-0">
                    <Calendar className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Completed Date</div>
                      <div className="font-mono text-slate-800 dark:text-zinc-200 truncate">
                        {dateStr}
                      </div>
                    </div>
                  </div>

                  {/* 3. Download Location */}
                  <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/80 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Folder className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Download Location</div>
                        <div className="font-mono text-cyan-600 dark:text-cyan-400 truncate font-medium" title={downloadPath}>
                          {downloadPath}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyPath(item)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
                      title="Copy Location Path"
                    >
                      {copiedPathMap[item.id] ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
