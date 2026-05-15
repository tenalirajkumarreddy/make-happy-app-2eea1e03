import { logError } from "@/lib/logger";
import { Capacitor } from "@capacitor/core";

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  platform?: string;
};

function getWindowCapacitor(): CapacitorBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
}

function getPlatform(): string {
  const platform = Capacitor.getPlatform();
  if (platform && platform !== "web") return platform;

  const winCap = getWindowCapacitor();
  if (typeof winCap?.getPlatform === "function") return winCap.getPlatform();
  return winCap?.platform ?? platform;
}

/**
 * Check if running as native app
 */
export const isNativeApp = (): boolean => {
  try {
    if (Capacitor.isNativePlatform()) return true;

    const winCap = getWindowCapacitor();
    if (typeof winCap?.isNativePlatform === "function") {
      return winCap.isNativePlatform();
    }

    const platform = getPlatform();
    return platform === "android" || platform === "ios";
  } catch {
    return false;
  }
};

/**
 * Check if running on Android
 */
export const isAndroid = (): boolean => {
  try {
    return getPlatform() === "android";
  } catch {
    return false;
  }
};

/**
 * Check if running on iOS
 */
export const isIOS = (): boolean => {
  try {
    return getPlatform() === "ios";
  } catch {
    return false;
  }
};

const NATIVE_OAUTH_CALLBACK = "com.aquaprime.app://auth/callback";

/**
 * Build OAuth redirect URL for current runtime.
 * Native uses app deep link scheme, web uses origin + provided path.
 */
export const getOAuthRedirectUrl = (webPath = "/") =>
  isNativeApp() ? NATIVE_OAUTH_CALLBACK : `${window.location.origin}${webPath}`;

/**
 * Take a photo using native camera (falls back to web if not native)
 */
export async function takePhoto(): Promise<string | null> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
    });
    return image.base64String ? `data:image/jpeg;base64,${image.base64String}` : null;
  } catch (error) {
    logError("Camera error", error);
    return null;
  }
}

/**
 * Pick photo from gallery
 */
export async function pickPhoto(): Promise<string | null> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Photos,
    });
    return image.base64String ? `data:image/jpeg;base64,${image.base64String}` : null;
  } catch (error) {
    logError("Gallery error", error);
    return null;
  }
}

/**
 * Check and request geolocation permission
 * Returns true if permission is granted, false otherwise
 */
export async function checkAndRequestLocationPermission(): Promise<boolean> {
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const status = await Geolocation.checkPermissions();

    if (status.location === 'granted' || status.coarseLocation === 'granted') {
      return true;
    }

    if (status.location === 'denied') {
      return false;
    }

    const requestStatus = await Geolocation.requestPermissions();
    return requestStatus.location === 'granted' || requestStatus.coarseLocation === 'granted';
  } catch (error) {
    logError("Location permission check error", error);
    return false;
  }
}

/**
 * Get current position using native geolocation
 */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch (error) {
    logError("Geolocation error", error);
    return null;
  }
}

/**
 * Watch current position using native geolocation
 */
export async function watchPosition(callback: any): Promise<string> {
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    return await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      callback
    );
  } catch (error) {
    logError("Watch position error", error);
    return "";
  }
}

/**
 * Clear established watch
 */
export async function clearWatch(id: string): Promise<void> {
  if (!id) return;
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    await Geolocation.clearWatch({ id });
  } catch (error) {
    logError("Clear watch error", error);
  }
}

/**
 * Request location permissions
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const status = await Geolocation.requestPermissions();
    return status.location === "granted";
  } catch (error) {
    logError("Permission error", error);
    return false;
  }
}

/**
 * Request camera permissions
 */
export async function requestCameraPermission(): Promise<boolean> {
  try {
    const { Camera } = await import("@capacitor/camera");
    const status = await Camera.requestPermissions();
    return status.camera === "granted";
  } catch (error) {
    logError("Camera permission error", error);
    return false;
  }
}
