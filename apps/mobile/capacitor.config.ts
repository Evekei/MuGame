import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mugame.mobile",
  appName: "MuGame",
  webDir: "out",
  server: {
    androidScheme: "http"
  }
};

export default config;
