import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

export function useHardwareBackButton(onBack: () => void) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => Promise<void> } | null = null;

    const register = async () => {
      listenerHandle = await CapacitorApp.addListener("backButton", () => {
        // 1. Check for any open Radix UI dialogs/sheets/dropdowns
        const openOverlays = document.querySelectorAll('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]');
        
        if (openOverlays.length > 0) {
          // Dispatch Escape to let standard UI components close themselves
          const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
          document.dispatchEvent(escapeEvent);
          return;
        }

        // 2. Otherwise execute custom navigation fallback
        onBackRef.current();
      });
    };

    register();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, []);
}
