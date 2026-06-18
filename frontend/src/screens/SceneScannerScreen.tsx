/**
 * EchoVision — Scene Scanner Screen
 *
 * Fullscreen immersive camera UI with modern floating action buttons.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
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
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { readAsStringAsync, EncodingType } from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BlurView } from "expo-blur";

import { useAppTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { useVoiceContext } from "../context/VoiceContext";
import { scanScene, textToSpeech } from "../services/api";
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
  const soundRef = useRef<Audio.Sound | null>(null);
  const isMountedRef = useRef(true);
  const isStreamingRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const { registerContextualCommands, clearContextualCommands, isVoiceActive } = useVoiceContext();

  const cleanupAudio = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isVoiceActive) {
      cleanupAudio();
      setStep("camera");
      setDescription("");
      setCapturedImageUri(null);
    }
  }, [isVoiceActive, cleanupAudio]);

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
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

  useEffect(() => {
    registerContextualCommands({
      onCapture: handleCapture,
      onFlashlightToggle: () => setTorch((t) => !t),
    });
    return () => clearContextualCommands();
  }, [torch]);

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      isStreamingRef.current = false;
    }
  };

  const handleCapture = useCallback(async (): Promise<void> => {
    if (!cameraRef.current || step !== "camera") return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setStep("capturing");

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
      });

      if (!photo || !photo.uri) throw new Error("Failed to capture image");

      setCapturedImageUri(photo.uri);
      setStep("analyzing");

      // PRE-AUDIO: Zero latency feedback to mask upload/processing time
      const preAudioTxt = language === "hindi" ? "कृपया मुझे एक पल दें, मैं विश्लेषण कर रही हूँ..." : "Please give me a moment, I'm analyzing...";
      Speech.speak(preAudioTxt, { language: language === "hindi" ? "hi-IN" : "en-US" });

      const base64 = await readAsStringAsync(photo.uri, { encoding: EncodingType.Base64 });
      const scanResult = await scanScene(base64, language);
      const sceneDescription = scanResult.description;

      if (!isMountedRef.current) return;

      setDescription(sceneDescription);
      setStep("speaking");

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const langCode = language === "hindi" ? "hi-IN" : "en-IN";
      await streamChunkedTTS(sceneDescription, langCode);

    } catch (error) {
      console.error("Scene scan failed:", error);
      if (isMountedRef.current) {
        setStep("error");
        setDescription("Failed to analyze scene. Please try again.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  }, [step, language]);

  const handleReset = useCallback(async (): Promise<void> => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await cleanupAudio();
    setStep("camera");
    setDescription("");
    setCapturedImageUri(null);
  }, [cleanupAudio]);

  const handleBack = useCallback(async () => {
    await cleanupAudio();
    navigation.goBack();
  }, [cleanupAudio, navigation]);

  const handleReplay = useCallback(async (): Promise<void> => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (!description) return;

    try {
      setStep("speaking");
      if (soundRef.current) await soundRef.current.unloadAsync();

      const audioUri = await textToSpeech(description);
      const { sound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true });
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) setStep("done");
      });
    } catch (error) {
      console.error("Replay failed:", error);
      setStep("done");
    }
  }, [description]);

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <Feather name="camera" size={64} color={colors.text} style={{ marginBottom: 20 }} />
        <Text style={[styles.permissionTitle, { color: colors.text }]}>Camera Access Required</Text>
        <Text style={[styles.permissionText, { color: colors.textSecondary }]}>
          EchoVision needs camera access to scan and describe your surroundings.
        </Text>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); requestPermission(); }}
          style={[styles.permissionButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      {/* ── FULLSCREEN CAMERA ── */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" enableTorch={torch}>
        {step !== "camera" && step !== "capturing" && (
          <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFillObject} />
        )}
      </CameraView>

      {/* ── FLOATING TOP BAR ── */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Pressable style={styles.iconButton} onPress={handleBack}>
            <Feather name="arrow-left" size={24} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>{t("scene_scanner")}</Text>
        </View>
        <Pressable 
          style={[styles.iconButton, torch && styles.iconButtonActive]} 
          onPress={() => {
            Haptics.selectionAsync();
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
          
          <View style={[styles.bottomFloatingArea, { opacity: isVoiceActive ? 0 : 1 }]} pointerEvents={isVoiceActive ? "none" : "auto"}>
            {step === "capturing" ? (
              <View style={styles.statusPill}>
                <Feather name="loader" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.statusText}>{t("capturing") || "Capturing..."}</Text>
              </View>
            ) : (
              <Pressable style={[styles.captureButton, { backgroundColor: colors.primary }]} onPress={handleCapture}>
                <Feather name="camera" size={24} color="#FFF" style={{ marginRight: 12 }} />
                <Text style={styles.captureButtonText}>{t("describe_scene") || "Describe Scene"}</Text>
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
                    <Text style={[styles.statusSub, { color: colors.textSecondary }]}>
                      {t("analyzing_scene")}
                    </Text>
                  </View>
                ) : (
                  <View>
                    <View style={styles.chatRow}>
                      <Feather name={step === "speaking" ? "volume-2" : "check-circle"} size={20} color={colors.primary} style={{ marginRight: 8 }} />
                      <Text style={[styles.statusSub, { color: colors.primary, fontWeight: "700" }]}>
                        {step === "speaking" ? (t("describing_aloud") || "Describing Aloud...") : "EchoVision AI"}
                      </Text>
                    </View>
                    <Text style={[styles.extractedText, { color: colors.text, marginTop: 8 }]}>{description}</Text>
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
                  <Text style={[styles.actionBtnText, { color: colors.text }]} adjustsFontSizeToFit numberOfLines={1}>
                    {t("scan_again") || "Scan Again"}
                  </Text>
                </Pressable>

                {step === "done" && (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={handleReplay}
                  >
                    <Feather name="refresh-cw" size={20} color="#FFF" style={{ marginRight: 8 }} />
                    <Text style={[styles.actionBtnText, { color: "#FFF" }]} adjustsFontSizeToFit numberOfLines={1}>
                      {t("replay_audio") || "Replay Audio"}
                    </Text>
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
  loadingText: { fontFamily: "Nunito_400Regular", fontSize: 16 },
  permissionTitle: { fontFamily: "Nunito_800ExtraBold", fontSize: 24, marginBottom: 12, textAlign: "center" },
  permissionText: { fontFamily: "Nunito_400Regular", fontSize: 15, textAlign: "center", marginBottom: 32, lineHeight: 22 },
  permissionButton: { paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16 },
  permissionButtonText: { fontFamily: "Nunito_700Bold", color: "#FFF", fontSize: 16 },

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
    fontFamily: "Nunito_600SemiBold",
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
  captureButtonText: { fontFamily: "Nunito_700Bold", color: "#FFF", fontSize: 18 },
  
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
  },
  statusText: { fontFamily: "Nunito_600SemiBold", color: "#FFF", fontSize: 16 },

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
  
  statusHeader: { fontFamily: "Nunito_800ExtraBold", fontSize: 22, marginTop: 16, marginBottom: 8 },
  statusSub: { fontFamily: "Nunito_400Regular", fontSize: 15 },
  extractedText: { fontFamily: "Nunito_400Regular", fontSize: 16, lineHeight: 26 },
  
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
  actionBtnText: { fontFamily: "Nunito_700Bold", fontSize: 15 },
});
