/**
 * EchoVision — Global Voice Context
 *
 * Handles global voice activation (via double tap volume), audio recording,
 * zero-latency intent parsing, and contextual commands.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { VolumeManager } from "react-native-volume-manager";
import * as Location from "expo-location";

import { useLanguage } from "./LanguageContext";
import { useAppTheme } from "./ThemeContext";
import { speechToText, playSarvamTTS, classifyIntent, textToSpeech } from "../services/api";

type ContextualCommands = {
  onCapture?: () => void;
  onFlashlightToggle?: () => void;
};

interface VoiceContextValue {
  isVoiceActive: boolean;
  toggleVoice: () => void;
  registerContextualCommands: (commands: ContextualCommands) => void;
  clearContextualCommands: () => void;
  navigateFromVoice: (target: string, params?: any) => void;
  setNavigationDelegate: (delegate: (target: string, params?: any) => void) => void;
}

const VoiceContext = createContext<VoiceContextValue | undefined>(undefined);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const { setThemeMode } = useAppTheme();
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  
  const voiceActiveRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  
  const contextualCommandsRef = useRef<ContextualCommands>({});
  const navigateDelegateRef = useRef<(target: string, params?: any) => void>(() => {});

  const lastVolumeTapRef = useRef<number>(0);
  const prevVolumeRef = useRef<number>(-1);
  const toggleVoiceRef = useRef<() => void>(() => {});

  useEffect(() => {
    // ── Native Volume Button Listener (Double Tap to Wake) ──
    const volumeListener = VolumeManager.addVolumeListener((result) => {
      const currentVolume = typeof result === "number" ? result : result.volume;
      
      // Determine if it's a Volume Down press
      const isVolumeDown = prevVolumeRef.current !== -1 && currentVolume < prevVolumeRef.current;
      
      // Always update previous volume, but don't count if it's max/min bounding issues.
      // Easiest is to just track decrease.
      if (currentVolume < prevVolumeRef.current || currentVolume === 0) {
         // It's a volume down or minimum volume spam.
      } else {
         prevVolumeRef.current = currentVolume;
         lastVolumeTapRef.current = 0;
         return; // Ignore Volume Up
      }
      
      prevVolumeRef.current = currentVolume;

      const now = Date.now();
      if (now - lastVolumeTapRef.current < 600) { // Slightly longer window for volume down
        // Double tap detected!
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        toggleVoiceRef.current();
        lastVolumeTapRef.current = 0; // Reset
      } else {
        lastVolumeTapRef.current = now;
      }
    });

    VolumeManager.getVolume().then((res) => {
      prevVolumeRef.current = typeof res === "number" ? res : res.volume;
    }).catch(() => {});

    return () => {
      volumeListener.remove();
      if (recordingRef.current) recordingRef.current.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const registerContextualCommands = (commands: ContextualCommands) => {
    contextualCommandsRef.current = commands;
  };

  const clearContextualCommands = () => {
    contextualCommandsRef.current = {};
  };

  const setNavigationDelegate = (delegate: (target: string, params?: any) => void) => {
    navigateDelegateRef.current = delegate;
  };

  const parseIntentGlobal = (transcript: string, language: string) => {
    const txt = transcript.toLowerCase();
    
    // ── Contextual Actions (Priority 1) ──
    const ctx = contextualCommandsRef.current;
    if (/(flash|torch|light|roshni)/i.test(txt) && ctx.onFlashlightToggle) {
      return { type: "context", action: "flashlight", replyText: language === "hindi" ? "फ़्लैशलाइट टॉगल की गई" : "Flashlight toggled" };
    }
    // Only capture locally if it's very clearly a capture command
    if (/(capture|photo|kheench|tasveer|picture|scan|take)/i.test(txt) && ctx.onCapture) {
      return { type: "context", action: "capture", replyText: "" };
    }

    // ── Global Actions (Priority 2) ──
    if (/(shut down|turn off|stop|band kar|exit|quit|chup)/i.test(txt)) {
      return { type: "setting", action: "turn_off_assistant", replyText: "" };
    }
    if (/(where am i|kaha hu|location|pata|address)/i.test(txt)) {
      return { type: "tool", action: "location", replyText: language === "hindi" ? "मैं आपकी लोकेशन चेक कर रहा हूँ..." : "Checking your location..." };
    }
    if (/(scene|scanner|kaisa hai|camera|dikhao|surrounding|aas paas)/i.test(txt)) {
      return { type: "nav", target: "SceneScanner", replyText: language === "hindi" ? "दृश्य स्कैनर खोल रहा हूँ" : "Opening Scene Scanner" };
    }
    if (/(text|reader|likha|read|ocr|document|paper)/i.test(txt)) {
      return { type: "nav", target: "TextReader", replyText: language === "hindi" ? "टेक्स्ट रीडर खोल रहा हूँ" : "Opening Text Reader" };
    }
    if (/(sos|emergency|help|bachao|khatra|danger)/i.test(txt)) {
      return { type: "nav", target: "SOS", replyText: language === "hindi" ? "आपातकालीन SOS सक्रिय हो रहा है" : "Activating Emergency SOS" };
    }
    if (/(setting|preference)/i.test(txt)) {
      if (/(haptic|vibration).*(band|off)/i.test(txt)) return { type: "setting", action: "haptics_off", replyText: language === "hindi" ? "हैप्टिक बंद" : "Haptics off" };
      if (/(haptic|vibration).*(on|chalu)/i.test(txt)) return { type: "setting", action: "haptics_on", replyText: language === "hindi" ? "हैप्टिक चालू" : "Haptics on" };
      if (/(english)/i.test(txt)) return { type: "setting", action: "lang_en", replyText: "Language set to English" };
      if (/(hindi)/i.test(txt)) return { type: "setting", action: "lang_hi", replyText: "भाषा को हिंदी में बदल दिया गया है" };
      return { type: "nav", target: "Settings", replyText: language === "hindi" ? "सेटिंग्स खोल रहा हूँ" : "Opening Settings" };
    }
  
    // Fallback to LLM if local matching fails
    return { type: "none", replyText: "" };
  };

  const recordAudio = (): Promise<string | null> => {
    return new Promise(async (resolve) => {
      try {
        await Audio.requestPermissionsAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;

        let silenceStart = 0;
        let hasSpoken = false;

        recording.setOnRecordingStatusUpdate((status) => {
          if (!voiceActiveRef.current) {
            recording.stopAndUnloadAsync().catch(() => {});
            recordingRef.current = null;
            resolve(null);
            return;
          }

          if (status.isRecording && status.metering !== undefined) {
            const db = status.metering;
            const now = Date.now();

            if (db > -35) { 
              hasSpoken = true;
              silenceStart = 0;
            } else if (hasSpoken) { 
              if (silenceStart === 0) silenceStart = now;
              if (now - silenceStart > 800) {
                recording.stopAndUnloadAsync().then(() => {
                  recordingRef.current = null;
                  resolve(recording.getURI());
                }).catch(() => resolve(null));
              }
            } else {
              if (status.durationMillis > 4500) {
                recording.stopAndUnloadAsync().then(() => {
                  recordingRef.current = null;
                  resolve("SILENCE");
                }).catch(() => resolve(null));
              }
            }
          }
        });
        recording.setProgressUpdateInterval(100);
      } catch (err) {
        resolve(null);
      }
    });
  };

  const speakAsync = async (text: string, lang: string): Promise<void> => {
    try {
      const languageCode = lang === "hindi" ? "hi-IN" : "en-IN";
      const chunks = text.match(/[^.!?\n।]+[.!?\n।]*/g) || [text];
      const cleanedChunks = chunks.map(c => c.trim()).filter(c => c.length > 0);

      if (cleanedChunks.length === 0) return;

      let nextChunkPromise = textToSpeech(cleanedChunks[0], languageCode).catch(() => null);

      for (let i = 0; i < cleanedChunks.length; i++) {
        if (!voiceActiveRef.current) break;
        
        const audioUri = await nextChunkPromise;
        
        if (i + 1 < cleanedChunks.length) {
          nextChunkPromise = textToSpeech(cleanedChunks[i+1], languageCode).catch(() => null);
        }

        if (!audioUri) continue;
        if (!voiceActiveRef.current) break;

        const { sound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true });
        
        await new Promise<void>((resolve) => {
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) resolve();
          });
        });
        sound.unloadAsync().catch(() => {});
      }
    } catch (e) {
      console.log("Sarvam TTS failed, fallback to Expo Speech");
      return new Promise((resolve) => {
        Speech.speak(text, {
          language: lang === "hindi" ? "hi-IN" : "en-US",
          onDone: () => resolve(),
          onError: () => resolve(),
          onStopped: () => resolve()
        });
      });
    }
  };

  const runVoiceLoop = async () => {
    setIsVoiceActive(true);
    voiceActiveRef.current = true;
    Speech.stop();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    const txt = language === "english" ? "Assistant activated." : (language === "hinglish" ? "Assistant shuru kar raha hoon." : "असिस्टेंट शुरू कर रहा हूँ।");
    await speakAsync(txt, language);

    while (voiceActiveRef.current) {
      try {
        const uri = await recordAudio();
        if (!voiceActiveRef.current || !uri) break;
        if (uri === "SILENCE") continue;

        let transcript = "";
        try {
          const sttResult = await speechToText(uri, language);
          transcript = sttResult.transcript;
        } catch (err) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }

        if (!transcript.trim()) continue;

        const lower = transcript.toLowerCase();
        if (/(turn off|band karo|stop|ruko|bye|bnd kro|close|exit|quit)/i.test(lower)) {
          const offTxt = language === "hindi" ? "असिस्टेंट को बंद कर रहा हूँ।" : "Assistant turned off.";
          await playSarvamTTS(offTxt, language).catch(() => {});
          break;
        }

        let intent: any = parseIntentGlobal(transcript, language);

        if (intent.type === "none") {
          try {
            let homeLoc = null;
            let currentLoc = null;
            try {
              homeLoc = await AsyncStorage.getItem("@echovision_home_address");
              let { status } = await Location.getForegroundPermissionsAsync();
              if (status === "granted") {
                let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                let addressInfo = await Location.reverseGeocodeAsync(location.coords);
                if (addressInfo && addressInfo.length > 0) {
                  const place = addressInfo[0];
                  currentLoc = [place.street, place.district, place.city, place.region].filter(Boolean).join(", ");
                }
              }
            } catch (e) {}

            const aiIntent = await classifyIntent(transcript, language, null, false, homeLoc, currentLoc);
            if (aiIntent.action === "calculate_distance" && aiIntent.destination) {
              intent = { type: "tool", action: "calculate_distance", destination: aiIntent.destination, replyText: aiIntent.replyText || (language === "hindi" ? "मैं दूरी चेक कर रही हूँ..." : "Checking distance...") };
            } else if (aiIntent.action === "start_navigation" && aiIntent.destination) {
              intent = { type: "tool", action: "start_navigation", destination: aiIntent.destination, replyText: aiIntent.replyText || (language === "hindi" ? "नेविगेशन शुरू कर रही हूँ..." : "Starting navigation...") };
            } else if (aiIntent.action === "toggle_haptics_off") {
              intent = { type: "setting", action: "haptics_off", replyText: aiIntent.replyText };
            } else if (aiIntent.action === "toggle_haptics_on") {
              intent = { type: "setting", action: "haptics_on", replyText: aiIntent.replyText };
            } else if (aiIntent.action === "set_language_english") {
              intent = { type: "setting", action: "lang_en", replyText: aiIntent.replyText };
            } else if (aiIntent.action === "set_language_hindi") {
              intent = { type: "setting", action: "lang_hi", replyText: aiIntent.replyText };
            } else if (aiIntent.action === "toggle_dark_mode") {
              intent = { type: "setting", action: "dark_mode_on", replyText: aiIntent.replyText };
            } else if (aiIntent.action === "toggle_light_mode") {
              intent = { type: "setting", action: "light_mode_on", replyText: aiIntent.replyText };
            } else if (aiIntent.target && aiIntent.target !== "None") {
              intent = { type: "nav", target: aiIntent.target, replyText: aiIntent.replyText };
            } else {
              intent = { type: "none", replyText: aiIntent.replyText };
            }
          } catch (e) {
            console.error("AI Intent Failed:", e);
          }
        }

        if (intent.replyText) {
          await speakAsync(intent.replyText, language);
        }

        if (intent.type === "context") {
          const ctx = contextualCommandsRef.current;
          if (intent.action === "flashlight" && ctx.onFlashlightToggle) ctx.onFlashlightToggle();
          if (intent.action === "capture" && ctx.onCapture) {
            ctx.onCapture();
            break; // Stop loop after capture
          }
        } 
        else if (intent.type === "tool" && intent.action === "location") {
          try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
              const err = language === "hindi" ? "मुझे लोकेशन की अनुमति नहीं है。" : "I do not have location permission.";
              await playSarvamTTS(err, language).catch(() => {});
              continue;
            }
            let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            let addressInfo = await Location.reverseGeocodeAsync(location.coords);
            if (addressInfo && addressInfo.length > 0) {
              const place = addressInfo[0];
              const parts = [place.street, place.district, place.city, place.region].filter(Boolean);
              const addrStr = parts.join(", ");
              const locTxt = language === "hindi" 
                ? `आप अभी ${addrStr} में हैं।` 
                : `You are currently at ${addrStr}.`;
              await playSarvamTTS(locTxt, language).catch(() => {});
            } else {
              throw new Error("No address found");
            }
          } catch (error) {
            const errTxt = language === "hindi" ? "माफ़ करें, मैं आपकी लोकेशन नहीं ढूँढ पा रही हूँ।" : "Sorry, I couldn't find your location.";
            await playSarvamTTS(errTxt, language).catch(() => {});
          }
        }
        else if (intent.type === "tool" && intent.action === "calculate_distance") {
           if (!intent.destination) {
             const askDest = language === "hindi" ? "कृपया मुझे बताएं कि आपको किस जगह की दूरी जाननी है?" : "Please tell me the name of the place to calculate distance.";
             await playSarvamTTS(askDest, language).catch(() => {});
             continue;
           }
          try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") throw new Error("No permission");

            let currentLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const lon1 = currentLoc.coords.longitude;
            const lat1 = currentLoc.coords.latitude;

            let destLat = 0;
            let destLon = 0;
            let destName = intent.destination;

            const isHome = intent.destination.toLowerCase().includes("home") || intent.destination.toLowerCase().includes("ghar");
            if (isHome) {
              const savedCoordsStr = await AsyncStorage.getItem("@echovision_home_coords");
              if (!savedCoordsStr) {
                const noHomeTxt = language === "hindi" ? "माफ़ करें, आपकी होम लोकेशन सेट नहीं है। कृपया सेटिंग्स में जाकर इसे सेट करें।" : "Sorry, your home location is not set. Please set it in Settings.";
                await playSarvamTTS(noHomeTxt, language).catch(() => {});
                continue;
              }
              const savedCoords = JSON.parse(savedCoordsStr);
              destLat = savedCoords.lat;
              destLon = savedCoords.lon;
              destName = language === "hindi" ? "आपका घर" : "your home";
            } else {
              // Geocode using Nominatim
              const query = encodeURIComponent(intent.destination);
              const geoUrl = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&viewbox=${lon1-0.1},${lat1+0.1},${lon1+0.1},${lat1-0.1}`;
              const geoRes = await fetch(geoUrl);
              const geoData = await geoRes.json();
              if (!geoData || geoData.length === 0) throw new Error("Place not found");
              destLat = parseFloat(geoData[0].lat);
              destLon = parseFloat(geoData[0].lon);
            }

            // OSRM Routing
            const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${destLon},${destLat}?overview=false`;
            const osrmRes = await fetch(osrmUrl);
            const osrmData = await osrmRes.json();

            if (osrmData.code === "Ok" && osrmData.routes.length > 0) {
              const distMeters = osrmData.routes[0].distance;
              const durationSecs = osrmData.routes[0].duration;
              const distKm = (distMeters / 1000).toFixed(1);
              const durationMins = Math.ceil(durationSecs / 60);

              const answerTxt = language === "hindi"
                ? `${destName} यहाँ से ${distKm} किलोमीटर दूर है। पहुँचने में लगभग ${durationMins} मिनट लगेंगे।`
                : `${destName} is ${distKm} kilometers away. It will take about ${durationMins} minutes to reach.`;
              await playSarvamTTS(answerTxt, language).catch(() => {});
            } else {
              throw new Error("Route not found");
            }
          } catch (err) {
            const failTxt = language === "hindi" ? "माफ़ करें, मैं दूरी नहीं निकाल पा रही हूँ।" : "Sorry, I couldn't calculate the distance.";
            await playSarvamTTS(failTxt, language).catch(() => {});
          }
        }
        else if (intent.type === "tool" && intent.action === "start_navigation") {
           if (!intent.destination) {
             const askDest = language === "hindi" ? "कृपया मुझे बताएं कि आपको कहाँ जाना है?" : "Please tell me where you want to navigate to.";
             await playSarvamTTS(askDest, language).catch(() => {});
             continue;
           }
            try {
             let { status } = await Location.requestForegroundPermissionsAsync();
             if (status !== "granted") throw new Error("No permission");

             let currentLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
             const lon1 = currentLoc.coords.longitude;
             const lat1 = currentLoc.coords.latitude;

             let destLat = 0;
             let destLon = 0;
             let finalDest = encodeURIComponent(intent.destination);
             let destName = intent.destination;

             const isHome = intent.destination.toLowerCase().includes("home") || intent.destination.toLowerCase().includes("ghar");
             
             if (isHome) {
               const savedCoordsStr = await AsyncStorage.getItem("@echovision_home_coords");
               if (savedCoordsStr) {
                 const coords = JSON.parse(savedCoordsStr);
                 destLat = coords.lat;
                 destLon = coords.lon;
                 finalDest = `${coords.lat},${coords.lon}`;
                 destName = language === "hindi" ? "आपका घर" : "your home";
               } else {
                 throw new Error("Home not set");
               }
             } else {
               // Geocode using Nominatim
               const geoUrl = `https://nominatim.openstreetmap.org/search?q=${finalDest}&format=json&limit=1&viewbox=${lon1-0.1},${lat1+0.1},${lon1+0.1},${lat1-0.1}`;
               const geoRes = await fetch(geoUrl);
               const geoData = await geoRes.json();
               if (geoData && geoData.length > 0) {
                 destLat = parseFloat(geoData[0].lat);
                 destLon = parseFloat(geoData[0].lon);
               }
             }

             if (destLat !== 0 && destLon !== 0) {
               // OSRM Routing
               const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${destLon},${destLat}?overview=false`;
               const osrmRes = await fetch(osrmUrl);
               const osrmData = await osrmRes.json();

               if (osrmData.code === "Ok" && osrmData.routes.length > 0) {
                 const distKm = (osrmData.routes[0].distance / 1000).toFixed(1);
                 const durationMins = Math.ceil(osrmData.routes[0].duration / 60);
                 const answerTxt = language === "hindi"
                   ? `${destName} यहाँ से ${distKm} किलोमीटर दूर है। पहुँचने में ${durationMins} मिनट लगेंगे। मैं नेविगेशन शुरू कर रहा हूँ।`
                   : `${destName} is ${distKm} kilometers away. It will take ${durationMins} minutes. Starting navigation now.`;
                 
                 await playSarvamTTS(answerTxt, language).catch(() => {});
               }
             }

             const navUrl = Platform.OS === 'ios' 
                ? `http://maps.apple.com/?daddr=${finalDest}&dirflg=d`
                : `google.navigation:q=${finalDest}`;

             Linking.canOpenURL(navUrl).then(supported => {
                 if (supported) {
                     Linking.openURL(navUrl);
                 } else {
                     Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${finalDest}`);
                 }
             });
             
             // Voice assistant can shutdown since we switch apps
             setIsVoiceActive(false);
             break;
           } catch (err) {
             const failTxt = language === "hindi" ? "माफ़ करें, मैं नेविगेशन शुरू नहीं कर पा रही हूँ।" : "Sorry, I couldn't start navigation.";
             await playSarvamTTS(failTxt, language).catch(() => {});
           }
        }
        else if (intent.type === "setting") {
          if (intent.action === "turn_off_assistant") {
            setIsVoiceActive(false);
            break;
          }
          if (intent.action === "haptics_off") await AsyncStorage.setItem("@echovision_haptics", "false");
          if (intent.action === "haptics_on") await AsyncStorage.setItem("@echovision_haptics", "true");
          if (intent.action === "lang_en") await AsyncStorage.setItem("@echovision_language", "english");
          if (intent.action === "lang_hi") await AsyncStorage.setItem("@echovision_language", "hindi");
          if (intent.action === "dark_mode_on") setThemeMode("dark");
          if (intent.action === "light_mode_on") setThemeMode("light");
        }
        else if (intent.type === "nav" && intent.target) {
          navigateDelegateRef.current(intent.target);
          break;
        }

      } catch (err) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    setIsVoiceActive(false);
    voiceActiveRef.current = false;
  };

  const toggleVoice = () => {
    if (voiceActiveRef.current) {
      voiceActiveRef.current = false;
      setIsVoiceActive(false);
      if (recordingRef.current) recordingRef.current.stopAndUnloadAsync().catch(() => {});
      // Play shutdown sound via Sarvam TTS
      const txt = language === "english" ? "Assistant turned off." : (language === "hinglish" ? "Assistant band kar raha hoon." : "असिस्टेंट को बंद कर रहा हूँ।");
      playSarvamTTS(txt, language).catch(() => {});
    } else {
      runVoiceLoop();
    }
  };

  // ALWAYS update the ref on every render so the event listener sees the latest closures (like `language`)
  toggleVoiceRef.current = toggleVoice;

  return (
    <VoiceContext.Provider value={{
      isVoiceActive,
      toggleVoice,
      registerContextualCommands,
      clearContextualCommands,
      navigateFromVoice: (t, p) => navigateDelegateRef.current(t, p),
      setNavigationDelegate,
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
