import React, { useState } from 'react';
import { Search, Download, Globe, Youtube, Instagram, Video, Share2, Compass, ArrowRight } from 'lucide-react';

interface SocialFeedBrowserProps {
  onSelectUrl: (url: string) => void;
  onSelectVideoForDownload?: (url: string, title?: string) => void;
  darkMode?: boolean;
}

export function SocialFeedBrowser({
  onSelectUrl,
  onSelectVideoForDownload,
  darkMode,
}: SocialFeedBrowserProps) {
  const [searchUrl, setSearchUrl] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | 'youtube' | 'tiktok' | 'instagram' | 'twitter'>('all');

  const handleSelect = (url: string) => {
    onSelectUrl(url);
    if (onSelectVideoForDownload) {
      onSelectVideoForDownload(url);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchUrl.trim()) return;
    handleSelect(searchUrl.trim());
    setSearchUrl('');
  };

  // Preset platforms quick explorer links
  const platformPresets = [
    { id: 'youtube', name: 'YouTube', icon: <Youtube className="w-5 h-5 text-red-500" />, baseUrl: 'https://www.youtube.com' },
    { id: 'tiktok', name: 'TikTok', icon: <Video className="w-5 h-5 text-cyan-400" />, baseUrl: 'https://www.tiktok.com' },
    { id: 'instagram', name: 'Instagram', icon: <Instagram className="w-5 h-5 text-pink-500" />, baseUrl: 'https://www.instagram.com' },
    { id: 'twitter', name: 'Twitter/X', icon: <Globe className="w-5 h-5 text-sky-400" />, baseUrl: 'https://twitter.com' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Compass className="w-6 h-6 text-orange-500 animate-spin-slow" />
        <h2 className="text-xl font-bold text-white tracking-wide">Online Media Hub & Browser</h2>
      </div>

      {/* Online Search / URL Input Box */}
      <form onSubmit={handleSearchSubmit} className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-xl">
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Search Online or Paste Direct Media Link
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
              placeholder="Paste URL (YouTube, Insta, TikTok) or search term..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 transition font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={!searchUrl.trim()}
            className="px-5 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium text-xs rounded-xl transition shadow-lg shadow-orange-500/20 active:scale-95 flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span>Fetch</span> <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Social Media Platform Quick Selectors */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Select Platform to Explore Online
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {platformPresets.map((platform) => (
            <button
              key={platform.id}
              onClick={() => {
                setSelectedPlatform(platform.id as any);
                handleSelect(platform.baseUrl);
              }}
              className="bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 p-3.5 rounded-2xl flex flex-col items-center justify-center gap-2 transition group active:scale-95 cursor-pointer text-left"
            >
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 group-hover:scale-110 transition">
                {platform.icon}
              </div>
              <span className="text-xs font-semibold text-white">{platform.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Live Helper Info Box */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4 text-center space-y-1">
        <p className="text-xs font-medium text-slate-300">
          Aap kisi bhi platform par click karke wahan ka link utha sakte hain ya upar box mein direct link daal kar foran download queue mein bhej sakte hain.
        </p>
      </div>
    </div>
  );
}
