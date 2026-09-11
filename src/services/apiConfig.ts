import { Capacitor } from '@capacitor/core';

// Cloud Run deployed production URL for Deathless Downloader
export const DEFAULT_BACKEND_URL = 'https://ais-pre-q3kekyu25s5zsyrhcf4d3m-904497767506.asia-east1.run.app';

export function isMobileNative(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    Capacitor.isNativePlatform() ||
    window.location.hostname === 'localhost' ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'file:'
  );
}

export function getBackendBaseUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_BACKEND_URL;

  // 1. Check if user configured a custom backend in localStorage
  const custom = localStorage.getItem('deathless_backend_url');
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }

  // 2. In native Capacitor mobile APK or local WebView
  if (isMobileNative()) {
    return DEFAULT_BACKEND_URL;
  }

  // 3. Web browser running directly on the cloud server (same-origin)
  return '';
}

export function setBackendBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const clean = url.trim().replace(/\/+$/, '');
  if (!clean || clean === DEFAULT_BACKEND_URL) {
    localStorage.removeItem('deathless_backend_url');
  } else {
    localStorage.setItem('deathless_backend_url', clean);
  }
}

export function getApiUrl(endpoint: string): string {
  const base = getBackendBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!base) {
    return cleanEndpoint;
  }
  return `${base}${cleanEndpoint}`;
}
