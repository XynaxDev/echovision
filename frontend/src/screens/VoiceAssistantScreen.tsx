/**
 * EchoVision — Voice Assistant Screen
 *
 * Full pipeline:
 *   1. User presses the large voice button
 *   2. Audio is recorded using expo-av
 *   3. Audio is dispatched to /api/v1/voice/stt for transcription
 *   4. Transcription is piped to /api/v1/voice/intent for classification
 *   5. App navigates to the designated screen based on intent
 */

import React, { useCallback, useRef, useState } from "react";
import { triggerHaptic } from "../utils/haptics";
import {
  Alert,
  StyleSheet,
  View,
} from "react-native";
import { AppText } from "../components/AppText";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import AsyncStorage from "@react-native-async-storage/async-storage";
import auth from "@react-native-firebase/auth";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAppTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { VoiceButton } from "../components/VoiceButton";
import { classifyIntent, speechToText, playSarvamTTS } from "../services/api";
import type { RootStackParamList } from "../navigation/AppNavigator";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type Props = NativeStackScreenProps<RootStackParamList, "VoiceAssistant">;

type ProcessingStep = "idle" | "recording" | "transcribing" | "classifying" | "navigating" | "speaking" | "error";

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function VoiceAssistantScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useAppTheme();
  const { language, t } = useLanguage();
  const [step, setStep] = useState<ProcessingStep>("idle");
  const [transcript, setTranscript] = useState("");
  const [statusMessage, setStatusMessage] = useState(t("tap_to_speak"));
  const recordingRef = useRef<Audio.Recording | null>(null);
  
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const userName = auth().currentUser?.displayName || "Friend";

  // ── Start/Stop Recording ──────────────────────────────────────────────
  const handleVoicePress = useCallback(async (): Promise<void> => {
    if (step === "recording") {
      // Stop recording and process
      await stopRecordingAndProcess();
    } else if (step === "idle" || step === "error") {
      // Start recording
      await startRecording();
    }
  }, [step]);

  const startRecording = async (): Promise<void> => {
    try {
      // Request audio permissions
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "Permission Required",
          "Microphone access is needed for voice commands.",
        );
        return;
      }

      // Configure audio session
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );

      recordingRef.current = recording;
      setStep("recording");
      setStatusMessage(t("listening"));
      setTranscript("");

      triggerHaptic("heavy");
    } catch (error) {
      console.error("Failed to start recording:", error);
      setStep("error");
      setStatusMessage(t("error_try_again"));
    }
  };

  const stopRecordingAndProcess = async (): Promise<void> => {
    try {
      const recording = recordingRef.current;
      if (!recording) return;

      triggerHaptic("heavy");

      // Stop recording
      setStep("transcribing");
      setStatusMessage(t("processing"));

      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        throw new Error("No recording URI available");
      }

      // Step 1: Speech-to-Text
      const sttResult = await speechToText(uri, language);
      const transcribedText = sttResult.transcript;
      setTranscript(transcribedText);

      if (!transcribedText.trim()) {
        setStep("error");
        setStatusMessage(t("error_try_again"));
        return;
      }

      // Step 2: Intent Classification
      setStep("classifying");
      setStatusMessage(`"${transcribedText}"`);

      const intentResult = await classifyIntent(transcribedText, language, userName, isFirstMessage);
      setIsFirstMessage(false);
      const target = intentResult.target;
      const action = intentResult.action;

      // Handle system actions (e.g. toggle haptics, change language)
      if (target === "Settings" && action) {
        setStep("navigating");
        let confirmMsg = "Setting updated.";

        if (action === "toggle_haptics_off") {
          await AsyncStorage.setItem("@echovision_haptics", "false");
          confirmMsg = "Haptic vibration has been turned off.";
        } else if (action === "toggle_haptics_on") {
          await AsyncStorage.setItem("@echovision_haptics", "true");
          confirmMsg = "Haptic vibration has been turned on.";
        } else if (action === "set_language_english") {
          await AsyncStorage.setItem("@echovision_language", "english");
          confirmMsg = "Language has been set to English.";
        } else if (action === "set_language_hindi") {
          await AsyncStorage.setItem("@echovision_language", "hindi");
          confirmMsg = "Language has been set to Hindi.";
        }

        setStatusMessage(confirmMsg);
        await playSarvamTTS(confirmMsg);

        triggerHaptic("success");
        await new Promise((resolve) => setTimeout(resolve, 300));
        navigation.navigate("Settings");
        return;
      }

      // Handle Conversational Loop or direct navigation
      if (intentResult.replyText) {
        setStep("speaking");
        setStatusMessage(intentResult.replyText);
        
        // Play the Sarvam AI audio and wait for it to finish
        await playSarvamTTS(intentResult.replyText);

        if (intentResult.requiresResponse) {
          // Automated Loop: Re-open microphone for user reply
          triggerHaptic("success");
          await startRecording();
          return; // Stay in the loop
        }
      } else {
        // Default navigation fallback using Sarvam TTS
        setStep("navigating");
        setStatusMessage(`Navigating to ${target}...`);
        
        const navigationText = target === "Dashboard" 
          ? "Ghar wapas jaa rahe hain." 
          : `${target} khol rahi hoon.`;
          
        await playSarvamTTS(navigationText);
      }

      triggerHaptic("success");

      // Brief delay so user sees the result
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Map intent target to screen name
      const screenMap: Record<string, keyof RootStackParamList> = {
        Scanner: "SceneScanner",
        TextReader: "TextReader",
        SOS: "SOSConfirmation",
        Dashboard: "Dashboard",
        Settings: "Settings",
      };

      const screenName = screenMap[target] || "Dashboard";

      if (screenName === "Dashboard") {
        navigation.goBack();
      } else if (screenName === "SOSConfirmation") {
        navigation.navigate("SOSConfirmation", { source: "voice" });
      } else {
        navigation.navigate(screenName);
      }
    } catch (error) {
      console.error("Voice processing failed:", error);
      triggerHaptic("error");
      setStep("error");
      setStatusMessage("Failed to process voice command. Please check your internet connection.");
      
      // Fallback offline speech since we can't reach the Sarvam TTS API
      Speech.speak("I am currently offline or cannot reach my servers. Please check your internet connection.", {
        language: "en",
        pitch: 1.1,
      });
    }
  };

  // ── Step indicator color ──────────────────────────────────────────────
  const getStepColor = (): string => {
    switch (step) {
      case "recording":
        return colors.danger;
      case "transcribing":
      case "classifying":
        return colors.warning;
      case "navigating":
        return colors.success;
      case "error":
        return colors.danger;
      default:
        return colors.textSecondary;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Status Header */}
      <View style={styles.statusContainer}>
        <View style={[styles.statusDot, { backgroundColor: getStepColor() }]} />
        <AppText style={[styles.statusText, { color: colors.text }]}>
          {statusMessage}
        </AppText>
      </View>

      {/* Transcript Display */}
      {transcript ? (
        <View style={[styles.transcriptCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <AppText style={[styles.transcriptLabel, { color: colors.textSecondary }]}>
            You said:
          </AppText>
          <AppText style={[styles.transcriptText, { color: colors.text }]}>
            "{transcript}"
          </AppText>
        </View>
      ) : null}

      {/* Voice Button — Large Center Anchor */}
      <View style={styles.buttonContainer}>
        <VoiceButton
          isRecording={step === "recording"}
          onPress={handleVoicePress}
          size={120}
        />

        <AppText style={[styles.buttonHint, { color: colors.textSecondary }]}>
          {step === "idle"
            ? "Speak a command like:\n\"Scene dikhao\" or \"Text padho\""
            : step === "recording"
              ? "Listening..."
              : "Processing..."}
        </AppText>
      </View>

      {/* Pipeline Steps Indicator */}
      <View style={styles.pipelineContainer}>
        {(["recording", "transcribing", "classifying", "navigating"] as const).map(
          (pipelineStep, index) => {
            const stepLabels = ["Record", "Transcribe", "Classify", "Navigate"];
            const isActive = step === pipelineStep;
            const isPast =
              ["recording", "transcribing", "classifying", "navigating"].indexOf(step) > index;

            return (
              <View key={pipelineStep} style={styles.pipelineStep}>
                <View
                  style={[
                    styles.pipelineDot,
                    {
                      backgroundColor: isPast
                        ? colors.success
                        : isActive
                          ? colors.warning
                          : colors.textDisabled,
                    },
                  ]}
                />
                <AppText
                  style={[
                    styles.pipelineLabel,
                    {
                      color: isActive || isPast ? colors.text : colors.textDisabled,
                      fontWeight: isActive ? "700" : "400",
                    },
                  ]}
                >
                  {stepLabels[index]}
                </AppText>
              </View>
            );
          },
        )}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    flex: 1,
  },
  transcriptCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 20,
  },
  transcriptLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  transcriptText: {
    fontSize: 18,
    fontWeight: "500",
    lineHeight: 26,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonHint: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginTop: 24,
  },
  pipelineContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 24,
    paddingHorizontal: 10,
  },
  pipelineStep: {
    alignItems: "center",
    gap: 6,
  },
  pipelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  pipelineLabel: {
    fontSize: 11,
  },
});
