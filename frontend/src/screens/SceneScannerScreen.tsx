/**
 * EchoVision — Scene Scanner Screen
 *
 * Fullscreen immersive camera UI with modern floating action buttons.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { triggerHaptic } from "../utils/haptics";
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Vibration,
} from "react-native";
import { AppText } from "../components/AppText";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BlurView } from "expo-blur";

import { useAppTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { useVoiceContext } from "../context/VoiceContext";
import { scanScene, textToSpeech, VISION_WS_URL } from "../services/api";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "SceneScanner">;

type ScanStep = "camera" | "capturing" | "analyzing" | "speaking" | "done" | "error";

export function SceneScannerScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useAppTheme();
  const { language, t } = useLanguage();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<ScanStep>("camera");
  const [description, setDescription] = useState("");
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const isFocused = useIsFocused();
  const soundRef = useRef<Audio.Sound | null>(null);
  const isMountedRef = useRef(true);
  const isStreamingRef = useRef(false);
  const capturingRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fullAudioSequence = useRef<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const { registerContextualCommands, clearContextualCommands, isVoiceActive, pushToAudioQueue, interruptAudioQueue } = useVoiceContext();

  const cleanupAudio = useCallback(async () => {
    try {
      interruptAudioQueue(); // Stop global voice queue if it was playing scene scanner results
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      for (const uri of fullAudioSequence.current) {
         try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (e) {}
      }
      fullAudioSequence.current = [];
      if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
      }
    } catch {}
  }, [interruptAudioQueue]);



  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
        setTorch(false); // Turn off flashlight when leaving screen
        cleanupAudio();
      };
    }, [cleanupAudio])
  );

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
      isMountedRef.current = false;
      clearContextualCommands();
    };
  }, []);


  // Pulse animation for analyzing state
  useEffect(() => {
    if (step === "analyzing" || step === "capturing") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [step]);

  const streamChunkedTTS = async (text: string, languageCode: string) => {
    isStreamingRef.current = true;
    
    // Split text by punctuation or newlines
    const chunks = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
    const cleanedChunks = chunks.map(c => c.trim()).filter(c => c.length > 0);

    if (cleanedChunks.length === 0) {
       setStep("done");
       return;
    }

    let nextChunkPromise = textToSpeech(cleanedChunks[0], languageCode).catch(() => null);

    for (let i = 0; i < cleanedChunks.length; i++) {
      if (!isStreamingRef.current) break; // Check if cancelled
      
      const audioUri = await nextChunkPromise;
      
      if (i + 1 < cleanedChunks.length) {
        nextChunkPromise = textToSpeech(cleanedChunks[i+1], languageCode).catch(() => null);
      }

      if (!audioUri) continue;
      if (!isStreamingRef.current) break;

      try {
        const { sound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true });
        soundRef.current = sound;
        
        await new Promise<void>((resolve) => {
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) resolve();
          });
        });
      } catch (e) {
        console.log("Playback failed for chunk", i, e);
      }
    }
    
    if (isStreamingRef.current) {
      setStep("done");
      triggerHaptic("success");
      isStreamingRef.current = false;
    }
  };

  const isCameraReadyRef = useRef(false);
  const lastCaptureAttemptRef = useRef(0);

  const handleCapture = useCallback(async (): Promise<boolean> => {
    if (!cameraRef.current || step !== "camera" || capturingRef.current || !isCameraReadyRef.current) return false;

    // Throttle hardware calls to once every 1000ms to prevent locking up the Android Camera2 API.
    // The VoiceContext polling loop hits this every 100ms, so we must shield the hardware.
    const now = Date.now();
    if (now - lastCaptureAttemptRef.current < 1000) {
      return false; // Hardware is shielded; let the VoiceContext poll keep retrying
    }
    lastCaptureAttemptRef.current = now;

    capturingRef.current = true;
    
    // Use legacy Vibration API (via isBackground=true flag) because Android 13+ blocks expo-haptics when triggered via Voice Assistant (WebSocket) instead of a direct screen touch
    triggerHaptic("heavy", true);

    // ── PHASE 1: Camera Hardware ──
    // If the camera hardware isn't ready yet (e.g. just navigated here),
    // takePictureAsync will throw. We silently reset and let the poll retry.
    let photo;
    try {
      photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
      });
    } catch (cameraError) {
      // Camera hardware not initialized yet — silently allow retry
      console.log("Camera not ready yet, throttling for 1s...", cameraError);
      capturingRef.current = false;
      return false;
    }

    if (!photo || !photo.uri) {
      capturingRef.current = false;
      return false;
    }

    // ── PHASE 2: Photo taken successfully — process it ──
    try {
      triggerHaptic("heavy");
      const isHindi = language === "hindi";
      Speech.speak(isHindi ? "फोटो खींच ली गई है" : "Photo captured", { 
        rate: 0.85, 
        language: isHindi ? "hi-IN" : "en-US" 
      });
      setStep("capturing");

      setCapturedImageUri(photo.uri);
      setStep("analyzing");
      setDescription("");
      fullAudioSequence.current = [];

      // PRE-AUDIO: Zero latency feedback to mask upload/processing time
      if (!isVoiceActive) {
        // Expo Speech uses the device's local TTS which is typically female, so we use female grammar here.
        const preAudioTxt = language === "hindi" ? "मैं विश्लेषण कर रही हूँ, थोड़ा समय दें।" : "I'm analyzing, please give me a moment.";
        Speech.speak(preAudioTxt, { 
          language: language === "hindi" ? "hi-IN" : "en-US",
          rate: language === "hindi" ? 0.85 : 1.0 
        });
      } else {
        // Strictly stop any lingering local speech if Voice AI is active
        Speech.stop();
      }

      const base64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: "base64" });

      isStreamingRef.current = true;
      if (!isVoiceActive) {
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      }

      if (wsRef.current) wsRef.current.close();
      const ws = new WebSocket(VISION_WS_URL);
      wsRef.current = ws;
      
      let audioQueue: string[] = [];
      let isWsDone = false;
      let isPlaying = false;

      const processAudioQueue = async () => {
        if (isPlaying || !isStreamingRef.current) return;
        if (audioQueue.length === 0) {
           if (isWsDone && isStreamingRef.current) {
              setStep("done");
              triggerHaptic("success");
              isStreamingRef.current = false;
           }
           return;
        }
        
        isPlaying = true;
        const fileUri = audioQueue.shift()!;
        
        try {
          const { sound } = await Audio.Sound.createAsync({ uri: fileUri }, { shouldPlay: true });
          soundRef.current = sound;
          
          await new Promise<void>((resolve) => {
            sound.setOnPlaybackStatusUpdate((status) => {
              if (status.isLoaded && status.didJustFinish) resolve();
            });
          });
        } catch (e) {
          console.warn("Playback failed for chunk", e);
        } finally {
          isPlaying = false;
          processAudioQueue();
        }
      };

      ws.onopen = () => {
        ws.send(JSON.stringify({ image_base64: base64, language }));
      };

      ws.onmessage = async (e) => {
        if (!isStreamingRef.current) {
          ws.close();
          return;
        }

        try {
          const data = JSON.parse(e.data);
          if (data.type === 'text') {
             setStep(prev => prev === "analyzing" ? "speaking" : prev);
             setDescription(prev => (prev + " " + data.text).trim());
          } else if (data.type === 'done') {
             isWsDone = true;
             if (!isVoiceActive) processAudioQueue();
          } else if (data.type === 'audio') {
             const fileUri = `${FileSystem.cacheDirectory}vision_ws_${Date.now()}_${Math.random()}.wav`;
             await FileSystem.writeAsStringAsync(fileUri, data.data, {
               encoding: "base64",
             });
             
             if (isVoiceActive) {
                 pushToAudioQueue(fileUri);
             } else {
                 audioQueue.push(fileUri);
                 fullAudioSequence.current.push(fileUri);
                 processAudioQueue();
             }
          }
        } catch (err) {
          console.warn("WS Message Parsing Error", err);
        }
      };

      ws.onerror = (err) => {
         console.error("WS Error", err);
         if (isMountedRef.current) {
            setStep(prev => prev !== "speaking" ? "error" : prev);
            setDescription("Failed to stream scene. Please try again.");
         }
      };

      ws.onclose = () => {
         isWsDone = true;
         processAudioQueue();
      };

      return true; // Photo taken and processing initiated

    } catch (error) {
      console.error("Scene scan failed:", error);
      if (isMountedRef.current) {
        capturingRef.current = false;
        setStep("error");
        setDescription("Failed to analyze scene. Please try again.");
        triggerHaptic("error");
      }
      return false;
    }
  }, [step, language, isVoiceActive, cleanupAudio]);

  useEffect(() => {
    registerContextualCommands({
      activePage: "Scene Scanner",
      onCapture: handleCapture,
      onFlashlightToggle: (enabled?: boolean) => setTorch((current) => enabled ?? !current),
      onVoiceToggle: async (isActive: boolean) => {
        if (!isActive) {
          const wasPlaying = soundRef.current !== null && isStreamingRef.current;
          if (wasPlaying && soundRef.current) {
            await soundRef.current.pauseAsync().catch(() => {});
          }
          
          Speech.speak(language === "hindi" ? "वॉइस असिस्टेंट बंद" : "Voice Assistant Off", {
            language: language === "hindi" ? "hi-IN" : "en-US",
            onDone: () => {
              if (wasPlaying && soundRef.current && isStreamingRef.current && isMountedRef.current) {
                soundRef.current.playAsync().catch(() => {});
              }
            }
          });
        } else {
          // If voice turns ON, we reset the scanner to allow new queries
          cleanupAudio();
          capturingRef.current = false;
          setStep("camera");
          setDescription("");
          setCapturedImageUri(null);
        }
      }
    });
    return () => clearContextualCommands();
  }, [handleCapture, language, cleanupAudio, registerContextualCommands, clearContextualCommands]);

  const handleReset = useCallback(async (): Promise<void> => {
    triggerHaptic("heavy");
    await cleanupAudio();
    capturingRef.current = false;
    setStep("camera");
    setDescription("");
    setCapturedImageUri(null);
  }, [cleanupAudio]);

  const handleBack = useCallback(async () => {
    await cleanupAudio();
    navigation.goBack();
  }, [cleanupAudio, navigation]);

  const handleReplay = useCallback(async (): Promise<void> => {
    triggerHaptic("heavy");
    if (!description || fullAudioSequence.current.length === 0) return;

    try {
      setStep("speaking");
      if (soundRef.current) await soundRef.current.unloadAsync();

      isStreamingRef.current = true;
      const queue = [...fullAudioSequence.current];
      let isPlaying = false;

      const processQueue = async () => {
        if (isPlaying || !isStreamingRef.current) return;
        if (queue.length === 0) {
           setStep("done");
           isStreamingRef.current = false;
           return;
        }
        isPlaying = true;
        const fileUri = queue.shift()!;
        try {
          const { sound } = await Audio.Sound.createAsync({ uri: fileUri }, { shouldPlay: true });
          soundRef.current = sound;
          await new Promise<void>((resolve) => {
            sound.setOnPlaybackStatusUpdate((status) => {
              if (status.isLoaded && status.didJustFinish) resolve();
            });
          });
        } catch (e) {
          console.warn("Replay chunk failed", e);
        } finally {
          isPlaying = false;
          processQueue();
        }
      };
      
      processQueue();
    } catch (error) {
      console.error("Replay failed:", error);
      setStep("done");
    }
  }, [description]);

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppText style={[styles.loadingText, { color: colors.textSecondary }]}>Loading camera...</AppText>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <Feather name="camera" size={64} color={colors.text} style={{ marginBottom: 20 }} />
        <AppText style={[styles.permissionTitle, { color: colors.text }]}>Camera Access Required</AppText>
        <AppText style={[styles.permissionText, { color: colors.textSecondary }]}>
          EchoVision needs camera access to scan and describe your surroundings.
        </AppText>
        <Pressable
          onPress={() => { triggerHaptic("heavy"); requestPermission(); }}
          style={[styles.permissionButton, { backgroundColor: colors.primary }]}
        >
          <AppText style={styles.permissionButtonText}>Grant Permission</AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      {/* ── FULLSCREEN CAMERA ── */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" enableTorch={torch} onCameraReady={() => { isCameraReadyRef.current = true; }} />
      {step !== "camera" && step !== "capturing" && (
        <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFillObject} />
      )}

      {/* ── FLOATING TOP BAR ── */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Pressable style={styles.iconButton} onPress={handleBack}>
            <Feather name="arrow-left" size={24} color="#FFF" />
          </Pressable>
          <AppText style={styles.headerTitle}>{t("scene_scanner")}</AppText>
        </View>
        <Pressable 
          style={[styles.iconButton, torch && styles.iconButtonActive]} 
          onPress={() => {
            triggerHaptic("light");
            setTorch(!torch);
          }}
        >
          <Feather name={torch ? "zap-off" : "zap"} size={22} color={torch ? "#000" : "#FFF"} />
        </Pressable>
      </View>

      {/* ── CAMERA MODE UI ── */}
      {(step === "camera" || step === "capturing") && (
        <View style={styles.cameraOverlay}>
          <Animated.View style={[styles.scannerReticleContainer, { transform: [{ scale: pulseAnim }] }]}>
            <View style={[styles.scannerCorner, styles.cornerTL, { borderColor: step === "capturing" ? colors.primary : "#1D74F5" }]} />
            <View style={[styles.scannerCorner, styles.cornerTR, { borderColor: step === "capturing" ? colors.primary : "#1D74F5" }]} />
            <View style={[styles.scannerCorner, styles.cornerBL, { borderColor: step === "capturing" ? colors.primary : "#1D74F5" }]} />
            <View style={[styles.scannerCorner, styles.cornerBR, { borderColor: step === "capturing" ? colors.primary : "#1D74F5" }]} />
          </Animated.View>
          
          <View style={styles.bottomFloatingArea}>
            {step === "capturing" ? (
              <View style={styles.statusPill}>
                <Feather name="loader" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <AppText style={styles.statusText}>{t("capturing") || "Capturing..."}</AppText>
              </View>
            ) : (
              <Pressable style={[styles.captureButton, { backgroundColor: colors.primary }]} onPress={handleCapture}>
                <Feather name="camera" size={24} color="#FFF" style={{ marginRight: 12 }} />
                <AppText style={styles.captureButtonText}>{t("describe_scene") || "Describe Scene"}</AppText>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* ── RESULTS MODE UI (CHATBOT STYLE) ── */}
      {step !== "camera" && step !== "capturing" && (
        <View style={styles.resultContainer}>
          <View style={[styles.resultCard, { backgroundColor: colors.card }]}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
              
              {/* User Image Bubble */}
              {capturedImageUri && (
                <View style={styles.userBubbleContainer}>
                  <Image source={{ uri: capturedImageUri }} style={styles.chatThumbnail} />
                </View>
              )}

              {/* AI Response Bubble */}
              <View style={[styles.aiBubbleContainer, { backgroundColor: colors.background }]}>
                {step === "analyzing" ? (
                  <View style={styles.chatRow}>
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                      <Feather name="cpu" size={24} color={colors.primary} style={{ marginRight: 12 }} />
                    </Animated.View>
                    <AppText style={[styles.statusSub, { color: colors.textSecondary }]}>
                      {t("analyzing_scene")}
                    </AppText>
                  </View>
                ) : (
                  <View>
                    <View style={styles.chatRow}>
                      <Feather name={step === "speaking" ? "volume-2" : "check-circle"} size={20} color={colors.primary} style={{ marginRight: 8 }} />
                      <AppText style={[styles.statusSub, { color: colors.primary, fontWeight: "700" }]}>
                        {step === "speaking" ? (t("describing_aloud") || "Describing Aloud...") : "EchoVision AI"}
                      </AppText>
                    </View>
                    <AppText style={[styles.extractedText, { color: colors.text, marginTop: 8 }]}>{description}</AppText>
                  </View>
                )}
              </View>

            </ScrollView>

            {(step === "done" || step === "error") && (
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={handleReset}
                >
                  <Feather name="camera" size={20} color={colors.text} style={{ marginRight: 8 }} />
                  <AppText style={[styles.actionBtnText, { color: colors.text }]} adjustsFontSizeToFit numberOfLines={1}>
                    {t("scan_again") || "Scan Again"}
                  </AppText>
                </Pressable>

                {step === "done" && (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={handleReplay}
                  >
                    <Feather name="refresh-cw" size={20} color="#FFF" style={{ marginRight: 8 }} />
                    <AppText style={[styles.actionBtnText, { color: "#FFF" }]} adjustsFontSizeToFit numberOfLines={1}>
                      {t("replay_audio") || "Replay Audio"}
                    </AppText>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 16 },
  permissionTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 24, marginBottom: 12, textAlign: "center" },
  permissionText: { fontFamily: "Inter_400Regular", fontSize: 15, textAlign: "center", marginBottom: 32, lineHeight: 22 },
  permissionButton: { paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16 },
  permissionButtonText: { fontFamily: "Inter_700Bold", color: "#FFF", fontSize: 16 },

  topBar: {
    position: "absolute",
    top: Platform.OS === "android" ? 40 : 60,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    fontWeight: "800",
    color: "#FFF",
    marginLeft: 16,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  iconButtonActive: {
    backgroundColor: "#FFF",
  },

  cameraOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  
  scannerReticleContainer: {
    width: "80%",
    aspectRatio: 0.7,
    justifyContent: "space-between",
  },
  scannerCorner: {
    position: "absolute",
    width: 40,
    height: 40,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },

  bottomFloatingArea: {
    position: "absolute",
    bottom: 50,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  captureButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 30,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  captureButtonText: { fontFamily: "Inter_700Bold", color: "#FFF", fontSize: 18 },
  
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
  },
  statusText: { fontFamily: "Inter_600SemiBold", color: "#FFF", fontSize: 16 },

  resultContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  resultCard: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: "85%",
    elevation: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  scrollView: { flexGrow: 0 },
  scrollContent: { paddingBottom: 24 },
  
  userBubbleContainer: {
    alignSelf: "flex-end",
    marginBottom: 16,
    borderRadius: 20,
    borderBottomRightRadius: 4,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  chatThumbnail: {
    width: 140,
    height: 140,
    borderRadius: 0,
  },
  aiBubbleContainer: {
    alignSelf: "flex-start",
    maxWidth: "90%",
    padding: 16,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  
  statusHeader: { fontFamily: "Inter_800ExtraBold", fontSize: 22, marginTop: 16, marginBottom: 8 },
  statusSub: { fontFamily: "Inter_400Regular", fontSize: 15 },
  extractedText: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 26 },
  
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 6,
  },
  actionBtnText: { fontFamily: "Inter_700Bold", fontSize: 15 },
});
