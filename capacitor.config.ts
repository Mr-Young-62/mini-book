export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    androidScheme?: string;
    cleartext?: boolean;
    url?: string;
  };
  plugins?: Record<string, any>;
}

const config: CapacitorConfig = {
  appId: 'org.readowl.library',
  appName: 'Readowl',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    Camera: {
      presentationStyle: 'fullscreen',
    },
    BarcodeScanner: {
      targetedFormats: ['EAN_13', 'CODE_128', 'QR_CODE'],
    },
    SplashScreen: {
      launchShowDuration: 1800,
      backgroundColor: '#FAF8F5',
      showSpinner: false,
    },
  },
};

export default config;
