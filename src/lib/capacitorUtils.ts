import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Geolocation, WatchPositionCallback } from "@capacitor/geolocation";
import { logError } from "@/lib/logger";

/**
 * Check if running as native app
 */
export const isNativeApp = () => Capacitor.isNativePlatform();

/**
 * Check if running on Android
 */
export const isAndroid = () => Capacitor.getPlatform() === "android";

/**
 * Check if running on iOS
 */
export const isIOS = () => Capacitor.getPlatform() === "ios";

/**
 * Take a photo using native camera (falls back to web if not native)
 */
export async function takePhoto(): Promise<string | null> {
  try {
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
 * Get current position using native geolocation
 */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
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
export async function watchPosition(callback: WatchPositionCallback): Promise<string> {
  try {
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
    const status = await Camera.requestPermissions();
    return status.camera === "granted";
  } catch (error) {
    logError("Camera permission error", error);
    return false;
  }
}
