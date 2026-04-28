import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.intelekia.jm.autobot",
  appName: "Car Advisor",
  webDir: "www",
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      overlaysWebView: false,
    },
  },
  server: {
    androidScheme: "http",
    iosScheme: "caradvisor",
  },
};

export default config;
