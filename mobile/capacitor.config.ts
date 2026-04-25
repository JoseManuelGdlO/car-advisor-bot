import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.caradvisor.mobile",
  appName: "Car Advisor",
  webDir: "www",
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  server: {
    androidScheme: "http",
    iosScheme: "caradvisor",
  },
};

export default config;
