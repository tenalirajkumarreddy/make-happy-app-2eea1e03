import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bizmanager.app',
  appName: 'BizManager',
  webDir: 'dist',
  server: {
    cleartext: true
  },
  android: {
    allowMixedContent: true
  },
  ios: {
    contentInset: 'automatic'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1a1a2e',
      showSpinner: false
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1a1a2e'
    }
  }
};

export default config;
