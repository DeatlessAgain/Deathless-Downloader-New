import React, { useState, useEffect } from 'react';
import {
  X,
  Activity,
  FileCode,
  Layers,
  HardDrive,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Zap,
  Globe,
  Sliders,
  Clock,
  ShieldCheck,
  ArrowDownCircle,
  ExternalLink,
} from 'lucide-react';
import {
  StreamSessionDebug,
  StreamHeaderInfo,
  DownloadItem,
} from '../types';
import {
  getAllStreamSessions,
  subscribeToStreamDebug,
  probeStreamHeaders,
  saveMediaBlobImproved,
} from '../services/streamDebugService';

interface StreamDebuggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDownloadId?: string;
  activeDownloads: DownloadItem[];
  darkMode: boolean;
  onOpenSettings?: () => void;
}

export const StreamDebuggerModal: React.FC<StreamDebuggerModalProps> = ({
  isOpen,
  onClose,
  initialDownloadId,
  activeDownloads,
  darkMode,
  onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'headers' | 'stream' | 'blob'>('headers');
  const [sessions, setSessions] = useState<StreamSessionDebug[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | ''>(initialDownloadId || '');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Custom probe tool state
  const [probeUrl, setProbeUrl] = useState('');
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<StreamHeaderInfo | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Blob test saving state
  const [isSavingTest, setIsSavingTest] = useState(false);
  const [saveStatusMessage, setSaveStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToStreamDebug((all) => {
      setSessions(all);
      if (!selectedSessionId && all.length > 0) {
        setSelectedSessionId(all[0].downloadId);
      }
    });
    return unsub;
  }, [selectedSessionId]);

  useEffect(() => {
    if (initialDownloadId) {
      setSelectedSessionId(initialDownloadId);
    } else if (sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0].downloadId);
    }
  }, [initialDownloadId, sessions]);

  if (!isOpen) return null;

  const currentSession = sessions.find((s) => s.downloadId === selectedSessionId);
  const activeDownloadItem = activeDownloads.find((d) => d.id === selectedSessionId);

  const displayHeaders = probeResult || currentSession?.headers;

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRunProbe = async () => {
    const target = probeUrl.trim() || currentSession?.url || activeDownloadItem?.originalUrl;
    if (!target) {
      setProbeError('Please enter a media or direct file URL to probe.');
      return;
    }

    setIsProbing(true);
    setProbeError(null);
    setProbeResult(null);

    try {
      const result = await probeStreamHeaders(target, {
        title: activeDownloadItem?.title,
        format: activeDownloadItem?.format,
        isAudioOnly: activeDownloadItem?.quality.isAudioOnly,
        formatId: activeDownloadItem?.quality.formatId,
      });
      setProbeResult(result);
    } catch (err: any) {
      setProbeError(err.message || 'Failed to inspect file headers');
    } finally {
      setIsProbing(false);
    }
  };

  const handleTestBlobSave = async () => {
    if (!activeDownloadItem) return;
    setIsSavingTest(true);
    setSaveStatusMessage('Initializing improved blob saving engine...');

    try {
      let blob: Blob | null = null;
      if (activeDownloadItem.mediaBlobUrl) {
        const res = await fetch(activeDownloadItem.mediaBlobUrl);
        blob = await res.blob();
      }

      if (!blob) {
        setSaveStatusMessage('Downloading stream buffer to assemble test Blob...');
        const streamUrl = `/api/download?url=${encodeURIComponent(activeDownloadItem.originalUrl)}&formatId=${encodeURIComponent(activeDownloadItem.quality.formatId || '')}&format=${encodeURIComponent(activeDownloadItem.format)}&isAudioOnly=${activeDownloadItem.quality.isAudioOnly}&title=${encodeURIComponent(activeDownloadItem.title)}`;
        const res = await fetch(streamUrl);
        blob = await res.blob();
      }

      setSaveStatusMessage('Writing Blob with File System Access / Native Picker...');
      const result = await saveMediaBlobImproved(blob, activeDownloadItem.fileName, {
        expectedBytes: activeDownloadItem.totalBytes,
        downloadId: activeDownloadItem.id,
        onProgress: (msg) => setSaveStatusMessage(msg),
      });

      if (result.success) {
        setSaveStatusMessage(
          `Successfully saved via ${result.method.replace(/_/g, ' ')} (${formatBytes(result.sizeBytes)})`
        );
      } else {
        setSaveStatusMessage(`Save completed: ${result.savedLocation}`);
      }
    } catch (err: any) {
      setSaveStatusMessage(`Save error: ${err.message}`);
    } finally {
      setIsSavingTest(false);
    }
  };

  const hasFileSystemAccess =
    typeof window !== 'undefined' &&
    'showSaveFilePicker' in window &&
    typeof (window as any).showSaveFilePicker === 'function';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        id="stream-debugger-modal"
        className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all ${
          darkMode
            ? 'bg-zinc-900 border-zinc-700/80 text-zinc-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between gap-3 ${
            darkMode ? 'bg-zinc-950/80 border-zinc-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Stream Debugger & Headers Inspector</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                  HTTP & Blob Diagnostics
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Inspect raw HTTP stream response headers, live chunk telemetry, and verified disk blob saving.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-slate-100 text-slate-500'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stream Session Selector Bar */}
        <div
          className={`px-5 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 text-xs ${
            darkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-slate-100/70 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 overflow-x-auto max-w-full">
            <span className="font-semibold text-slate-400 dark:text-zinc-400 flex items-center gap-1 flex-shrink-0">
              <Activity className="w-3.5 h-3.5 text-cyan-500" /> Target Stream:
            </span>
            {sessions.length > 0 ? (
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className={`max-w-[180px] sm:max-w-xs truncate px-2.5 py-1 rounded-lg border text-xs font-medium outline-none ${
                  darkMode
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                    : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                {sessions.map((s) => (
                  <option key={s.downloadId} value={s.downloadId}>
                    {s.fileName} ({formatBytes(s.bytesReceived)} / {formatBytes(s.totalBytesExpected)}) [{s.status}]
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-slate-500 italic">No active stream session yet</span>
            )}
          </div>

          {/* Quick Tabs */}
          <div className="flex items-center gap-1 rounded-lg p-1 bg-slate-200/60 dark:bg-zinc-800 border border-slate-300/60 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setActiveTab('headers')}
              className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'headers'
                  ? 'bg-white dark:bg-zinc-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>File Headers</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stream')}
              className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'stream'
                  ? 'bg-white dark:bg-zinc-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Stream Logs</span>
              {currentSession && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('blob')}
              className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'blob'
                  ? 'bg-white dark:bg-zinc-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Blob Saving</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* TAB 1: FILE HEADERS INSPECTOR */}
          {activeTab === 'headers' && (
            <div className="space-y-4">
              {/* URL Probe Input Bar */}
              <div
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 ${
                  darkMode ? 'bg-zinc-950/50 border-zinc-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700">
                  <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={probeUrl}
                    onChange={(e) => setProbeUrl(e.target.value)}
                    placeholder={
                      currentSession?.url ||
                      activeDownloadItem?.originalUrl ||
                      'Paste any URL to test & inspect HTTP stream headers...'
                    }
                    className="w-full bg-transparent text-xs outline-none text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500"
                  />
                </div>
                <button
                  type="button"
                  disabled={isProbing}
                  onClick={handleRunProbe}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors flex-shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
                  <span>{isProbing ? 'Probing...' : 'Check File Headers'}</span>
                </button>
              </div>

              {probeError && (
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{probeError}</span>
                </div>
              )}

              {/* Bot Protection Notice if active */}
              {displayHeaders?.isBotBlocked && (
                <div
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    darkMode
                      ? 'bg-amber-950/30 border-amber-800/80 text-amber-200'
                      : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-xs">
                        YouTube Bot Protection Flagged: X-Bot-Blocked: 1
                      </div>
                      <div className="text-[11px] opacity-90 mt-0.5">
                        YouTube detected the cloud server IP and returned a bot check (127 KB fallback clip). Headers reflect the synthesized fallback stream.
                      </div>
                    </div>
                  </div>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1.5 flex-shrink-0 shadow-sm transition-colors"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Fix with Cookies</span>
                    </button>
                  )}
                </div>
              )}

              {/* Header Overview Cards */}
              {displayHeaders ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div
                      className={`p-3 rounded-xl border ${
                        darkMode ? 'bg-zinc-800/60 border-zinc-700/60' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 dark:text-zinc-500">
                        Status Code
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            displayHeaders.statusCode === 200 || displayHeaders.statusCode === 206
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                          }`}
                        />
                        <span className="font-bold text-sm">
                          {displayHeaders.statusCode} {displayHeaders.statusText}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Latency: {displayHeaders.latencyMs}ms
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-xl border ${
                        darkMode ? 'bg-zinc-800/60 border-zinc-700/60' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 dark:text-zinc-500">
                        Content-Length
                      </div>
                      <div className="mt-1 font-bold text-sm text-cyan-600 dark:text-cyan-400">
                        {formatBytes(displayHeaders.contentLength)}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        {displayHeaders.contentLength.toLocaleString()} bytes
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-xl border ${
                        darkMode ? 'bg-zinc-800/60 border-zinc-700/60' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 dark:text-zinc-500">
                        Content-Type
                      </div>
                      <div className="mt-1 font-bold text-sm truncate" title={displayHeaders.contentType}>
                        {displayHeaders.contentType.split(';')[0]}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        MIME Container
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-xl border ${
                        darkMode ? 'bg-zinc-800/60 border-zinc-700/60' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 dark:text-zinc-500">
                        Accept-Ranges
                      </div>
                      <div className="mt-1 font-bold text-sm flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{displayHeaders.acceptRanges || 'bytes'}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Multi-Thread Capable
                      </div>
                    </div>
                  </div>

                  {/* Raw HTTP Headers Table */}
                  <div className="rounded-xl border overflow-hidden border-slate-200 dark:border-zinc-800">
                    <div
                      className={`px-4 py-2.5 border-b flex items-center justify-between font-semibold ${
                        darkMode ? 'bg-zinc-950/70 border-zinc-800' : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <FileCode className="w-3.5 h-3.5 text-cyan-500" />
                        HTTP Response Headers ({Object.keys(displayHeaders.allHeaders || {}).length})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            JSON.stringify(displayHeaders.allHeaders, null, 2),
                            'all-headers'
                          )
                        }
                        className="flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline"
                      >
                        {copiedKey === 'all-headers' ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedKey === 'all-headers' ? 'Copied JSON' : 'Copy All JSON'}</span>
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-zinc-800 font-mono text-[11px]">
                      {Object.entries(displayHeaders.allHeaders || {}).map(([key, value]) => (
                        <div
                          key={key}
                          className={`flex items-start justify-between px-4 py-2 transition-colors ${
                            darkMode ? 'hover:bg-zinc-800/40' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex-1 pr-4">
                            <span className="font-semibold text-cyan-600 dark:text-cyan-400 select-all">
                              {key}:
                            </span>{' '}
                            <span className="text-slate-700 dark:text-zinc-300 break-all select-all">
                              {value}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(`${key}: ${value}`, key)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1 rounded"
                            title="Copy header line"
                          >
                            {copiedKey === key ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* cURL Inspection Helper */}
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                      darkMode ? 'bg-zinc-950/40 border-zinc-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="font-mono text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                      curl -I &quot;{displayHeaders.url}&quot;
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(`curl -I "${displayHeaders.url}"`, 'curl-cmd')
                      }
                      className="px-2.5 py-1 rounded bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-xs font-semibold flex items-center gap-1 flex-shrink-0"
                    >
                      {copiedKey === 'curl-cmd' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>Copy cURL</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-slate-400 dark:text-zinc-500 space-y-2">
                  <FileCode className="w-8 h-8 mx-auto opacity-40" />
                  <p>Select a stream session or click &quot;Check File Headers&quot; to inspect response headers.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LIVE STREAM TELEMETRY */}
          {activeTab === 'stream' && (
            <div className="space-y-4">
              {currentSession ? (
                <>
                  {/* Status & Stats Banner */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div
                      className={`p-3 rounded-xl border ${
                        darkMode ? 'bg-zinc-800/60 border-zinc-700/60' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Stream Status</div>
                      <div className="mt-1 font-bold text-sm capitalize text-cyan-500 flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            currentSession.status === 'completed'
                              ? 'bg-emerald-500'
                              : currentSession.status === 'failed'
                              ? 'bg-red-500'
                              : 'bg-cyan-500 animate-pulse'
                          }`}
                        />
                        {currentSession.status.replace(/_/g, ' ')}
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-xl border ${
                        darkMode ? 'bg-zinc-800/60 border-zinc-700/60' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Chunks Read</div>
                      <div className="mt-1 font-bold text-sm text-slate-800 dark:text-zinc-100">
                        {currentSession.chunksReceived.toLocaleString()} chunks
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-xl border ${
                        darkMode ? 'bg-zinc-800/60 border-zinc-700/60' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Data Transferred</div>
                      <div className="mt-1 font-bold text-sm text-emerald-600 dark:text-emerald-400">
                        {formatBytes(currentSession.bytesReceived)}
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-xl border ${
                        darkMode ? 'bg-zinc-800/60 border-zinc-700/60' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Throughput</div>
                      <div className="mt-1 font-bold text-sm text-indigo-500">
                        {currentSession.avgSpeedMbps.toFixed(1)} Mbps
                      </div>
                    </div>
                  </div>

                  {/* Terminal-style Activity Logs */}
                  <div className="rounded-xl border border-slate-800 bg-zinc-950 text-zinc-300 font-mono text-[11px] overflow-hidden">
                    <div className="px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-semibold text-zinc-200">Stream Event Log Output</span>
                      </div>
                      <span className="text-[10px] text-zinc-500">
                        {currentSession.logs.length} events logged
                      </span>
                    </div>

                    <div className="p-3 max-h-72 overflow-y-auto space-y-1.5">
                      {currentSession.logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                          <span className="text-zinc-600 select-none">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span
                            className={`px-1 rounded text-[9px] uppercase font-bold select-none ${
                              log.type === 'header'
                                ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                                : log.type === 'chunk'
                                ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                                : log.type === 'save'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : log.type === 'error'
                                ? 'bg-red-950 text-red-400 border border-red-800'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {log.type}
                          </span>
                          <span className="flex-1 break-all">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-slate-400 dark:text-zinc-500 space-y-2">
                  <Activity className="w-8 h-8 mx-auto opacity-40" />
                  <p>No stream active. Start a download to watch real-time streaming telemetry.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BLOB SAVING & STORAGE ENGINE */}
          {activeTab === 'blob' && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-xl border ${
                  darkMode ? 'bg-zinc-950/50 border-zinc-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm mb-1 text-slate-900 dark:text-zinc-100">
                  <HardDrive className="w-4 h-4 text-cyan-500" />
                  Improved Blob Saving Engine Architecture
                </div>
                <p className="text-slate-500 dark:text-zinc-400 text-xs leading-relaxed">
                  Avoids memory corruption, zero-byte downloads, and browser popup blocking with a three-tier saving architecture:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <div
                    className={`p-3 rounded-xl border ${
                      hasFileSystemAccess
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : darkMode
                        ? 'border-zinc-800 bg-zinc-900'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      {hasFileSystemAccess ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>File System Access API</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                      {hasFileSystemAccess
                        ? 'Active & Supported! Streams data directly into native OS save dialog.'
                        : 'Not supported in this browser (auto-falls back to Blob Object URL).'}
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      darkMode ? 'border-zinc-800 bg-zinc-900' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-500">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Android / Mobile Filesystem</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                      Capacitor Documents directory writing with memory-safe chunking for large 400MB+ videos.
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      darkMode ? 'border-zinc-800 bg-zinc-900' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-cyan-500">
                      <ArrowDownCircle className="w-3.5 h-3.5" />
                      <span>Blob URL Engine</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                      MIME-typed Blob constructor with automated memory revocation timeout (prevents V8 memory leaks).
                    </p>
                  </div>
                </div>
              </div>

              {/* Action: Test Save Blob */}
              {activeDownloadItem && (
                <div
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
                  }`}
                >
                  <div>
                    <div className="font-bold text-xs text-slate-900 dark:text-zinc-100">
                      Test Save: {activeDownloadItem.fileName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Expected: {formatBytes(activeDownloadItem.totalBytes)} | Received: {formatBytes(activeDownloadItem.downloadedBytes)}
                    </div>
                    {saveStatusMessage && (
                      <div className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 mt-1">
                        {saveStatusMessage}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={isSavingTest}
                    onClick={handleTestBlobSave}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold flex items-center gap-2 shadow-sm transition-colors flex-shrink-0"
                  >
                    <HardDrive className={`w-4 h-4 ${isSavingTest ? 'animate-spin' : ''}`} />
                    <span>{isSavingTest ? 'Saving...' : 'Test Save to Disk (Native Picker)'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-5 py-3 border-t flex items-center justify-between text-xs ${
            darkMode ? 'bg-zinc-950/80 border-zinc-800 text-zinc-400' : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Stream Debug & Headers Diagnostics Ready</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border font-semibold hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
