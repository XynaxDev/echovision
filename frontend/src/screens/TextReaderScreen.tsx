/**
 * EchoVision — Text Reader Screen (On-Device OCR)
 *
 * Fullscreen immersive camera UI with modern floating action buttons.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import TextRecognition from "@react-native-ml-kit/text-recognition";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as FileSystem from "expo-file-system";
import { useLanguage } from "../context/LanguageContext";
import { useVoiceContext } from "../context/VoiceContext";
import { textToSpeech, formatOcrText } from "../services/api";
import { BlurView } from "expo-blur";

import { useAppTheme } from "../context/ThemeContext";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "TextReader">;

type ReaderStep = "camera" | "capturing" | "reading" | "speaking" | "done" | "error";

export function TextReaderScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useAppTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<ReaderStep>("camera");
  const [extractedText, setExtractedText] = useState("");
  const [torch, setTorch] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const isStreamingRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { t, language } = useLanguage();

  const { registerContextualCommands, clearContextualCommands, isVoiceActive } = useVoiceContext();

  const cleanupAudio = useCallback(async () => {
    isStreamingRef.current = false;
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
      setExtractedText("");
    }
  }, [isVoiceActive, cleanupAudio]);

  useFocusEffect(useCallback(() => cleanupAudio, [cleanupAudio]));
  useEffect(() => {
    registerContextualCommands({
      onCapture: handleCapture,
      onFlashlightToggle: () => setTorch((t) => !t),
    });
    return () => clearContextualCommands();
  }, [torch]);

  // Pulse animation for extracting/reading state
  useEffect(() => {
    if (step === "reading" || step === "capturing") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
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

    // Prefetch the very first chunk
    let nextChunkPromise = textToSpeech(cleanedChunks[0], languageCode).catch(() => null);

    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

    for (let i = 0; i < cleanedChunks.length; i++) {
      if (!isStreamingRef.current) break; // Check if cancelled
      
      const audioUri = await nextChunkPromise;
      
      // Start prefetching the NEXT chunk while the current one is preparing to play
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
        console.warn("Playback failed for chunk", i, e);
      }
    }
    
    if (isStreamingRef.current) {
      setStep("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      isStreamingRef.current = false;
    }
  };

  const handleCapture = useCallback(async (): Promise<void> => {
    if (!cameraRef.current) return;
    try {
      cleanupAudio();
      setStep("capturing");

      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo || !photo.uri) throw new Error("Failed to capture image");

      setStep("reading");
      
      // PRE-AUDIO: Zero latency feedback to mask processing time
      const preAudioTxt = language === "hindi" ? "मैं टेक्स्ट पढ़ रही हूँ..." : "Reading text...";
      Speech.speak(preAudioTxt, { language: language === "hindi" ? "hi-IN" : "en-US" });

      const ocrResult = await TextRecognition.recognize(photo.uri);
      const rawText = ocrResult.blocks.map((block) => block.text).join("\n").trim();

      if (!rawText) {
        setStep("error");
        setExtractedText("No text detected. Please try again with a clearer image.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      // Format OCR text using NVIDIA
      const { cleaned_text, language_code } = await formatOcrText(rawText);

      setExtractedText(cleaned_text);
      setStep("speaking");

      await streamChunkedTTS(cleaned_text, language_code);
    } catch (error) {
      console.error("Text reading failed:", error);
      setStep("error");
      setExtractedText("Failed to read text. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [step, cleanupAudio, language]);

  const handleReset = useCallback(async (): Promise<void> => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    cleanupAudio();
    setStep("camera");
    setExtractedText("");
  }, [cleanupAudio]);

  const handleReplay = useCallback(async (): Promise<void> => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (!extractedText) return;

    try {
      cleanupAudio();
      setStep("speaking");

      const { language_code } = await formatOcrText(extractedText);
      await streamChunkedTTS(extractedText, language_code);
    } catch (error) {
      console.error("Replay failed:", error);
      setStep("done");
    }
  }, [extractedText]);

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
        <Feather name="book-open" size={64} color={colors.text} style={{ marginBottom: 20 }} />
        <Text style={[styles.permissionTitle, { color: colors.text }]}>Camera Access Required</Text>
        <Text style={[styles.permissionText, { color: colors.textSecondary }]}>
          EchoVision needs camera access to capture and read text.
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
          <Pressable style={styles.iconButton} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>{t("text_reader")}</Text>
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
                <Feather name="book-open" size={24} color="#FFF" style={{ marginRight: 12 }} />
                <Text style={styles.captureButtonText}>{t("read_text_btn") || "Read Text"}</Text>
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
              
              {/* AI Response Bubble */}
              <View style={[styles.aiBubbleContainer, { backgroundColor: colors.background }]}>
                {step === "reading" ? (
                  <View style={styles.chatRow}>
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                      <Feather name="cpu" size={24} color={colors.primary} style={{ marginRight: 12 }} />
                    </Animated.View>
                    <Text style={[styles.statusSub, { color: colors.textSecondary }]}>
                      {t("processing")}
                    </Text>
                  </View>
                ) : (
                  <View>
                    <View style={styles.chatRow}>
                      <Feather name={step === "speaking" ? "volume-2" : "check-circle"} size={20} color={colors.primary} style={{ marginRight: 8 }} />
                      <Text style={[styles.statusSub, { color: colors.primary, fontWeight: "700" }]}>
                        {step === "speaking" ? (t("reading_aloud") || "Reading Aloud...") : "EchoVision OCR"}
                      </Text>
                    </View>
                    <Text style={[styles.extractedText, { color: colors.text, marginTop: 8 }]}>{extractedText}</Text>
                  </View>
                )}
              </View>

            </ScrollView>

            {(step === "done" || step === "error") && (
              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={handleReset}
                >
                  <Feather name="camera" size={20} color={colors.text} style={{ marginRight: 8 }} />
                  <Text style={[styles.actionBtnText, { color: colors.text }]} adjustsFontSizeToFit numberOfLines={1}>
                    {language === "hindi" ? "रीटेक" : "Retake"}
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
    aspectRatio: 0.7, // A4 ratio approximation
    justifyContent: "space-between",
  },
  scannerCorner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#1D74F5",
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
  
  aiBubbleContainer: {
    alignSelf: "flex-start",
    maxWidth: "100%",
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
