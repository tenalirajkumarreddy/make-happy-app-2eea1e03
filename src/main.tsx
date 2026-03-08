import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import App from "./App.tsx";
import "./index.css";

// Initialize Capacitor plugins when running as native app
async function initCapacitor() {
  if (Capacitor.isNativePlatform()) {
    try {
      // Set status bar style
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: "#1a1a2e" });
    } catch (e) {
      console.log("StatusBar plugin not available");
    }

    try {
      // Hide splash screen after app is ready
      await SplashScreen.hide();
    } catch (e) {
      console.log("SplashScreen plugin not available");
    }
  }
}

// Render app first, then initialize native features
createRoot(document.getElementById("root")!).render(<App />);

// Initialize Capacitor after render
initCapacitor();
