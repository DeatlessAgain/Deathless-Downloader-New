import React, { useState, useEffect } from 'react';
import {
  X,
  Settings as SettingsIcon,
  ShieldCheck,
  Zap,
  Sliders,
  Check,
  Moon,
  Sun,
  FolderDown,
  Film,
  Music,
  Gauge,
  Bell,
  Volume2,
  Key,
  Upload,
  Trash2,
  AlertCircle,
  Smartphone,
  Palette,
  Sparkles,
  Clock,
  History,
  HardDrive,
  Database,
  RefreshCw,
  Lock,
  Globe,
  Server,
  Wifi,
} from 'lucide-react';
import { AppSettings } from '../services/downloadEngine';
import {
  getApiUrl,
  getBackendBaseUrl,
  setBackendBaseUrl,
  DEFAULT_BACKEND_URL,
  isMobileNative,
} from '../services/apiConfig';
import { getStorageEstimate, StorageEstimateResult } from '../services/cryptoVault';
import {
  playCompletionChime,
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  sendDesktopNotification,
} from '../services/notificationService';
import {
  ACCENT_COLOR_OPTIONS,
  applyAccentToDocument,
  getAccentTheme,
  AccentColor,
} from '../services/accentTheme';

interface SettingsModalProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  onClose: () => void;
  darkMode: boolean;
  onToggleDarkMode?: (value: boolean) => void;
  onRunManualCleanup?: () => number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onSave,
  onClose,
  darkMode,
  onToggleDarkMode,
  onRunManualCleanup,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [localDarkMode, setLocalDarkMode] = useState<boolean>(darkMode);
  const [cleanupFeedbackMsg, setCleanupFeedbackMsg] = useState<string>('');
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    getNotificationPermission()
  );
  const [testedSound, setTestedSound] = useState(false);

  const theme = getAccentTheme(localSettings.accentColor || 'cyan');
  const currentAccent =
    ACCENT_COLOR_OPTIONS.find((a) => a.id === localSettings.accentColor) || ACCENT_COLOR_OPTIONS[0];

  // YouTube Cookies State
  const [hasCookies, setHasCookies] = useState<boolean>(false);
  const [cookieLineCount, setCookieLineCount] = useState<number>(0);
  const [cookieInputText, setCookieInputText] = useState<string>('');
  const [showCookieBox, setShowCookieBox] = useState<boolean>(false);
  const [cookieMsg, setCookieMsg] = useState<string>('');

  // Storage usage summary dashboard state
  const [storageData, setStorageData] = useState<StorageEstimateResult | null>(null);
  const [isRefreshingStorage, setIsRefreshingStorage] = useState<boolean>(false);

  const loadStorageEstimate = async () => {
    setIsRefreshingStorage(true);
    try {
      const data = await getStorageEstimate();
      setStorageData(data);
    } catch (e) {
      console.error('Failed to get storage estimate:', e);
    } finally {
      setIsRefreshingStorage(false);
    }
  };

  useEffect(() => {
    loadStorageEstimate();
  }, []);

  const formatStorageBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  };

  // Backend Server Status & Config
  const [backendUrl, setBackendUrlState] = useState<string>(getBackendBaseUrl() || DEFAULT_BACKEND_URL);
  const [backendStatus, setBackendStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [backendStatusMsg, setBackendStatusMsg] = useState<string>('');
  const [showBackendBox, setShowBackendBox] = useState<boolean>(false);

  const testBackendConnection = async (targetUrl?: string) => {
    const urlToTest = (targetUrl !== undefined ? targetUrl : backendUrl).trim().replace(/\/+$/, '');
    setBackendStatus('checking');
    setBackendStatusMsg('Testing API connection...');
    try {
      const res = await fetch(`${urlToTest}/api/health`, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        setBackendStatus('connected');
        setBackendStatusMsg(`Online • yt-dlp ${data.ytdlp ? 'Ready' : 'Present'}`);
      } else {
        setBackendStatus('error');
        setBackendStatusMsg(`HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (e: any) {
      setBackendStatus('error');
      setBackendStatusMsg('Unreachable: ' + (e.message || 'Check network'));
    }
  };

  useEffect(() => {
    fetch(getApiUrl('/api/cookies'))
      .then((r) => r.json())
      .then((data) => {
        if (data && data.hasCookies) {
          setHasCookies(true);
          setCookieLineCount(data.lineCount || 0);
        }
      })
      .catch(() => {});

    // Initial check for mobile app backend health
    if (isMobileNative()) {
      testBackendConnection(backendUrl);
    }
  }, []);

  const handleSaveCookies = async () => {
    if (!cookieInputText.trim()) return;
    try {
      const res = await fetch(getApiUrl('/api/cookies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookiesText: cookieInputText }),
      });
      const data = await res.json();
      if (res.ok) {
        setHasCookies(true);
        setCookieLineCount(data.lineCount || 0);
        setCookieMsg('Cookies saved and active for YouTube streams!');
        setCookieInputText('');
        setTimeout(() => setCookieMsg(''), 4000);
      } else {
        setCookieMsg('Failed: ' + (data.error || 'unknown'));
      }
    } catch (err: any) {
      setCookieMsg('Error: ' + err.message);
    }
  };

  const handleClearCookies = async () => {
    try {
      await fetch(getApiUrl('/api/cookies'), { method: 'DELETE' });
      setHasCookies(false);
      setCookieLineCount(0);
      setCookieMsg('Cookies cleared.');
      setTimeout(() => setCookieMsg(''), 3000);
    } catch (err: any) {
      setCookieMsg('Error: ' + err.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCookieInputText(text);
      }
    };
    reader.readAsText(file);
  };

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setNotifPermission(getNotificationPermission());
    if (granted) {
      sendDesktopNotification(
        'Deathless Downloader',
        'Desktop notifications are enabled! You will be alerted when downloads finish.'
      );
    }
  };

  const handleTestSound = () => {
    playCompletionChime();
    setTestedSound(true);
    setTimeout(() => setTestedSound(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBackendBaseUrl(backendUrl);
    const updatedSettings = { ...localSettings, darkMode: localDarkMode };
    onSave(updatedSettings);
    if (onToggleDarkMode && localDarkMode !== darkMode) {
      onToggleDarkMode(localDarkMode);
    }
    onClose();
  };

  const handleDarkModeSwitch = (enabled: boolean) => {
    setLocalDarkMode(enabled);
    if (onToggleDarkMode) {
      onToggleDarkMode(enabled);
    }
  };

  return (
    <div
      id="settings-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="settings-modal-dialog"
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden my-auto transition-all ${
          darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base">Application & Engine Settings</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Configure theme, auto-start, storage directories & format defaults
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs sm:text-sm max-h-[75vh] overflow-y-auto">
          {/* Setting 1: Dark Mode Toggle (Explicitly requested by user: turned off by default) */}
          <div className="p-3.5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 mt-0.5">
                {localDarkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </div>
              <div>
                <div className="font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                  <span>Dark Mode Theme</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                    {localDarkMode ? 'Dark Active' : 'Off by Default'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Toggle between high-contrast daylight theme and sleek midnight dark aesthetic.
                </p>
              </div>
            </div>

            {/* Switch button */}
            <button
              type="button"
              id="settings-dark-mode-toggle"
              onClick={() => handleDarkModeSwitch(!localDarkMode)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                localDarkMode ? 'bg-cyan-600' : 'bg-slate-300 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  localDarkMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Setting: UI Color Accent Palette */}
          <div
            id="settings-accent-color-section"
            className="p-3.5 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className={`w-4 h-4 ${theme.text}`} />
                <div>
                  <div className="font-semibold text-xs text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                    <span>UI Color Accent</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize ${theme.badge}`}>
                      {currentAccent.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Select a color accent that propagates across buttons, badges, scrubbers, and active highlights.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
              {ACCENT_COLOR_OPTIONS.map((opt) => {
                const isSelected = (localSettings.accentColor || 'cyan') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    id={`accent-choice-${opt.id}`}
                    onClick={() => {
                      setLocalSettings({ ...localSettings, accentColor: opt.id });
                      applyAccentToDocument(opt.id);
                    }}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-center ${
                      isSelected
                        ? `${opt.theme.border} ${opt.theme.bgSubtle} ring-2 ${opt.theme.ring}`
                        : darkMode
                          ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center shadow-sm"
                      style={{ backgroundColor: opt.colorHex }}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                    </div>
                    <span className="text-[11px] font-medium leading-none text-slate-700 dark:text-zinc-300">
                      {opt.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Setting 2: Auto-Start on Paste Option */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40">
            <div>
              <div className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-cyan-500" />
                <span>Automatically Start Downloading When Link is Pasted</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Instant queue execution using your preferred defaults without waiting for the format modal
              </p>
            </div>
            <input
              type="checkbox"
              id="settings-auto-start-input"
              checked={localSettings.autoStartOnPaste}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, autoStartOnPaste: e.target.checked })
              }
              className="w-4 h-4 rounded text-cyan-600 accent-cyan-600 cursor-pointer ml-3 flex-shrink-0"
            />
          </div>

          {/* Setting 3: Default Download Location / Folder */}
          <div className="p-3.5 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 space-y-1.5">
            <label className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
              <FolderDown className="w-3.5 h-3.5 text-cyan-500" />
              <span>Default Download Directory Path</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Files are tracked and saved to this path in your Download History
            </p>
            <input
              type="text"
              id="settings-download-folder-input"
              value={localSettings.defaultDownloadFolder || '~/Downloads/Deathless'}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, defaultDownloadFolder: e.target.value })
              }
              placeholder="e.g. ~/Downloads/Deathless"
              className={`w-full px-3 py-2 rounded-xl text-xs font-mono border outline-none ${
                darkMode
                  ? 'bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-cyan-500'
                  : 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500'
              }`}
            />
          </div>

          {/* Setting 4: Default Video Format & Quality */}
          <div className="p-3.5 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-cyan-500" />
                <span>Preferred Video Format & Quality</span>
              </span>
              <span className="font-mono text-xs text-cyan-600 dark:text-cyan-400 font-bold uppercase">
                .{localSettings.defaultVideoFormat} • {localSettings.defaultVideoQuality}
              </span>
            </div>

            {/* Video Format Buttons */}
            <div className="grid grid-cols-3 gap-2">
              {(['mp4', 'mkv', 'webm'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setLocalSettings({ ...localSettings, defaultVideoFormat: fmt })}
                  className={`py-1.5 rounded-lg border text-xs font-bold uppercase transition-all ${
                    localSettings.defaultVideoFormat === fmt
                      ? 'bg-cyan-600 text-white border-cyan-600'
                      : darkMode
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                        : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  .{fmt}
                </button>
              ))}
            </div>

            {/* Video Quality Buttons */}
            <div className="grid grid-cols-4 gap-1.5">
              {(['4K', '1080p', '720p', '360p'] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setLocalSettings({ ...localSettings, defaultVideoQuality: q })}
                  className={`py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    localSettings.defaultVideoQuality === q
                      ? 'bg-cyan-600 text-white border-cyan-600'
                      : darkMode
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                        : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Setting 5: Default Audio Bitrate & Format */}
          <div className="p-3.5 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-cyan-500" />
                <span>Preferred Audio Bitrate & Encoding</span>
              </span>
              <span className="font-mono text-xs text-cyan-600 dark:text-cyan-400 font-bold uppercase">
                .{localSettings.defaultAudioFormat || 'mp3'} • {localSettings.defaultAudioQuality}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {['320k', '256k', '192k', '128k'].map((bitrate) => (
                <button
                  key={bitrate}
                  type="button"
                  onClick={() => setLocalSettings({ ...localSettings, defaultAudioQuality: bitrate as any })}
                  className={`py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    localSettings.defaultAudioQuality === bitrate
                      ? 'bg-cyan-600 text-white border-cyan-600'
                      : darkMode
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                        : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  {bitrate === '320k' ? '320k (Max)' : bitrate}
                </button>
              ))}
            </div>
          </div>

          {/* Setting 6: Encrypted Vault Checkbox */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40">
            <div>
              <div className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Store Encrypted In-App Offline Copies</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Store AES-GCM encrypted media chunks for instant playback in the offline player
              </p>
            </div>
            <input
              type="checkbox"
              id="settings-save-vault-input"
              checked={localSettings.saveToEncryptedVault}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, saveToEncryptedVault: e.target.checked })
              }
              className="w-4 h-4 rounded text-cyan-600 accent-cyan-600 cursor-pointer ml-3 flex-shrink-0"
            />
          </div>

          {/* Setting 7: Parallel Chunk Streams */}
          <div className="p-3.5 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-zinc-200">
                Parallel Multi-Thread Range Streams
              </span>
              <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                {localSettings.chunkCount} HTTP/3 Channels
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[4, 8, 16].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setLocalSettings({ ...localSettings, chunkCount: num })}
                  className={`py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    localSettings.chunkCount === num
                      ? 'bg-cyan-600 text-white border-cyan-600'
                      : darkMode
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                        : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  {num} Channels
                </button>
              ))}
            </div>
          </div>

          {/* Setting 8: Download Speed Limit (Bandwidth Cap) */}
          <div className="p-3.5 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-cyan-500" />
                <span>Download Speed Limit</span>
              </span>
              <span className="font-mono font-bold text-xs text-cyan-600 dark:text-cyan-400">
                {localSettings.downloadSpeedLimitMbps === 0
                  ? 'Unlimited (Max Network)'
                  : `${localSettings.downloadSpeedLimitMbps} MB/s Cap`}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Throttle aggregate bandwidth to prevent network congestion or let streams consume full gigabit line.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {[
                { val: 0, label: 'Unlimited' },
                { val: 50, label: '50 MB/s' },
                { val: 25, label: '25 MB/s' },
                { val: 10, label: '10 MB/s' },
                { val: 5, label: '5 MB/s' },
                { val: 2, label: '2 MB/s' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() =>
                    setLocalSettings({ ...localSettings, downloadSpeedLimitMbps: opt.val })
                  }
                  className={`py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    (localSettings.downloadSpeedLimitMbps ?? 0) === opt.val
                      ? 'bg-cyan-600 text-white border-cyan-600'
                      : darkMode
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                        : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Setting 8.5: Download Engine Strategy (Anti-Bot Bypass) */}
          <div className="p-3.5 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-cyan-500" />
                <span>Engine Strategy (Anti-Bot Protection)</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Residential IP Mode
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              Choose how media stream links are fetched. Client-side fetching uses your personal residential IP to bypass YouTube bot blocks and datacenter IP bans.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  id: 'smart_auto',
                  label: 'Smart Auto (Adaptive)',
                  desc: 'Attempts client-side residential fetch; falls back to server proxy smoothly',
                },
                {
                  id: 'client_direct',
                  label: 'Client-Direct (Residential IP)',
                  desc: 'Streams media through your browser to guarantee zero cloud IP bans',
                },
                {
                  id: 'server_proxy',
                  label: 'Server Proxy (yt-dlp)',
                  desc: 'Standard server-side worker pipeline with cookies',
                },
              ].map((engine) => (
                <button
                  key={engine.id}
                  type="button"
                  onClick={() =>
                    setLocalSettings({
                      ...localSettings,
                      downloadEngineMode: engine.id as any,
                    })
                  }
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1 ${
                    (localSettings.downloadEngineMode || 'smart_auto') === engine.id
                      ? 'border-cyan-500 bg-cyan-500/10 text-slate-900 dark:text-zinc-100 shadow-sm'
                      : darkMode
                        ? 'bg-zinc-900 border-zinc-700/80 text-zinc-300 hover:border-zinc-600'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center justify-between">
                    <span>{engine.label}</span>
                    {(localSettings.downloadEngineMode || 'smart_auto') === engine.id && (
                      <Check className="w-3.5 h-3.5 text-cyan-500" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-zinc-400 leading-normal">
                    {engine.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Setting 9: Auto Notify Downloads */}
          <div className="p-3.5 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-cyan-500" />
                <span>Auto Notify Downloads</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                Audio & Desktop Alerts
              </span>
            </div>

            {/* Desktop Notification Toggle */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <div className="font-medium text-xs text-slate-800 dark:text-zinc-200">
                  Desktop System Notifications
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Show OS alert popup with file name and size when download finishes
                </div>
              </div>
              <div className="flex items-center gap-2">
                {notifPermission !== 'granted' && isNotificationSupported() && (
                  <button
                    type="button"
                    onClick={handleRequestPermission}
                    className="px-2 py-1 rounded text-[10px] font-semibold bg-cyan-600/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-600/20 transition-colors"
                  >
                    Enable Browser Perms
                  </button>
                )}
                <input
                  type="checkbox"
                  id="settings-desktop-notif-input"
                  checked={localSettings.desktopNotifications ?? true}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, desktopNotifications: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-cyan-600 accent-cyan-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Sound Notification Toggle */}
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-zinc-800/80 pt-2">
              <div>
                <div className="font-medium text-xs text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Completion Audio Chime</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Play melodic two-tone chime when a download completes successfully
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestSound}
                  className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${
                    testedSound
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                      : darkMode
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                        : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  {testedSound ? 'Chimed!' : 'Test Sound'}
                </button>
                <input
                  type="checkbox"
                  id="settings-sound-notif-input"
                  checked={localSettings.soundNotifications ?? true}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, soundNotifications: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-cyan-600 accent-cyan-600 cursor-pointer"
                />
              </div>
            </div>

            {/* In-App Toast Toggle */}
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-zinc-800/80 pt-2">
              <div>
                <div className="font-medium text-xs text-slate-800 dark:text-zinc-200">
                  In-App Toast Banner Alerts
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Show floating status alert in top-right corner with direct actions
                </div>
              </div>
              <input
                type="checkbox"
                id="settings-toast-notif-input"
                checked={localSettings.inAppToastNotifications ?? true}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, inAppToastNotifications: e.target.checked })
                }
                className="w-4 h-4 rounded text-cyan-600 accent-cyan-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Setting: Smart Download Queue Cleanup */}
          <div
            id="settings-smart-cleanup-section"
            className={`p-4 rounded-xl border space-y-3 ${
              darkMode ? 'bg-zinc-800/40 border-zinc-800' : 'bg-slate-50 border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg ${theme.bgSubtle} ${theme.text} flex items-center justify-center`}>
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs flex items-center gap-2">
                    <span>Smart Queue Cleanup</span>
                    {localSettings.smartCleanupEnabled ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        Active ({localSettings.smartCleanupDays} {localSettings.smartCleanupDays === 1 ? 'Day' : 'Days'})
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-500/10 text-slate-500 border border-slate-500/20">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Automatically removes completed download items from queue after retention period, keeping all records in History.
                  </div>
                </div>
              </div>

              {/* Toggle Switch */}
              <input
                type="checkbox"
                id="settings-smart-cleanup-toggle"
                checked={localSettings.smartCleanupEnabled ?? true}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, smartCleanupEnabled: e.target.checked })
                }
                className={`w-4 h-4 rounded ${theme.accentCheck} cursor-pointer ml-3 flex-shrink-0`}
              />
            </div>

            {localSettings.smartCleanupEnabled && (
              <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-700/60 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Auto-clear completed downloads older than:</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={90}
                      id="settings-smart-cleanup-days-input"
                      value={localSettings.smartCleanupDays ?? 3}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          smartCleanupDays: Math.max(1, parseInt(e.target.value, 10) || 1),
                        })
                      }
                      className={`w-14 px-2 py-1 text-center font-mono font-bold text-xs rounded-lg border outline-none ${
                        darkMode ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
                      {localSettings.smartCleanupDays === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                </div>

                {/* Quick selection chips and Manual Cleanup button */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {[1, 3, 7, 14, 30].map((days) => {
                    const isSelected = (localSettings.smartCleanupDays ?? 3) === days;
                    return (
                      <button
                        key={days}
                        type="button"
                        id={`cleanup-days-preset-${days}`}
                        onClick={() => setLocalSettings({ ...localSettings, smartCleanupDays: days })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                          isSelected
                            ? `${theme.bg} text-white shadow-sm`
                            : darkMode
                              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {days} {days === 1 ? 'Day' : 'Days'}
                      </button>
                    );
                  })}

                  {onRunManualCleanup && (
                    <button
                      type="button"
                      id="settings-run-cleanup-btn"
                      onClick={() => {
                        const cleaned = onRunManualCleanup();
                        setCleanupFeedbackMsg(
                          cleaned > 0
                            ? `Cleaned ${cleaned} completed ${cleaned === 1 ? 'item' : 'items'} from queue to History!`
                            : 'Queue is already tidy! No expired completed items.'
                        );
                        setTimeout(() => setCleanupFeedbackMsg(''), 4000);
                      }}
                      className={`ml-auto px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${
                        darkMode
                          ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      <History className="w-3 h-3" />
                      <span>Run Cleanup Now</span>
                    </button>
                  )}
                </div>

                {cleanupFeedbackMsg && (
                  <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 pt-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>{cleanupFeedbackMsg}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Setting: Storage Usage Summary Dashboard */}
          <div
            id="settings-storage-dashboard-section"
            className={`p-4 rounded-xl border space-y-3.5 transition-all ${
              darkMode ? 'bg-zinc-800/40 border-zinc-800' : 'bg-slate-50 border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg ${theme.bgSubtle} ${theme.text} flex items-center justify-center`}>
                  <HardDrive className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs flex items-center gap-2">
                    <span>Storage Usage &amp; Offline Vault Quota</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${theme.badge}`}>
                      {storageData ? formatStorageBytes(storageData.vaultBytes) : 'Scanning...'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Encrypted Vault occupancy compared to total available device storage quota
                  </div>
                </div>
              </div>

              <button
                type="button"
                id="refresh-storage-quota-btn"
                onClick={loadStorageEstimate}
                disabled={isRefreshingStorage}
                className={`p-1.5 rounded-lg border text-xs transition-all flex items-center gap-1 cursor-pointer ${
                  darkMode
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
                title="Refresh Storage Quota"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStorage ? 'animate-spin' : ''}`} />
                <span className="text-[11px] font-medium hidden sm:inline">Refresh</span>
              </button>
            </div>

            {/* Storage Metric Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              {/* Encrypted Vault */}
              <div
                className={`p-3 rounded-xl border transition-all ${
                  darkMode ? 'bg-zinc-900/80 border-zinc-700/80' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                  <span>Encrypted Vault</span>
                  <Lock className={`w-3 h-3 ${theme.text}`} />
                </div>
                <div className={`text-base sm:text-lg font-black font-mono tracking-tight ${theme.text}`}>
                  {storageData ? formatStorageBytes(storageData.vaultBytes) : '0 B'}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  {storageData?.vaultFileCount || 0} encrypted {storageData?.vaultFileCount === 1 ? 'file' : 'files'} stored
                </div>
              </div>

              {/* Total Device Storage Quota */}
              <div
                className={`p-3 rounded-xl border transition-all ${
                  darkMode ? 'bg-zinc-900/80 border-zinc-700/80' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                  <span>Device Quota</span>
                  <HardDrive className="w-3 h-3 text-cyan-500" />
                </div>
                <div className="text-base sm:text-lg font-black font-mono tracking-tight text-slate-800 dark:text-zinc-100">
                  {storageData ? formatStorageBytes(storageData.browserQuotaBytes) : '10.00 GB'}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  {storageData?.isRealEstimate ? 'Browser system storage' : 'Origin allocation quota'}
                </div>
              </div>

              {/* Available Free Space */}
              <div
                className={`p-3 rounded-xl border transition-all ${
                  darkMode ? 'bg-zinc-900/80 border-zinc-700/80' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                  <span>Free Space</span>
                  <Database className="w-3 h-3 text-emerald-500" />
                </div>
                <div className="text-base sm:text-lg font-black font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                  {storageData ? formatStorageBytes(storageData.freeBytes) : '10.00 GB'}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  Available for downloads
                </div>
              </div>
            </div>

            {/* Storage Progress Meter */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-700 dark:text-zinc-300">
                  Capacity Utilization
                </span>
                <span className="font-mono text-slate-500 dark:text-zinc-400">
                  {storageData ? `${storageData.percentUsed.toFixed(2)}% used` : '0%'}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-200 dark:bg-zinc-700 rounded-full overflow-hidden flex">
                {/* Vault segment */}
                <div
                  className={`h-full ${theme.bg} transition-all duration-500`}
                  style={{
                    width: `${Math.max(
                      1,
                      storageData && storageData.browserQuotaBytes > 0
                        ? (storageData.vaultBytes / storageData.browserQuotaBytes) * 100
                        : 1
                    )}%`,
                  }}
                  title={`Vault Storage: ${storageData ? formatStorageBytes(storageData.vaultBytes) : '0 B'}`}
                />
                {/* Other Browser usage segment */}
                {storageData && storageData.browserUsageBytes > storageData.vaultBytes && (
                  <div
                    className="h-full bg-slate-400 dark:bg-zinc-500 transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        99,
                        ((storageData.browserUsageBytes - storageData.vaultBytes) /
                          storageData.browserQuotaBytes) *
                          100
                      )}%`,
                    }}
                    title="Other Cached Data"
                  />
                )}
              </div>
            </div>

            {/* Category Breakdown Chips */}
            {storageData && storageData.vaultBytes > 0 && (
              <div className="pt-1.5 border-t border-slate-200/60 dark:border-zinc-700/60 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500">
                  Vault Breakdown:
                </span>
                {storageData.categoryBreakdown.video.bytes > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                    Video: {formatStorageBytes(storageData.categoryBreakdown.video.bytes)} ({storageData.categoryBreakdown.video.count})
                  </span>
                )}
                {storageData.categoryBreakdown.audio.bytes > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                    Audio: {formatStorageBytes(storageData.categoryBreakdown.audio.bytes)} ({storageData.categoryBreakdown.audio.count})
                  </span>
                )}
                {storageData.categoryBreakdown.document.bytes > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Docs: {formatStorageBytes(storageData.categoryBreakdown.document.bytes)} ({storageData.categoryBreakdown.document.count})
                  </span>
                )}
                {storageData.categoryBreakdown.other.bytes > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Other: {formatStorageBytes(storageData.categoryBreakdown.other.bytes)} ({storageData.categoryBreakdown.other.count})
                  </span>
                )}
              </div>
            )}
          </div>
          <div
            id="settings-youtube-cookies-section"
            className={`p-4 rounded-xl border space-y-3 ${
              darkMode ? 'bg-zinc-800/40 border-zinc-800' : 'bg-slate-50 border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center">
                  <Key className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs flex items-center gap-2">
                    <span>YouTube Cloud Authentication</span>
                    {hasCookies ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        {cookieLineCount} Cookies Active
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        Optional
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Bypass YouTube cloud IP challenges with browser Netscape cookies
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCookieBox(!showCookieBox)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                  showCookieBox
                    ? 'bg-zinc-700 text-white border-zinc-600'
                    : darkMode
                      ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {showCookieBox ? 'Close' : hasCookies ? 'Manage' : 'Configure'}
              </button>
            </div>

            {showCookieBox && (
              <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-700/60 space-y-2.5 animate-fadeIn">
                <p className="text-[11px] text-slate-600 dark:text-zinc-300 leading-relaxed">
                  YouTube protects its streams on datacenter IPs with bot checks. Export your cookies using any browser extension (e.g. <i>Get cookies.txt LOCALLY</i>) and paste below:
                </p>
                <textarea
                  value={cookieInputText}
                  onChange={(e) => setCookieInputText(e.target.value)}
                  placeholder="# Netscape HTTP Cookie File&#10;.youtube.com&#9;TRUE&#9;/&#9;TRUE&#9;1788888888&#9;SID&#9;...&#10;or paste full cookies.txt contents here"
                  rows={4}
                  className={`w-full text-xs font-mono p-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none ${
                    darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-white border-slate-300 text-slate-800'
                  }`}
                />
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload cookies.txt</span>
                    <input type="file" accept=".txt" onChange={handleFileUpload} className="hidden" />
                  </label>
                  <div className="flex items-center gap-2">
                    {hasCookies && (
                      <button
                        type="button"
                        onClick={handleClearCookies}
                        className="px-2.5 py-1 text-xs text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Clear</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveCookies}
                      disabled={!cookieInputText.trim()}
                      className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                    >
                      Save Cookies
                    </button>
                  </div>
                </div>
                {cookieMsg && (
                  <div className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{cookieMsg}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cloud Run Backend Server API Endpoint for APK / Web */}
          <div
            id="settings-backend-server-section"
            className={`p-4 rounded-xl border space-y-3 ${
              darkMode ? 'bg-zinc-800/40 border-zinc-800' : 'bg-slate-50 border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                  <Server className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs flex items-center gap-2">
                    <span>Backend Cloud Server (yt-dlp Engine)</span>
                    {backendStatus === 'connected' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Connected
                      </span>
                    ) : backendStatus === 'checking' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                        Checking...
                      </span>
                    ) : backendStatus === 'error' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                        Offline / Error
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-500/10 text-slate-500 border border-slate-500/20">
                        {isMobileNative() ? 'Mobile Active' : 'Cloud Ready'}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Provides yt-dlp parsing, direct video streaming, and media conversions for APK
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => testBackendConnection()}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors flex items-center gap-1 ${
                    darkMode
                      ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Wifi className="w-3 h-3" />
                  <span>Test</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowBackendBox(!showBackendBox)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                    showBackendBox
                      ? 'bg-zinc-700 text-white border-zinc-600'
                      : darkMode
                        ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {showBackendBox ? 'Close' : 'Config'}
                </button>
              </div>
            </div>

            {backendStatusMsg && (
              <div
                className={`text-[11px] px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 font-mono ${
                  backendStatus === 'connected'
                    ? 'bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : backendStatus === 'error'
                      ? 'bg-rose-500/5 text-rose-600 dark:text-rose-400 border-rose-500/20'
                      : 'bg-cyan-500/5 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
                }`}
              >
                <span>{backendStatusMsg}</span>
              </div>
            )}

            {showBackendBox && (
              <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-700/60 space-y-2 animate-fadeIn">
                <label className="text-[11px] font-medium text-slate-600 dark:text-zinc-300 block">
                  Backend Server API Base URL:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={backendUrl}
                    onChange={(e) => setBackendUrlState(e.target.value)}
                    placeholder="https://ais-pre-....run.app"
                    className={`flex-1 text-xs font-mono px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                      darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setBackendUrlState(DEFAULT_BACKEND_URL);
                      testBackendConnection(DEFAULT_BACKEND_URL);
                    }}
                    className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300 border border-dashed rounded-lg transition-colors"
                  >
                    Reset Default
                  </button>
                </div>
                <div className="text-[10px] text-slate-400 dark:text-zinc-500">
                  Default: <code className="font-mono">{DEFAULT_BACKEND_URL}</code>
                </div>
              </div>
            )}
          </div>

          {/* Capacitor Mobile & Android APK Platform Status */}
          <div
            id="settings-android-capacitor-section"
            className={`p-4 rounded-xl border space-y-2.5 ${
              darkMode ? 'bg-zinc-800/40 border-zinc-800' : 'bg-slate-50 border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Smartphone className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-xs flex items-center gap-2">
                    <span>Android APK Platform (Capacitor)</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      Configured
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                    App ID: <code className="font-mono text-[10px] text-cyan-600 dark:text-cyan-400">com.deathless.downloader</code> • Native Filesystem Plugin Active
                  </div>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed bg-black/5 dark:bg-black/20 p-2.5 rounded-lg font-mono text-[10px] space-y-1">
              <div># Build APK commands:</div>
              <div className="text-cyan-600 dark:text-cyan-400">npm run cap:sync</div>
              <div className="text-slate-600 dark:text-zinc-400">cd android &amp;&amp; ./gradlew assembleDebug</div>
              <div className="text-slate-500 text-[9px] font-sans pt-0.5">Outputs to: android/app/build/outputs/apk/debug/app-debug.apk</div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border ${
                darkMode ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2 rounded-xl text-xs font-bold ${theme.bg} ${theme.bgHover} text-white shadow-md ${theme.glow}`}
            >
              Save Preferences
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
