import React, { useState } from 'react';
import {
  ShieldCheck,
  Zap,
  Moon,
  Sun,
  Layers,
  Clock,
  HardDrive,
  Compass,
  Settings as SettingsIcon,
  DownloadCloud,
  Repeat,
  Gauge,
  Terminal,
} from 'lucide-react';
import { AccentColor, getAccentTheme } from '../services/accentTheme';

interface HeaderProps {
  currentTab: 'downloader' | 'converter' | 'social' | 'batch' | 'vault' | 'history';
  setCurrentTab: (tab: 'downloader' | 'converter' | 'social' | 'batch' | 'vault' | 'history') => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  activeCount: number;
  totalSpeedMbps: number;
  speedLimitMbps?: number;
  onSetSpeedLimit?: (limit: number) => void;
  onOpenSettings: () => void;
  onOpenStreamDebugger?: () => void;
  accentColor?: AccentColor;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  darkMode,
  setDarkMode,
  activeCount,
  totalSpeedMbps,
  speedLimitMbps = 0,
  onSetSpeedLimit,
  onOpenSettings,
  onOpenStreamDebugger,
  accentColor = 'cyan',
}) => {
  const theme = getAccentTheme(accentColor);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const speedOptions = [
    { label: 'Unlimited (Max)', value: 0 },
    { label: '50 MB/s', value: 50 },
    { label: '25 MB/s', value: 25 },
    { label: '10 MB/s', value: 10 },
    { label: '5 MB/s', value: 5 },
    { label: '2 MB/s', value: 2 },
  ];

  const tabs: Array<{
    id: 'downloader' | 'converter' | 'social' | 'batch' | 'vault' | 'history';
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: 'downloader',
      label: 'Universal Downloader',
      icon: <DownloadCloud className="w-4 h-4" />,
      badge: activeCount > 0 ? activeCount : undefined,
    },
    {
      id: 'converter',
      label: 'File Converter',
      icon: <Repeat className="w-4 h-4" />,
    },
    {
      id: 'social',
      label: 'Social Media Feed',
      icon: <Compass className="w-4 h-4" />,
    },
    {
      id: 'batch',
      label: 'Batch & Playlists',
      icon: <Layers className="w-4 h-4" />,
    },
    {
      id: 'vault',
      label: 'Encrypted Vault',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
    {
      id: 'history',
      label: 'Download History',
      icon: <Clock className="w-4 h-4" />,
    },
  ];

  return (
    <header
      id="app-header"
      className={`border-b sticky top-0 z-40 transition-colors ${
        darkMode ? 'bg-zinc-950/95 border-zinc-800 text-zinc-100' : 'bg-white/95 border-slate-200 text-slate-900'
      } backdrop-blur-md`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-4">
          {/* Logo & Brand */}
          <div
            id="brand-logo-btn"
            onClick={() => setCurrentTab('downloader')}
            className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none group min-w-0 flex-shrink-0"
          >
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr ${theme.gradient} flex items-center justify-center text-white shadow-md ${theme.glow} group-hover:scale-105 transition-transform flex-shrink-0`}>
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base sm:text-lg tracking-tight font-sans">Deathless</span>
                <span className={`text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-full ${theme.badge} flex-shrink-0`}>
                  v4.0
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium hidden sm:block truncate">
                Resilient Multi-Platform Media Engine
              </p>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav id="desktop-nav-tabs" className="hidden md:flex items-center gap-1">
            {tabs.map((tab) => {
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => setCurrentTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? darkMode
                        ? 'bg-zinc-800 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-900 shadow-sm'
                      : darkMode
                        ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${theme.bg} text-white animate-pulse`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Controls: Speed Indicator, Dark Mode Switch, Settings */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
            {/* Live Speed Ticker */}
            {activeCount > 0 ? (
              <div
                id="header-speed-badge"
                className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${theme.bgSubtle} ${theme.border} ${theme.text}`}
              >
                <div className={`w-2 h-2 rounded-full ${theme.bg} animate-ping`} />
                <span>{totalSpeedMbps.toFixed(1)} MB/s</span>
                <span className="text-slate-400 dark:text-zinc-500">|</span>
                <span>{activeCount} Active</span>
              </div>
            ) : (
              <div
                id="header-idle-badge"
                className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-900"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Auto-Resume Active</span>
              </div>
            )}

            {/* Speed Limiter Selector */}
            <div className="relative">
              <button
                type="button"
                id="header-speed-limiter-btn"
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className={`flex items-center gap-1 sm:gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  speedLimitMbps > 0
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                    : darkMode
                      ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
                title="Download Speed Limiter / Bandwidth Throttle"
              >
                <Gauge className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />
                <span className="hidden sm:inline">
                  {speedLimitMbps > 0 ? `${speedLimitMbps} MB/s Limit` : 'Unlimited'}
                </span>
              </button>

              {/* Speed Menu Dropdown */}
              {showSpeedMenu && (
                <div
                  className={`absolute right-0 mt-2 w-44 rounded-xl border shadow-xl py-1 z-50 animate-fadeIn ${
                    darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="px-3 py-1.5 border-b border-slate-100 dark:border-zinc-800 text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                    Bandwidth Limiter
                  </div>
                  {speedOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        if (onSetSpeedLimit) onSetSpeedLimit(opt.value);
                        setShowSpeedMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-cyan-500/10 hover:text-cyan-600 transition-colors ${
                        speedLimitMbps === opt.value ? 'font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/5' : ''
                      }`}
                    >
                      <span>{opt.label}</span>
                      {speedLimitMbps === opt.value && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dark Mode Switch (Default OFF as requested) */}
            <button
              id="dark-mode-toggle-btn"
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg border transition-all ${
                darkMode
                  ? 'bg-zinc-900 border-zinc-800 text-amber-400 hover:bg-zinc-800'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
              title={darkMode ? 'Switch to Light Mode (Current: Dark)' : 'Switch to Dark Mode (Current: Light [Default])'}
              aria-label="Toggle Dark Mode"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Stream Debugger & File Headers Inspector */}
            {onOpenStreamDebugger && (
              <button
                type="button"
                id="header-stream-debugger-btn"
                onClick={onOpenStreamDebugger}
                className={`p-2 rounded-lg border transition-all ${
                  darkMode
                    ? 'bg-zinc-900 border-zinc-800 text-cyan-400 hover:bg-zinc-800 hover:border-cyan-500/30'
                    : 'bg-slate-100 border-slate-200 text-cyan-600 hover:bg-slate-200 hover:border-cyan-400/50'
                }`}
                title="Inspect Stream Headers, Telemetry & Blob Saving"
                aria-label="Stream Debugger"
              >
                <Terminal className="w-4 h-4" />
              </button>
            )}

            {/* Settings Trigger */}
            <button
              id="settings-modal-btn"
              onClick={onOpenSettings}
              className={`p-2 rounded-lg border transition-all ${
                darkMode
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
              title="Downloader Engine Configuration"
              aria-label="Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar */}
        <div className="flex md:hidden items-center overflow-x-auto py-2 border-t border-slate-100 dark:border-zinc-800/80 gap-1.5 no-scrollbar w-full min-w-0">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`mobile-tab-${tab.id}`}
                onClick={() => setCurrentTab(tab.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? darkMode
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'bg-slate-900 text-white shadow-sm'
                    : darkMode
                      ? 'text-zinc-400 hover:bg-zinc-900'
                      : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.icon}
                <span>{tab.label.split(' ')[0]}</span>
                {tab.badge !== undefined && (
                  <span className={`w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold ${theme.bg} text-white`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
