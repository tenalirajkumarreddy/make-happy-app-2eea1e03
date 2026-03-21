export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';
export const BUILD_TIME = import.meta.env.VITE_BUILD_TIME || new Date().toISOString();
export const GIT_COMMIT = import.meta.env.VITE_GIT_COMMIT || 'unknown';

export function getVersionInfo() {
  return {
    version: APP_VERSION,
    buildTime: BUILD_TIME,
    commit: GIT_COMMIT,
    environment: import.meta.env.MODE,
  };
}
