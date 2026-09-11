import React, { useState } from 'react';
import {
  Pause,
  Play,
  X,
  ShieldCheck,
  Zap,
  Activity,
  Download,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  HardDrive,
  Radio,
  SlidersHorizontal,
  Search,
  ArrowUpDown,
  Filter,
  Repeat,
  Gauge,
  Key,
  Terminal,
  Clock,
  Timer,
  Tv,
  ExternalLink,
  Globe,
} from 'lucide-react';
import { DownloadItem, PlatformType } from '../types';
import { triggerBrowserFileDownload } from '../services/downloadEngine';
import { executeUniversalDownload, isMobileDevice } from '../services/mobileDownloadService';
import { AccentColor, getAccentTheme } from '../services/accentTheme';
import { AlternativePlayerModal } from './AlternativePlayerModal';
import { triggerDirectBrowserDownload } from '../services/clientMediaResolver';

interface ActiveDownloadsProps {
  items: DownloadItem[];
  onTogglePause: (id: string) => void;
  onCancel: (id: string) => void;
  onSimulateDrop: (id: string) => void;
  onRetry: (id: string) => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onClearCompleted: () => void;
  onOpenInVault?: (downloadId: string) => void;
  onConvertToConverter?: (item: DownloadItem) => void;
  onOpenSettings?: () => void;
  onOpenStreamDebugger?: (downloadId: string) => void;
  speedLimitMbps?: number;
  onSetSpeedLimit?: (limit: number) => void;
  darkMode: boolean;
  accentColor?: AccentColor;
}

