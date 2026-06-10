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
      backgroundColor: 'hsl(222, 25%, 10%)',
      showSpinner: false
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: 'hsl(222, 25%, 10%)'
    },
    ShareTarget: {},
    LocalNotifications: {
      smallIcon: 'ic_launcher',
      iconColor: 'hsl(217, 91%, 50%)',
    },
    PushNotifications: {
      smallIcon: 'ic_launcher',
      iconColor: 'hsl(217, 91%, 50%)',
    }
  }
};

export default config;
