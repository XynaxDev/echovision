/**
 * EchoVision — Global Voice Context
 *
 * Transformed to WebSocket Streaming Architecture:
 * Handles global voice activation, Live Audio PCM streaming, and dual-channel 
 * WebSocket parsing (Text Actions + Binary Audio).
 */
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { triggerHaptic, setHapticsEnabled } from "../utils/haptics";
import { Linking, Platform, Vibration } from "react-native";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import auth from "@react-native-firebase/auth";
import { getPrimaryContact } from "../utils/sos";
import { VolumeManager } from "react-native-volume-manager";
import LiveAudioStream from 'react-native-live-audio-stream';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';

import { useLanguage } from "./LanguageContext";
import { useAppTheme } from "./ThemeContext";
import { API_BASE_URL } from "../services/api";

export interface ContextualCommands {
  onCapture?: () => boolean | void | Promise<boolean> | Promise<void>;
  onFlashlightToggle?: () => void;
  isWaitingForSOS?: boolean;
  onConfirmSOS?: () => void;
  onCancelSOS?: (fromVoice?: boolean) => void;
  onVoiceToggle?: (isActive: boolean) => void;
  activePage?: string;
}

interface VoiceContextValue {
  isVoiceActive: boolean;
  activePage: string;
  toggleVoice: () => void;
  registerContextualCommands: (commands: ContextualCommands) => void;
  clearContextualCommands: (pageName?: string) => void;
  navigateFromVoice: (target: string, params?: any) => void;
  setNavigationDelegate: (delegate: (target: string, params?: any) => void) => void;
  pushToAudioQueue: (fileUri: string) => void;
  interruptAudioQueue: () => void;
  contextualCommandsRef: React.MutableRefObject<ContextualCommands>;
}
const VoiceContext = createContext<VoiceContextValue | undefined>(undefined);
export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { language, setLanguage } = useLanguage();
  const { setThemeMode } = useAppTheme();
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [activePage, setActivePage] = useState<string>("Home");
  const voiceActiveRef = useRef(false);
  const isSpeechActiveRef = useRef(false);
  
  const contextualCommandsRef = useRef<ContextualCommands>({});
  const navigateDelegateRef = useRef<(target: string, params?: any) => void>(() => {});
  const lastVolumeTapRef = useRef<number>(0);
  const prevVolumeRef = useRef<number>(-1);
  const toggleVoiceRef = useRef<() => void>(() => {});
  // WebSocket & Streaming Audio State
  const audioQueue = useRef<string[]>([]);
  const isPlaying = useRef(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const shieldTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const micBufferRef = useRef<Buffer[]>([]);
  const isProcessingQueueRef = useRef(false);

  useEffect(() => {
    // 1. Initialize Live Audio Stream
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      playThroughEarpieceAndroid: false,
    }).catch(console.warn);
    try {
      LiveAudioStream.init({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 7, // VOICE_COMMUNICATION (Hardware Echo Cancellation & Noise Suppression)
        bufferSize: 4096,
        wavFile: "", // Use empty string instead of relative path to avoid native IO crashes
      });
      LiveAudioStream.on('data', (data: string) => {
          const chunk = Buffer.from(data, 'base64');
          if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(chunk);
          } else if (wsRef.current?.readyState === WebSocket.CONNECTING) {
              micBufferRef.current.push(chunk);
          }
      });
      console.log('✅ VoiceContext: Audio stream initialized');
    } catch (e) {
      console.warn('⚠️ VoiceContext: LiveAudioStream init failed — voice assistant will not work:', e);
    }
    // 2. Hardware Volume Listener
    const volumeListener = VolumeManager.addVolumeListener((result) => {
      const currentVolume = typeof result === "number" ? result : result.volume;
      if (currentVolume < prevVolumeRef.current || currentVolume === 0) {
         // Volume down
      } else {
         prevVolumeRef.current = currentVolume;
         lastVolumeTapRef.current = 0;
         return; 
      }
      prevVolumeRef.current = currentVolume;
      const now = Date.now();
      if (now - lastVolumeTapRef.current < 600) { 
        // Use legacy Vibration API because Android 13+ blocks expo-haptics outside of direct screen touch events
        Vibration.vibrate(100);
        toggleVoiceRef.current();
        lastVolumeTapRef.current = 0; 
      } else {
        lastVolumeTapRef.current = now;
      }
    });

    VolumeManager.getVolume().then((res) => {
      prevVolumeRef.current = typeof res === "number" ? res : res.volume;
    }).catch(() => {});

    return () => {
      volumeListener.remove();
      LiveAudioStream.stop();
      if (wsRef.current) wsRef.current.close();
      if (soundRef.current) soundRef.current.unloadAsync().catch(() => {});
    };
  }, []);

  const registerContextualCommands = useCallback((commands: ContextualCommands) => {
    contextualCommandsRef.current = { ...contextualCommandsRef.current, ...commands };
    if (commands.activePage) {
       setActivePage(commands.activePage);
    }
  }, []);
  const clearContextualCommands = useCallback((pageName?: string) => {
    if (pageName && contextualCommandsRef.current.activePage !== pageName) {
        return; // Prevent race conditions where the old screen unmounts AFTER the new screen mounts and wipes its commands
    }
    contextualCommandsRef.current = {};
    setActivePage("Home");
  }, []);

  // Sync activePage with backend in real-time
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: "update_context", active_page: activePage }));
      } catch (err) {
        console.warn("Failed to sync context", err);
      }
    }
  }, [activePage]);

  const setNavigationDelegate = (delegate: (target: string, params?: any) => void) => {
    navigateDelegateRef.current = delegate;
  };
  // Helper to play local TTS while temporarily dropping mic data so the AI doesn't hear itself
  const playLocalAnnouncement = (text: string, lang: string, onFinish?: () => void) => {
      isPlaying.current = true;
      Speech.speak(text, {
          language: lang,
          pitch: 1.0,
          rate: 1.1,
          onDone: () => {
              isPlaying.current = false;
              processAudioQueue();
              if (onFinish) onFinish();
          },
          onStopped: () => {
              isPlaying.current = false;
              processAudioQueue();
              if (onFinish) onFinish();
          },
          onError: () => {
              isPlaying.current = false;
              processAudioQueue();
              if (onFinish) onFinish();
          }
      });
  };

  // ── Frame Interception Action Router ──
  const handleNativeAction = async (command: string) => {
    console.log("⚡ NATIVE ACTION TRIGGER:", command);
    const upperCommand = command.toUpperCase();
    const ctx = contextualCommandsRef.current;
    if (upperCommand.includes("DARK_MODE")) setThemeMode("dark");
    else if (upperCommand.includes("LIGHT_MODE")) setThemeMode("light");
    else if (upperCommand.includes("HAPTICS_OFF")) setHapticsEnabled(false);
    else if (upperCommand.includes("HAPTICS_ON")) setHapticsEnabled(true);
    else if (upperCommand.includes("TALKBACK_OFF")) AsyncStorage.setItem("@setting_talkback", "false");
    else if (upperCommand.includes("TALKBACK_ON")) AsyncStorage.setItem("@setting_talkback", "true");
    
    else if (upperCommand.includes("CHANGE_LANGUAGE")) {
      const newLang = upperCommand.includes("ENGLISH") ? "english" : upperCommand.includes("HINGLISH") ? "hinglish" : "hindi";
      await setLanguage(newLang);
      
      // Quietly restart websocket to pass new language to backend
      // Delay to let the AI finish saying "Changing language" before the socket cuts
      setTimeout(() => {
          if (voiceActiveRef.current) {
              restartStreamingSession();
          }
      }, 3500);
    }
    else if (upperCommand.includes("UPDATE_LOCATION")) {
      // Re-fetch the current location via location hook/function if we had one here
      // But since VoiceContext doesn't have the Location logic, we can route it to Settings 
      // or just call the utility if we extract it. For now, we will navigate to Settings so they can see it update.
      navigateDelegateRef.current("Settings");
    }
    else if (upperCommand.includes("MAP_TARGET")) {
      Linking.openURL(Platform.OS === 'ios' ? 'http://maps.apple.com/' : 'google.navigation:q=');
      if (voiceActiveRef.current) toggleVoiceRef.current(); // Turn off voice when leaving app
    }
    else if (upperCommand.includes("GO_BACK")) navigateDelegateRef.current("GO_BACK");
    // Local contextual commands
    else if (upperCommand.includes("FLASHLIGHT")) {
        const pollFlashlight = async (retries = 0) => {
           if (contextualCommandsRef.current.onFlashlightToggle) {
               contextualCommandsRef.current.onFlashlightToggle();
               return;
           }
           if (retries > 100) return; // Timeout after 10 seconds
           setTimeout(() => pollFlashlight(retries + 1), 100);
        };
        pollFlashlight();
    }
    else if (upperCommand.includes("TURN_OFF_ASSISTANT")) {
        if (voiceActiveRef.current) {
            toggleVoiceRef.current();
        }
     }else if (upperCommand.includes("CAPTURE")) {
       const attemptCapture = async () => {
         const captureFn = contextualCommandsRef.current.onCapture;
         if (!captureFn) return false;
         try {
           const result = await captureFn();
           return result === true;
         } catch {
           return false;
         }
       };
       
       const pollCapture = async (retries = 0) => {
         if (await attemptCapture()) {
            return;
         }
         if (retries > 100) return; // Timeout after 10 seconds (100 * 100ms)
         setTimeout(() => pollCapture(retries + 1), 100);
       };
       
       pollCapture();
    }
    else if (upperCommand.includes("SCENE_SCANNER")) {
       contextualCommandsRef.current = {}; // Prevent old screen from stealing actions
       navigateDelegateRef.current("SceneScanner");
    }
    else if (upperCommand.includes("TEXT_READER")) {
       contextualCommandsRef.current = {}; // Prevent old screen from stealing actions
       navigateDelegateRef.current("TextReader");
    }
     else if (upperCommand.includes("SOS") && !upperCommand.includes("CANCEL_SOS") && !upperCommand.includes("CONFIRM_SOS")) {
        // Voice Confirmation Flow
        navigateDelegateRef.current("SOSConfirmation", { source: "voice" });
        
        contextualCommandsRef.current = {
            isWaitingForSOS: true,
            onConfirmSOS: async () => {
                // Clear expectation
                contextualCommandsRef.current = {};
                
                // Get contact name
                const { getPrimaryContact, executeSOS } = require("../utils/sos");
                const contact = await getPrimaryContact();
                
                // Play confirmation immediately via frontend TTS
                playLocalAnnouncement(
                    language === "hindi" || language === "hinglish" 
                        ? `मैंने SOS चालू कर दिया है। ${contact.name} को कॉल किया जा रहा है। कृपया मदद की प्रतीक्षा करें।` 
                        : `I have triggered the SOS. Calling ${contact.name}. Please wait for help.`,
                    language === "hindi" || language === "hinglish" ? "hi-IN" : "en-US",
                    () => {
                        executeSOS();
                    }
                );
            },
            onCancelSOS: (fromVoice) => {
                contextualCommandsRef.current = {};
                setActivePage("Home");
                navigateDelegateRef.current("GO_BACK");
                if (!fromVoice) {
                    playLocalAnnouncement(
                        language === "hindi" || language === "hinglish" ? "SOS रद्द कर दिया गया है।" : "SOS Cancelled.",
                        language === "hindi" || language === "hinglish" ? "hi-IN" : "en-US"
                    );
                }
            }
        };
     }
     else if (upperCommand.includes("CONFIRM_SOS")) {
        if (contextualCommandsRef.current.onConfirmSOS) {
            contextualCommandsRef.current.onConfirmSOS();
        }
     }
     else if (upperCommand.includes("CANCEL_SOS")) {
        if (contextualCommandsRef.current.onCancelSOS) {
            contextualCommandsRef.current.onCancelSOS(true);
        } else {
            contextualCommandsRef.current = {};
            playLocalAnnouncement(
                language === "hindi" || language === "hinglish" ? "SOS रद्द कर दिया गया है।" : "SOS Cancelled.",
                language === "hindi" || language === "hinglish" ? "hi-IN" : "en-US"
            );
        }
     }
     else if (upperCommand.includes("SETTINGS")) {
        contextualCommandsRef.current = {};
        navigateDelegateRef.current("Settings");
    }
    else if (upperCommand === "INTERRUPT_TTS") {
        console.log("⚡ VAD: Interrupting current TTS");
        if (shieldTimeoutRef.current) clearTimeout(shieldTimeoutRef.current);
        audioQueue.current = [];
        if (soundRef.current && isPlaying.current) {
            soundRef.current.stopAsync().catch(() => {});
        }
        isPlaying.current = false;
        isProcessingQueueRef.current = false;
    }
  };
  // ── Serialized Audio Queue Playback ──
  const processAudioQueue = async (isRecursive = false) => {
    if (isSpeechActiveRef.current) return;
    
    // Strict mutex lock to prevent concurrent chunk processing
    if (isProcessingQueueRef.current && !isRecursive) return;

    if (audioQueue.current.length === 0) {
        if (isRecursive) {
             shieldTimeoutRef.current = setTimeout(() => {
                 isPlaying.current = false;
                 isProcessingQueueRef.current = false;
                 
                 // Double check if any chunks arrived while the timeout was ticking!
                 if (audioQueue.current.length > 0) {
                     processAudioQueue(true);
                 }
             }, 500);
        } else {
             isProcessingQueueRef.current = false;
        }
        return;
    }
    
    isProcessingQueueRef.current = true;
    isPlaying.current = true;
    if (shieldTimeoutRef.current) clearTimeout(shieldTimeoutRef.current);

    const nextFileUri = audioQueue.current.shift();
    
    try {
        const { sound } = await Audio.Sound.createAsync({ uri: nextFileUri! });
        soundRef.current = sound;
        
        sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
                sound.setOnPlaybackStatusUpdate(null); // Detach listener
                sound.unloadAsync().then(() => {
                    soundRef.current = null;
                    processAudioQueue(true);
                }).catch(() => {
                    soundRef.current = null;
                    processAudioQueue(true);
                });
            } else if (!status.isLoaded && status.error) {
                console.warn('Playback sequence error inside status update', status.error);
                sound.setOnPlaybackStatusUpdate(null);
                soundRef.current = null;
                processAudioQueue(true);
            }
        });

        await sound.playAsync();
    } catch (error) {
        console.error('Audio playback sequence error', error);
        soundRef.current = null;
        processAudioQueue(true);
    }
  };

  // ── Start WebSocket Session ──
  const startStreamingSession = async () => {
    const currentLocation = await AsyncStorage.getItem("@echovision_current_location") || "";
    let currentLat = await AsyncStorage.getItem("@echovision_current_lat") || "";
    let currentLon = await AsyncStorage.getItem("@echovision_current_lon") || "";
    
    // Fallback if user never explicitly clicked 'Update Location' in settings
    if (!currentLat || !currentLon) {
        try {
            const loc = await Location.getLastKnownPositionAsync();
            if (loc) {
                currentLat = loc.coords.latitude.toString();
                currentLon = loc.coords.longitude.toString();
            }
        } catch (e) {
            console.warn("Failed to get fallback location", e);
        }
    }
    const homeAddress = await AsyncStorage.getItem("@echovision_home_address") || "";
    const userName = auth().currentUser?.displayName || "User";
    const primaryContact = await getPrimaryContact();
    const locParams = `&current_location=${encodeURIComponent(currentLocation)}&current_lat=${currentLat}&current_lon=${currentLon}&home_location=${encodeURIComponent(homeAddress)}&active_page=${encodeURIComponent(activePage)}&user_name=${encodeURIComponent(userName)}&emergency_contact=${encodeURIComponent(primaryContact.name)}`;
    triggerHaptic("medium");
    // Dynamically resolve WebSocket URL from central API Config
    const WS_URL = API_BASE_URL.replace("http://", "ws://").replace("https://", "wss://") + `/api/v1/voice/stream?language=${language}${locParams}`;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ VOICE: WebSocket connected');
      if (micBufferRef.current.length > 0) {
          console.log(`Flushing ${micBufferRef.current.length} buffered mic chunks...`);
          micBufferRef.current.forEach((chunk) => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(chunk);
              }
          });
          micBufferRef.current = [];
      }
    };

    ws.onmessage = async (e) => {
      if (typeof e.data === 'string') {
          try {
              const payload = JSON.parse(e.data);
              if (payload.type === 'action') {
                  handleNativeAction(payload.command);
              } else if (payload.type === 'audio') {
                  const fileUri = FileSystem.cacheDirectory + `sarvam_audio_${Date.now()}_${Math.random()}.wav`;
                  await FileSystem.writeAsStringAsync(fileUri, payload.data, {
                      encoding: "base64",
                  });
                  audioQueue.current.push(fileUri);
                  processAudioQueue();
              }
          } catch (err) {
              console.error('Failed to parse text frame', err);
          }
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      LiveAudioStream.stop();
      audioQueue.current = [];
      if (soundRef.current) soundRef.current.unloadAsync().catch(() => {});
      isPlaying.current = false;
      isProcessingQueueRef.current = false;

      // If the websocket closes unexpectedly (not triggered by user toggling off),
      // we must update the UI state so it doesn't get stuck in a "zombie" active state.
      if (voiceActiveRef.current) {
         console.log('Voice Assistant disconnected unexpectedly. Updating UI state.');
         voiceActiveRef.current = false;
         setIsVoiceActive(false);
         if (contextualCommandsRef.current.onVoiceToggle) {
           contextualCommandsRef.current.onVoiceToggle(false);
         }
      }
    };
  };

  const toggleVoice = () => {
    if (voiceActiveRef.current) {
      voiceActiveRef.current = false;
      setIsVoiceActive(false);
      LiveAudioStream.stop();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      micBufferRef.current = [];
      audioQueue.current = [];
      if (soundRef.current) soundRef.current.unloadAsync().catch(() => {});
      isPlaying.current = false;
      isProcessingQueueRef.current = false;
      if (contextualCommandsRef.current.onVoiceToggle) {
        contextualCommandsRef.current.onVoiceToggle(false);
      } else {
        Speech.speak(language === "hindi" ? "वॉइस असिस्टेंट बंद" : "Voice Assistant Off", {
          language: language === "hindi" ? "hi-IN" : "en-US",
          pitch: 1.0, rate: 1.0
        });
      }
      
      triggerHaptic("success");
    } else {
      voiceActiveRef.current = true;
      setIsVoiceActive(true);
      micBufferRef.current = [];
      // Start microphone IMMEDIATELY so no words are dropped while websocket connects
      try { LiveAudioStream.start(); } catch (e) { console.warn('⚠️ LiveAudioStream.start() failed:', e); }
      triggerHaptic("heavy");
      
      if (contextualCommandsRef.current.onVoiceToggle) {
        contextualCommandsRef.current.onVoiceToggle(true);
      }
      
      isSpeechActiveRef.current = true;
      Speech.speak(language === "hindi" ? "असिस्टेंट चालू है" : "Assistant is on", {
        language: language === "hindi" ? "hi-IN" : "en-US",
        pitch: 1.0,
        rate: 1.1,
        onDone: () => {
            isSpeechActiveRef.current = false;
            processAudioQueue();
            // Only start the WebSocket AFTER the announcement finishes.
            // This prevents the speaker's "Assistant is on" from echoing
            // into the mic and confusing Deepgram's VAD for 60+ seconds.
            startStreamingSession();
        },
        onStopped: () => {
            isSpeechActiveRef.current = false;
            processAudioQueue();
            startStreamingSession();
        },
        onError: () => {
            isSpeechActiveRef.current = false;
            processAudioQueue();
            startStreamingSession();
        }
      });
      triggerHaptic("warning");
    }
  };

  const interruptAudioQueue = useCallback(() => {
    if (shieldTimeoutRef.current) clearTimeout(shieldTimeoutRef.current);
    audioQueue.current = [];
    if (soundRef.current && isPlaying.current) {
        soundRef.current.stopAsync().catch(() => {});
    }
    isPlaying.current = false;
  }, []);

  const pushToAudioQueue = useCallback((fileUri: string) => {
    audioQueue.current.push(fileUri);
    processAudioQueue();
  }, []);

  const restartStreamingSession = () => {
    console.log("♻️ Seamlessly restarting websocket stream...");
    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent UI state from thinking it crashed
      wsRef.current.close();
      wsRef.current = null;
    }
    setTimeout(() => {
        if (voiceActiveRef.current) {
            startStreamingSession();
        }
    }, 500);
  };

  toggleVoiceRef.current = toggleVoice;

  return (
    <VoiceContext.Provider value={{
      isVoiceActive,
      activePage,
      toggleVoice,
      registerContextualCommands,
      clearContextualCommands,
      navigateFromVoice: (target, params) => navigateDelegateRef.current(target, params),
      setNavigationDelegate,
      pushToAudioQueue,
      interruptAudioQueue,
      contextualCommandsRef
    }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoiceContext() {
  const context = useContext(VoiceContext);
  if (context === undefined) {
    throw new Error("useVoiceContext must be used within a VoiceProvider");
  }
  return context;
}
