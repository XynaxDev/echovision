/**
 * EchoVision — Centralized API Client
 *
 * All backend communication is routed through this module.
 * Replace API_BASE_URL with your deployed backend URL in production.
 */

import { readAsStringAsync, writeAsStringAsync, EncodingType, cacheDirectory } from "expo-file-system/legacy";
import { Audio } from "expo-av";
import auth from "@react-native-firebase/auth";
import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dynamically resolves the backend API URL.
 * - In development, it extracts the Expo packager's IP address and uses port 8000.
 * - In production, it uses the production URL.
 */
const getApiBaseUrl = () => {
  let resolvedUrl = "https://api.echovision.app";
  
  if (__DEV__) {
    // We strictly use the IP address from the Expo Metro bundler.
    // If the phone can reach the Metro bundler on this IP, it can reach the backend.
    const hostUri = Constants.expoConfig?.hostUri;
    
    if (hostUri) {
      const ip = hostUri.split(":")[0];
      if (ip === "localhost" || ip === "127.0.0.1") {
        resolvedUrl = Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
      } else {
        resolvedUrl = `http://${ip}:8000`;
      }
    } else {
      // Ultimate fallback
      resolvedUrl = Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
    }
  }
  
  console.log("🛠️ API CONFIG:", { 
    hostUri: Constants.expoConfig?.hostUri, 
    resolvedUrl 
  });
  
  return resolvedUrl;
};

export const API_BASE_URL = getApiBaseUrl();
export const VISION_WS_URL = API_BASE_URL.replace("http://", "ws://").replace("https://", "wss://") + "/api/v1/vision/stream";

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/json",
};

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface IntentResponse {
  target: "Scanner" | "TextReader" | "SOS" | "Dashboard" | "Settings" | "None";
  action?: string;
  destination?: string;
  replyText?: string;
  requiresResponse?: boolean;
}

export interface STTResponse {
  transcript: string;
  language_code: string;
}

export interface ScanResponse {
  description: string;
}

export interface ApiError {
  detail: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Auth API
// ═══════════════════════════════════════════════════════════════════════════

export async function verifyPhoneAuth(name: string, phoneNumber: string): Promise<{ uid: string; message: string }> {
  return apiRequest<{ uid: string; message: string }>("/api/v1/auth/phone/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, phone_number: phoneNumber }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Generic Request Helper
// ═══════════════════════════════════════════════════════════════════════════

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const token = await auth().currentUser?.getIdToken();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch (error) {
    console.warn("Failed to get Firebase token:", error);
  }
  return {};
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const authHeaders = await getAuthHeaders();
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...authHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const textBody = await response.text();
      try {
        const errorBody = JSON.parse(textBody) as ApiError;
        errorDetail = errorBody.detail || textBody;
      } catch {
        errorDetail = textBody || response.statusText;
      }
    } catch {
      errorDetail = response.statusText;
    }
    console.error(`[API ERROR - ${endpoint}]`, errorDetail);
    throw new Error(`API Error: ${errorDetail}`);
  }

  return response.json() as Promise<T>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Voice API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify a Hinglish voice command into a navigation target.
 *
 * @param language - The selected user language.
 * @param username - The user's name for personalized greetings.
 * @param is_first_message - Whether this is the first message in the sequence.
 * @returns The classified intent target (Scanner, TextReader, SOS, Dashboard).
 */
export async function classifyIntent(
  text: string, 
  language: string,
  username: string | null = null,
  is_first_message: boolean = false,
  home_location: string | null = null,
  current_location: string | null = null
): Promise<IntentResponse> {
  return apiRequest<IntentResponse>("/api/v1/voice/intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language, username, is_first_message, home_location, current_location }),
  });
}

/**
 * Send raw audio data to Sarvam AI for speech-to-text transcription.
 *
 * @param audioUri - Local file URI of the recorded audio (from expo-av).
 * @param language - The selected user language.
 * @returns The transcription result with transcript and language code.
 */
