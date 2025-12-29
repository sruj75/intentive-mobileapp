import { ExpoConfig, ConfigContext } from 'expo/config';

const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: "Intentive",
  slug: "intentive",
  scheme: "intentive",
  owner: "srujxx",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "life.intentive.ios",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: ['intentive']
        },
        ...(googleIosUrlScheme ? [{
          CFBundleURLSchemes: [googleIosUrlScheme]
        }] : [])
      ]
    }
  },
  android: {
    package: "life.intentive.android",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff"
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false
  },
  web: {
    favicon: "./assets/favicon.png"
  },
  plugins: [
    "expo-web-browser"
  ],
  extra: {
    eas: {
      projectId: "37a66266-6230-4ba4-82d3-b4af85abe490"
    }
  }
});