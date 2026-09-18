import { Capacitor } from '@capacitor/core';

// Default backend URL (if hosted remotely)
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

// Track backend reachability in-memory so we don't hang requests
let backendReachable: boolean | null = null;
let lastCheckTime = 0;

export async function checkBackendHealth(customUrl?: string): Promise<boolean> {
  const target = customUrl !== undefined ? customUrl : getBackendBaseUrl();
  const endpoint = target ? `${target.replace(/\/+$/, '')}/api/health` : '/api/health';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const ok = res.ok;
    backendReachable = ok;
    lastCheckTime = Date.now();
    return ok;
  } catch {
    backendReachable = false;
    lastCheckTime = Date.now();
    return false;
  }
}

export function isBackendCachedReachable(): boolean | null {
  if (Date.now() - lastCheckTime > 30000) {
    return null; // Stale cache
  }
  return backendReachable;
}

export function getBackendBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  // 1. Check if user configured a custom backend in localStorage
  const custom = localStorage.getItem('deathless_backend_url');
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }

  // 2. In native Capacitor mobile APK or local WebView:
  // If the default remote backend is not confirmed, return custom or empty
  if (isMobileNative()) {
    return custom ? custom.trim().replace(/\/+$/, '') : '';
  }

  // 3. Web browser running directly on the cloud server (same-origin relative)
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
  backendReachable = null;
  lastCheckTime = 0;
}

export function getApiUrl(endpoint: string): string {
  const base = getBackendBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!base) {
    return cleanEndpoint;
  }
  return `${base}${cleanEndpoint}`;
}

