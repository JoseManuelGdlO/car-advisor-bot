import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.caradvisor.mobile",
  appName: "Car Advisor",
  webDir: "www",
  bundledWebRuntime: false,
  server: {
    androidScheme: "http",
  },
};

export default config;
