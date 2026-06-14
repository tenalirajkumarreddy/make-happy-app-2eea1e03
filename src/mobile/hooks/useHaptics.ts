import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

type HapticType = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection";

const styleMap: Record<HapticType, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
  success: ImpactStyle.Medium,
  warning: ImpactStyle.Heavy,
  error: ImpactStyle.Heavy,
  selection: ImpactStyle.Light,
};

let isNative = false;

export function useHaptics() {
  useEffect(() => {
    isNative = Capacitor.isNativePlatform();
  }, []);

  const haptic = async (type: HapticType = "light") => {
    if (!isNative) return;
    try {
      await Haptics.impact({ style: styleMap[type] });
    } catch {
      // Haptics not available
    }
  };

  const hapticSuccess = async () => {
    if (!isNative) return;
    try {
      await Haptics.notification({ type: "SUCCESS" });
    } catch {}
  };

  const hapticWarning = async () => {
    if (!isNative) return;
    try {
      await Haptics.notification({ type: "WARNING" });
    } catch {}
  };

  const hapticError = async () => {
    if (!isNative) return;
    try {
      await Haptics.notification({ type: "ERROR" });
    } catch {}
  };

  const hapticSelection = async () => {
    if (!isNative) return;
    try {
      await Haptics.selectionStart();
    } catch {}
  };

  return { haptic, hapticSuccess, hapticWarning, hapticError, hapticSelection };
}

// Convenience hook for common UI interactions
export function useUIHaptics() {
  const { haptic, hapticSuccess, hapticWarning, hapticError, hapticSelection } = useHaptics();

  return {
    onTabChange: () => haptic("selection"),
    onButtonPress: () => haptic("light"),
    onSave: () => hapticSuccess(),
    onDelete: () => hapticError(),
    onScan: () => haptic("medium"),
    onPullRefresh: () => haptic("light"),
    onError: () => hapticError(),
    onWarning: () => hapticWarning(),
  };
}