import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.deathless.downloader',
  appName: 'Deathless Downloader',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    Filesystem: {
      // Configuration for filesystem downloads
    },
  },
};

export default config;