export const ActiveDownloads: React.FC<ActiveDownloadsProps> = ({
  items,
  onTogglePause,
  onCancel,
  onSimulateDrop,
  onRetry,
  onPauseAll,
  onResumeAll,
  onClearCompleted,
  onOpenInVault,
  onConvertToConverter,
  onOpenSettings,
  onOpenStreamDebugger,
  speedLimitMbps = 0,
  onSetSpeedLimit,
  darkMode,
  accentColor = 'cyan',
}) => {
  const theme = getAccentTheme(accentColor);
  const [expandedChunks, setExpandedChunks] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'downloading' | 'paused' | 'completed'>('all');
  const [platformFilter, setPlatformFilter] = useState<'all' | PlatformType>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'progress-desc' | 'speed-desc' | 'size-desc' | 'name-asc'>('date-desc');
  const [alternativeModalItem, setAlternativeModalItem] = useState<DownloadItem | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const toggleChunkDetails = (id: string) => {
    setExpandedChunks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const ongoingItems = items.filter((i) => i.status === 'downloading' || i.status === 'resuming');
  const activeCount = ongoingItems.length;
  const pausedCount = items.filter((i) => i.status === 'paused').length;
  const completedCount = items.filter((i) => i.status === 'completed').length;

  // Aggregate speed across all ongoing downloads (bytes/sec)
  const aggregateSpeedBytesPerSec = ongoingItems.reduce(
    (acc, i) => acc + (i.speedBytesPerSec || 0),
    0
  );

  // Total remaining bytes across all ongoing downloads
  const totalRemainingBytes = ongoingItems.reduce(
    (acc, i) => acc + Math.max(0, (i.totalBytes || 0) - (i.downloadedBytes || 0)),
    0
  );

  // Total downloaded bytes across ongoing downloads
  const totalDownloadedBytes = ongoingItems.reduce(
    (acc, i) => acc + (i.downloadedBytes || 0),
    0
  );

  const totalOngoingBytes = totalDownloadedBytes + totalRemainingBytes;
  const overallProgressPercent = totalOngoingBytes > 0
    ? Math.min(100, Math.round((totalDownloadedBytes / totalOngoingBytes) * 100))
    : (completedCount > 0 && activeCount === 0 ? 100 : 0);

  // Total combined remaining time calculation
  const totalEtaSeconds =
    aggregateSpeedBytesPerSec > 0
      ? Math.round(totalRemainingBytes / aggregateSpeedBytesPerSec)
      : 0;

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  };

  const formatEta = (seconds: number): string => {
    if (seconds <= 0) return 'Finished';
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m remaining`;
    }
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s remaining`;
  };

  const getTotalEtaInfo = () => {
    if (activeCount === 0) {
      if (pausedCount > 0) {
        return {
          timeText: 'Transfers Paused',
          subtext: `${pausedCount} ${pausedCount === 1 ? 'download is' : 'downloads are'} currently paused`,
          status: 'paused',
        };
      }
      if (completedCount > 0) {
        return {
          timeText: 'All Finished',
          subtext: `${completedCount} ${completedCount === 1 ? 'download' : 'downloads'} completed successfully`,
          status: 'completed',
        };
      }
      return {
        timeText: 'Queue Idle',
        subtext: 'No ongoing transfers in the active queue',
        status: 'idle',
      };
    }

    if (aggregateSpeedBytesPerSec <= 0) {
      return {
        timeText: 'Calculating...',
        subtext: `Synchronizing multi-part connections across ${activeCount} active ${activeCount === 1 ? 'stream' : 'streams'}`,
        status: 'calculating',
      };
    }

    let timeText = '';
    if (totalEtaSeconds >= 3600) {
      const h = Math.floor(totalEtaSeconds / 3600);
      const m = Math.floor((totalEtaSeconds % 3600) / 60);
      const s = totalEtaSeconds % 60;
      timeText = `${h}h ${m}m ${s}s`;
    } else if (totalEtaSeconds >= 60) {
      const m = Math.floor(totalEtaSeconds / 60);
      const s = totalEtaSeconds % 60;
      timeText = `${m}m ${s}s`;
    } else {
      timeText = `${Math.max(1, totalEtaSeconds)}s`;
    }

    return {
      timeText,
      subtext: `${formatBytes(totalRemainingBytes)} remaining @ ${formatBytes(aggregateSpeedBytesPerSec)}/s aggregate speed across ${activeCount} active ${activeCount === 1 ? 'download' : 'downloads'}`,
      status: 'active',
    };
  };

  const totalEtaInfo = getTotalEtaInfo();

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.fileName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'downloading' && (item.status === 'downloading' || item.status === 'resuming')) ||
      (statusFilter === 'paused' && item.status === 'paused') ||
      (statusFilter === 'completed' && item.status === 'completed');
    const matchesPlatform = platformFilter === 'all' || item.platform === platformFilter;
    return matchesSearch && matchesStatus && matchesPlatform;
  });

  // Sort filtered items
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortBy === 'date-desc') return b.createdAt - a.createdAt;
    if (sortBy === 'progress-desc') {
      const progA = a.downloadedBytes / (a.totalBytes || 1);
      const progB = b.downloadedBytes / (b.totalBytes || 1);
      return progB - progA;
    }
    if (sortBy === 'speed-desc') return b.speedBytesPerSec - a.speedBytesPerSec;
    if (sortBy === 'size-desc') return b.totalBytes - a.totalBytes;
    if (sortBy === 'name-asc') return a.title.localeCompare(b.title);
    return 0;
  });

  // Strict deduplication by ID to prevent any duplicate key errors in UI rendering
  const uniqueSortedItems = sortedItems.filter((item, index, self) =>
    index === self.findIndex((t) => t.id === item.id)
  );

  if (items.length === 0) {
    return (
      <div
        id="active-downloads-empty"
        className={`p-10 rounded-2xl border text-center transition-all ${
          darkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center mx-auto mb-3">
          <Download className="w-7 h-7" />
        </div>
        <h3 className="font-bold text-base sm:text-lg mb-1">Download Queue is Idle</h3>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
          Paste a link from YouTube, TikTok, Facebook, or any website above, or browse the Social Feed tab to launch high-speed transfers.
        </p>
      </div>
    );
  }

  return (
    <div id="active-transfers-section" className="space-y-4">
      {/* Control Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-cyan-500" />
            <span>Active Transfers & Engine Status</span>
          </h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
            {items.length} {items.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeCount > 0 && (
            <button
              type="button"
              id="pause-all-transfers-btn"
              onClick={onPauseAll}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                darkMode
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Pause className="w-3.5 h-3.5 text-amber-500" />
              <span>Pause All ({activeCount})</span>
            </button>
          )}

          {pausedCount > 0 && (
            <button
              type="button"
              id="resume-all-transfers-btn"
              onClick={onResumeAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-all shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume All ({pausedCount})</span>
            </button>
          )}

          {completedCount > 0 && (
            <button
              type="button"
              id="clear-completed-transfers-btn"
              onClick={onClearCompleted}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                darkMode
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              Clear Finished
            </button>
          )}
        </div>
      </div>

      {/* Total Estimated Time Indicator Dashboard */}
      <div
        id="total-estimated-time-indicator"
        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          darkMode
            ? 'bg-zinc-900/90 border-zinc-800 shadow-md shadow-black/20'
            : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl ${theme.bgSubtle} border ${theme.borderSubtle} flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm`}
            >
              <Clock className={`w-6 h-6 ${theme.text} ${activeCount > 0 ? 'animate-pulse' : ''}`} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  Total Estimated Time
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    activeCount > 0
                      ? `${theme.badge} animate-pulse`
                      : pausedCount > 0
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                        : completedCount > 0
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                  }`}
                >
                  {activeCount > 0
                    ? `${activeCount} Ongoing ${activeCount === 1 ? 'Download' : 'Downloads'}`
                    : pausedCount > 0
                      ? `${pausedCount} Paused`
                      : completedCount > 0
                        ? `${completedCount} Completed`
                        : 'Idle'}
                </span>
              </div>

              {/* High-visibility Estimated Time Display */}
              <div className="flex items-baseline gap-2">
                <h2
                  className={`text-2xl sm:text-3xl font-black tracking-tight font-mono ${
                    activeCount > 0
                      ? theme.text
                      : pausedCount > 0
                        ? 'text-amber-500'
                        : completedCount > 0
                          ? 'text-emerald-500'
                          : 'text-slate-400 dark:text-zinc-500'
                  }`}
                >
                  {totalEtaInfo.timeText}
                </h2>
                {activeCount > 0 && aggregateSpeedBytesPerSec > 0 && (
                  <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                    remaining
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                {totalEtaInfo.subtext}
              </p>
            </div>
          </div>

          {/* Aggregate Telemetry Strip */}
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-zinc-800">
            <div className="min-w-[100px]">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500">
                Aggregate Speed
              </div>
              <div className="text-sm sm:text-base font-mono font-bold flex items-center gap-1.5 text-slate-800 dark:text-zinc-100 mt-0.5">
                <Zap className={`w-3.5 h-3.5 ${theme.text}`} />
                <span>{formatBytes(aggregateSpeedBytesPerSec)}/s</span>
              </div>
            </div>

            <div className="min-w-[100px]">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500">
                Data Remaining
              </div>
              <div className="text-sm sm:text-base font-mono font-bold text-slate-800 dark:text-zinc-100 mt-0.5">
                {formatBytes(totalRemainingBytes)}
              </div>
            </div>

            <div className="min-w-[80px]">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500">
                Queue Progress
              </div>
              <div className="text-sm sm:text-base font-mono font-bold text-slate-800 dark:text-zinc-100 mt-0.5">
                {overallProgressPercent}%
              </div>
            </div>
          </div>
        </div>

        {/* Global Progress Bar across ongoing transfers */}
        {activeCount > 0 && (
          <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-zinc-800/80">
            <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-zinc-500 mb-1 font-mono">
              <span>{formatBytes(totalDownloadedBytes)} downloaded</span>
              <span>{formatBytes(totalOngoingBytes)} total active</span>
            </div>
            <div className="h-2 w-full bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${theme.gradient} transition-all duration-300`}
                style={{ width: `${overallProgressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Speed Throttle & Filter / Sort Toolbar */}
      <div
        className={`p-3.5 rounded-2xl border transition-all space-y-3 ${
          darkMode ? 'bg-zinc-900/70 border-zinc-800' : 'bg-white border-slate-200'
        }`}
      >
        {/* Speed Limit Quick Presets */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-cyan-500" />
            <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
              Download Speed Limit:
            </span>
            <span
              className={`text-xs font-mono font-bold px-1.5 py-0.2 rounded ${
                speedLimitMbps > 0
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
              }`}
            >
              {speedLimitMbps > 0 ? `${speedLimitMbps} MB/s Throttle` : 'Unlimited Bandwidth'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { label: 'Unlimited', val: 0 },
              { label: '50 MB/s', val: 50 },
              { label: '25 MB/s', val: 25 },
              { label: '10 MB/s', val: 10 },
              { label: '5 MB/s', val: 5 },
              { label: '2 MB/s', val: 2 },
            ].map((preset) => (
              <button
                key={preset.val}
                type="button"
                id={`speed-preset-btn-${preset.val}`}
                onClick={() => onSetSpeedLimit && onSetSpeedLimit(preset.val)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  speedLimitMbps === preset.val
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : darkMode
                      ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search, Filter & Sort Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              id="active-downloads-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search active transfers by title or file name..."
              className={`w-full pl-8 pr-8 py-1.5 rounded-xl border text-xs outline-none transition-all ${
                darkMode
                  ? 'bg-zinc-950 border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:border-cyan-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Status Filter */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-zinc-800 rounded-lg">
              {(['all', 'downloading', 'paused', 'completed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  id={`status-filter-${st}`}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold capitalize transition-all ${
                    statusFilter === st
                      ? `bg-white dark:bg-zinc-700 ${theme.text} shadow-sm`
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                  }`}
                >
                  {st === 'all' ? 'All' : st}
                </button>
              ))}
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
              <select
                id="active-downloads-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sort active transfers by"
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold outline-none ${
                  darkMode ? 'bg-zinc-950 border-zinc-700 text-zinc-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="date-desc">Newest First</option>
                <option value="progress-desc">Highest Progress</option>
                <option value="speed-desc">Fastest Speed</option>
                <option value="size-desc">Largest Size</option>
                <option value="name-asc">Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Item Cards */}
      <div className="space-y-3">
        {uniqueSortedItems.length === 0 ? (
          <div
            className={`p-8 rounded-2xl border text-center ${
              darkMode ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-slate-200'
            }`}
          >
            <p className="text-xs text-slate-400">No transfers match the current filter or search criteria.</p>
          </div>
        ) : (
          uniqueSortedItems.map((item, index) => {
          const progressPercent = Math.min(
            100,
            Math.max(0, Math.round((item.downloadedBytes / (item.totalBytes || 1)) * 100))
          );
          const isCompleted = item.status === 'completed';
          const isDownloading = item.status === 'downloading' || item.status === 'resuming';
          const isPaused = item.status === 'paused';
          const speedMb = (item.speedBytesPerSec / (1024 * 1024)).toFixed(1);

          return (
            <div
              key={`${item.id}_${index}`}
              id={`transfer-item-${item.id}`}
              className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-sm ${
                darkMode
                  ? 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Top Row: Thumbnail, Title, Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-16 h-12 sm:w-20 sm:h-14 object-cover rounded-lg flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                        {item.platform}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                        {item.quality.label}
                      </span>
                      {item.isEncrypted && (
                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <ShieldCheck className="w-3 h-3" />
                          AES-256 Vault
                        </span>
                      )}
                      {item.autoResumeCount > 0 && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                          Resumed x{item.autoResumeCount}
                        </span>
                      )}
                    </div>
                    <h4 className="font-semibold text-sm truncate" title={item.title}>
                      {item.title}
                    </h4>
                  </div>
                </div>

                {/* Actions per item */}
                <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
                  {/* Simulate Network Drop (Demonstrating Deathless Auto-Resume) */}
                  {isDownloading && (
                    <button
                      type="button"
                      id={`simulate-drop-btn-${item.id}`}
                      onClick={() => onSimulateDrop(item.id)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        darkMode
                          ? 'bg-amber-950/30 border-amber-800 text-amber-300 hover:bg-amber-900/40'
                          : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                      }`}
                      title="Test Deathless Auto-Resume by simulating internet cutoff"
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                      <span className="hidden md:inline">Simulate Drop</span>
                    </button>
                  )}

                  {/* Pause / Resume Button */}
                  {!isCompleted && (
                    <button
                      type="button"
                      id={`toggle-pause-btn-${item.id}`}
                      onClick={() => onTogglePause(item.id)}
                      className={`p-2 rounded-lg border transition-colors ${
                        isPaused
                          ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-500'
                          : darkMode
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                            : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                      }`}
                      title={isPaused ? 'Resume Transfer' : 'Pause Transfer'}
                    >
                      {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
                    </button>
                  )}

                  {/* If completed: Save to Disk or Open in Vault */}
                  {isCompleted && (
                    <>
                      <button
                        type="button"
                        id={`save-disk-btn-${item.id}`}
                        disabled={savingItemId === item.id}
                        onClick={async () => {
                          if (item.botChallengeTriggered || item.isFallbackStream) {
                            const proceed = window.confirm(
                              `Notice: This file is only ${formatBytes(item.downloadedBytes)} because YouTube blocked the cloud IP with a bot challenge ("Sign in to confirm you're not a bot").\n\nTo download the full ${formatBytes(item.totalBytes)} video, configure YouTube Cookies in Settings.\n\nClick OK to save this preview clip anyway, or Cancel to open Settings.`
                            );
                            if (!proceed) {
                              if (onOpenSettings) onOpenSettings();
                              return;
                            }
                          }
                          setSavingItemId(item.id);
                          try {
                            await executeUniversalDownload(item);
                          } finally {
                            setTimeout(() => setSavingItemId(null), 2500);
                          }
                        }}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all text-white ${
                          savingItemId === item.id
                            ? 'bg-emerald-600 animate-pulse'
                            : item.botChallengeTriggered || item.isFallbackStream
                              ? 'bg-amber-600 hover:bg-amber-500'
                              : 'bg-cyan-600 hover:bg-cyan-500'
                        }`}
                        title={
                          item.botChallengeTriggered
                            ? 'Save fallback clip (configure cookies for full size)'
                            : isMobileDevice()
                              ? 'Save file to phone storage / Documents'
                              : 'Save file to local computer disk'
                        }
                      >
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>
                          {savingItemId === item.id
                            ? 'Saving...'
                            : item.botChallengeTriggered
                              ? 'Save Clip'
                              : isMobileDevice()
                                ? 'Save to Mobile'
                                : 'Save to PC'}
                        </span>
                      </button>

                      {onOpenInVault && (
                        <button
                          type="button"
                          id={`open-vault-btn-${item.id}`}
                          onClick={() => onOpenInVault(item.id)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            darkMode
                              ? 'bg-zinc-800 border-zinc-700 text-emerald-400 hover:bg-zinc-700'
                              : 'bg-slate-100 border-slate-200 text-emerald-600 hover:bg-slate-200'
                          }`}
                          title="Open in offline media player"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Play Offline</span>
                        </button>
                      )}

                      {onConvertToConverter && (
                        <button
                          type="button"
                          id={`convert-item-btn-${item.id}`}
                          onClick={() => onConvertToConverter(item)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            darkMode
                              ? 'bg-zinc-800 border-zinc-700 text-cyan-400 hover:bg-zinc-700'
                              : 'bg-slate-100 border-slate-200 text-cyan-600 hover:bg-slate-200'
                          }`}
                          title="Transcode or convert this file in File Converter"
                        >
                          <Repeat className="w-3.5 h-3.5" />
                          <span>Convert</span>
                        </button>
                      )}
                    </>
                  )}

                  {/* Alternative Web Player / Mirrors Fallback Trigger */}
                  <button
                    type="button"
                    id={`alt-player-btn-${item.id}`}
                    onClick={() => setAlternativeModalItem(item)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      darkMode
                        ? 'bg-zinc-800 border-zinc-700 text-amber-400 hover:bg-zinc-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                    }`}
                    title="Open Alternative Web Player, Direct Stream URLs, or Download Mirrors"
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Web Player</span>
                  </button>

                  {/* Cancel / Remove */}
                  <button
                    type="button"
                    id={`cancel-item-btn-${item.id}`}
                    onClick={() => onCancel(item.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Remove task"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Progress Bar & Real-time Metrics */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm font-mono text-cyan-600 dark:text-cyan-400">
                      {progressPercent}%
                    </span>
                    <span className="text-slate-400 dark:text-zinc-500">•</span>
                    <span className="text-slate-600 dark:text-zinc-300 font-mono">
                      {formatBytes(item.downloadedBytes)} / {formatBytes(item.totalBytes)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {isDownloading && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 animate-pulse" />
                        {speedMb} MB/s
                      </span>
                    )}
                    {isPaused && (
                      <span className="text-amber-500 font-medium flex items-center gap-1">
                        <Pause className="w-3 h-3" /> Paused (Resumable)
                      </span>
                    )}
                    {isCompleted && (
                      item.botChallengeTriggered || item.isFallbackStream ? (
                        <span className="text-amber-500 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> YouTube Bot Block (127 KB Fallback)
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Transfer Complete
                        </span>
                      )
                    )}
                    <span className="text-slate-400 dark:text-zinc-500 hidden sm:inline">
                      {isCompleted ? 'Saved' : formatEta(item.etaSeconds)}
                    </span>
                  </div>
                </div>

                {/* Outer Progress Track */}
                <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden relative">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      item.botChallengeTriggered || item.isFallbackStream
                        ? 'bg-amber-500'
                        : isCompleted
                          ? 'bg-emerald-500'
                          : isPaused
                            ? 'bg-amber-500'
                            : `bg-gradient-to-r ${theme.gradient} animate-pulse`
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Bot Challenge Notice & One-click Cookie Fix */}
                {(item.botChallengeTriggered || item.isFallbackStream) && (
                  <div
                    id={`bot-warning-${item.id}`}
                    className={`mt-2.5 p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                      darkMode
                        ? 'bg-amber-950/30 border-amber-800/70 text-amber-200'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-bold text-xs flex items-center gap-2 flex-wrap">
                          <span>YouTube Bot Protection Triggered</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-500/20 text-amber-600 dark:text-amber-400">
                            {formatBytes(item.downloadedBytes)} / {formatBytes(item.totalBytes)}
                          </span>
                        </div>
                        <div className="text-[11px] opacity-90 leading-relaxed">
                          YouTube datacenter bot-detection prevented server downloading. You can watch in the <strong>Alternative Web Player</strong>, extract direct streams, or download directly with your browser (Residential IP).
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      <button
                        type="button"
                        id={`open-alt-modal-${item.id}`}
                        onClick={() => setAlternativeModalItem(item)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 shadow-sm transition-colors"
                      >
                        <Tv className="w-3.5 h-3.5" />
                        <span>Alternative Player & Mirrors</span>
                      </button>

                      {item.directStreamUrl && (
                        <button
                          type="button"
                          onClick={() => triggerDirectBrowserDownload(item.directStreamUrl!, item.fileName)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-amber-500/40 hover:bg-amber-500/10 text-amber-800 dark:text-amber-200 flex items-center gap-1 transition-colors"
                          title="Download stream directly using browser connection (residential IP)"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>Direct Browser Save</span>
                        </button>
                      )}

                      {onOpenSettings && (
                        <button
                          type="button"
                          onClick={onOpenSettings}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-amber-500/30 hover:bg-amber-500/10 text-amber-800 dark:text-amber-200 flex items-center gap-1 transition-colors"
                          title="Configure YouTube Cookies"
                        >
                          <Key className="w-3 h-3" />
                          <span>Cookies</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Multi-thread Chunks Inspection & Stream Headers Toggle */}
                <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-zinc-400">
                  <div className="flex items-center gap-2 min-w-0 max-w-full">
                    <Radio className="w-3 h-3 text-cyan-500 flex-shrink-0" />
                    <span className="truncate">
                      Server: {item.cdnInfo.cdnProvider.split('(')[0]} ({item.cdnInfo.nodeLocation.split(',')[0]})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    {onOpenStreamDebugger && (
                      <button
                        type="button"
                        id={`inspect-headers-btn-${item.id}`}
                        onClick={() => onOpenStreamDebugger(item.id)}
                        className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-medium whitespace-nowrap"
                        title="Inspect HTTP Response Headers, Content-Length & Stream Debugger"
                      >
                        <Terminal className="w-3 h-3 flex-shrink-0" />
                        <span>Inspect Headers & Stream</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleChunkDetails(item.id)}
                      className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-medium whitespace-nowrap"
                    >
                      <SlidersHorizontal className="w-3 h-3 flex-shrink-0" />
                      <span>
                        {expandedChunks[item.id] ? 'Hide 8-Stream Chunks' : 'Inspect 8-Stream Threads'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Expanded Parallel Chunks Visualizer (Proving Massive Multi-part transfers) */}
                {expandedChunks[item.id] && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800 animate-fadeIn">
                    <div className="flex items-center justify-between text-xs font-semibold mb-2 text-slate-700 dark:text-zinc-300">
                      <span>Parallel Thread Streams (8 Active HTTP/3 Range Channels)</span>
                      <span className="text-[10px] font-mono text-cyan-500">Auto-Resume Point Intact</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {item.chunks.map((chunk) => {
                        const chunkPercent = Math.min(
                          100,
                          Math.round((chunk.downloadedBytes / (chunk.totalBytes || 1)) * 100)
                        );
                        return (
                          <div
                            key={chunk.id}
                            className="p-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[10px]"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-slate-600 dark:text-zinc-300">
                                Chunk #{chunk.id + 1}
                              </span>
                              <span
                                className={`font-bold font-mono ${
                                  chunk.status === 'completed'
                                    ? 'text-emerald-500'
                                    : chunk.status === 'downloading'
                                      ? 'text-cyan-500'
                                      : 'text-amber-500'
                                }`}
                              >
                                {chunkPercent}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-1">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  chunk.status === 'completed' ? 'bg-emerald-500' : 'bg-cyan-500'
                                }`}
                                style={{ width: `${chunkPercent}%` }}
                              />
                            </div>
                            <div className="text-slate-400 dark:text-zinc-500 font-mono truncate">
                              {(chunk.downloadedBytes / (1024 * 1024)).toFixed(1)}MB /{' '}
                              {(chunk.totalBytes / (1024 * 1024)).toFixed(1)}MB
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        }))}
      </div>

      {/* Alternative Stream & Web Player Fallback Modal */}
      {alternativeModalItem && (
        <AlternativePlayerModal
          item={alternativeModalItem}
          onClose={() => setAlternativeModalItem(null)}
          darkMode={darkMode}
          onRetryWithClientEngine={(targetItem, directUrl) => {
            if (directUrl) {
              triggerDirectBrowserDownload(directUrl, targetItem.fileName);
            } else {
              onRetry(targetItem.id);
            }
          }}
        />
      )}
    </div>
  );
};
