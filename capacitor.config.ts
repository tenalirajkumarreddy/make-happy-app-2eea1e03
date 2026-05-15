import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aquaprime.app',
  appName: 'Aqua Prime',
  webDir: 'dist',
  server: {
    cleartext: false
  },
  android: {
    allowMixedContent: false
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
    },
    ShareTarget: {},
    LocalNotifications: {
      smallIcon: 'ic_launcher',
      iconColor: '#2196F3',
    },
    PushNotifications: {
      smallIcon: 'ic_launcher',
      iconColor: '#2196F3',
    }
  }
};

export default config;