export async function speechToText(audioUri: string, language: string): Promise<STTResponse> {
  // Read the audio file as base64 and convert to binary for upload
  const base64Audio = await readAsStringAsync(audioUri, {
    encoding: EncodingType.Base64,
  });

  // Convert base64 to binary ArrayBuffer
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const authHeaders = await getAuthHeaders();
  const url = `${API_BASE_URL}/api/v1/voice/stt?language=${language}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "audio/m4a",
      Accept: "application/json",
      ...authHeaders,
    },
    body: bytes.buffer,
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const textBody = await response.text();
      try {
        const errorBody = JSON.parse(textBody) as ApiError;
        errorDetail = errorBody.detail || textBody;
      } catch {
        errorDetail = textBody || response.statusText;
      }
    } catch {
      errorDetail = response.statusText;
    }
    console.error(`[STT ERROR]`, errorDetail);
    throw new Error(`Speech-to-Text Failed: ${errorDetail}`);
  }

  return response.json() as Promise<STTResponse>;
}

/**
 * Convert text to speech audio via Sarvam AI TTS.
 *
 * @param text - The text to synthesize into speech.
 * @param languageCode - BCP-47 language code (e.g. "hi-IN", "en-IN"). Defaults to "hi-IN".
 * @returns The local file URI of the downloaded audio file.
 */
export async function textToSpeech(text: string, languageCode: string = "hi-IN"): Promise<string> {
  const url = `${API_BASE_URL}/api/v1/voice/tts`;

  const authHeaders = await getAuthHeaders();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/wav",
      ...authHeaders,
    },
    body: JSON.stringify({ text, language_code: languageCode }),
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const textBody = await response.text();
      try {
        const errorBody = JSON.parse(textBody) as ApiError;
        errorDetail = errorBody.detail || textBody;
      } catch {
        errorDetail = textBody || response.statusText;
      }
    } catch {
      errorDetail = response.statusText;
    }
    console.error(`[TTS ERROR]`, errorDetail);
    throw new Error(`Text-to-Speech Failed: ${errorDetail}`);
  }

  // Save audio response to a temporary file for playback
  const audioBlob = await response.blob();
  const reader = new FileReader();

  return new Promise<string>((resolve, reject) => {
    reader.onloadend = async () => {
      try {
        const base64Data = (reader.result as string).split(",")[1];
        const fileUri = `${cacheDirectory}echovision_tts_${Date.now()}.wav`;

        await writeAsStringAsync(fileUri, base64Data, {
          encoding: EncodingType.Base64,
        });

        resolve(fileUri);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read TTS audio blob"));
    reader.readAsDataURL(audioBlob);
  });
}

/**
 * Download and play text-to-speech audio via Sarvam AI.
 * Plays the audio seamlessly using expo-av and resolves when finished.
 *
 * @param text - The text to synthesize and play.
 * @returns A promise that resolves when the audio playback is fully complete.
 */
export async function playSarvamTTS(text: string, language: string = "hindi"): Promise<void> {
  // 1. Download the audio file
  const langCode = language === "hindi" ? "hi-IN" : "en-IN";
  const fileUri = await textToSpeech(text, langCode);

  // 2. Play the audio
  return new Promise(async (resolve, reject) => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: true }
      );

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(console.warn);
          resolve();
        }
      });
    } catch (error) {
      console.error("Failed to play TTS audio:", error);
      reject(error);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Vision API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send a base64-encoded image to Gemini for scene description.
 *
 * @param base64Image - Raw base64 string of the image (no data URI prefix).
 * @param language - The selected user language (e.g. "hindi", "hinglish").
 * @returns The scene description.
 */
export async function scanScene(base64Image: string, language: string): Promise<ScanResponse> {
  return apiRequest<ScanResponse>("/api/v1/vision/scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_base64: base64Image,
      mime_type: "image/jpeg",
      language: language,
    }),
  });
}

/**
 * Format raw OCR text and detect its language using NVIDIA Llama.
 *
 * @param rawText - The unformatted raw text from ML Kit OCR.
 * @returns An object containing the cleaned_text and language_code.
 */
export async function formatOcrText(rawText: string): Promise<{ cleaned_text: string; language_code: string }> {
  return apiRequest<{ cleaned_text: string; language_code: string }>("/api/v1/vision/format-ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw_text: rawText,
    }),
  });
}
