import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mugame.mobile",
  appName: "MuGame",
  webDir: "out",
  server: {
    androidScheme: "http"
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
      iosDatabaseLocation: "Library/CapacitorDatabase",
      iosIsEncryption: false
    }
  }
};

export default config;
