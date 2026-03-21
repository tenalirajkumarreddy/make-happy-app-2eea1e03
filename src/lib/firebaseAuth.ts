import { initializeApp, getApps, getApp } from "firebase/app";
import {
  ConfirmationResult,
  RecaptchaVerifier,
  getAuth,
  signInWithPhoneNumber,
} from "firebase/auth";
import { env } from "@/lib/env";

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);

let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;

function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("+")) return trimmed;
  return `+${trimmed.replace(/^0+/, "")}`;
}

export async function sendPhoneOtp(phoneNumber: string, recaptchaContainerId: string) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }

  recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, recaptchaContainerId, {
    size: "invisible",
  });

  confirmationResult = await signInWithPhoneNumber(firebaseAuth, normalizedPhone, recaptchaVerifier);
  return normalizedPhone;
}

export async function verifyPhoneOtp(code: string) {
  if (!confirmationResult) {
    throw new Error("OTP session not found. Request a new code.");
  }

  const result = await confirmationResult.confirm(code.trim());
  const idToken = await result.user.getIdToken(true);

  confirmationResult = null;
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }

  return idToken;
}
