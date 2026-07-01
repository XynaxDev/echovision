import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Animated, Platform, Image } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "../navigation/AppNavigator";
import { AppText } from "../components/AppText";
import { useAppTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { triggerHaptic } from "../utils/haptics";
import { executeSOS, getPrimaryContact } from "../utils/sos";
import { useVoiceContext } from "../context/VoiceContext";
import { LinearGradient } from "expo-linear-gradient";
import { GridPattern } from "../components/GridPattern";
import { Gradients } from "../constants/Colors";

type Props = NativeStackScreenProps<RootStackParamList, "SOSConfirmation">;

export function SOSConfirmationScreen({ route, navigation }: Props) {
  const { source } = route.params;
  const { colors, isDark } = useAppTheme();
  const { language } = useLanguage();
  const { registerContextualCommands, clearContextualCommands, isVoiceActive } = useVoiceContext();
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [address, setAddress] = useState<string>("Locating...");

  useEffect(() => {
    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true })
      ])
    ).start();

    // Inject onCancelSOS to contextual commands if user says "cancel SOS"
    registerContextualCommands({
      activePage: "SOSConfirmation",
      onCancelSOS: handleCancel
    });

    // Load location
    AsyncStorage.getItem("@echovision_current_location").then(loc => {
      if (loc) setAddress(loc);
      else setAddress("Unknown location");
    });

    // Voice / Expo TTS logic
    if (!isVoiceActive && source === "manual") {
      triggerHaptic("heavy");
      const isHindi = language === "hindi" || language === "hinglish";
      Speech.speak(
        isHindi 
          ? "क्या आप आपातकाल में हैं? मदद बुलाने के लिए बीच वाले SOS बटन को दबाएँ, या रद्द करने के लिए उसके नीचे वाले बटन को दबाएँ।"
          : "Are you in an emergency? Tap the SOS button in the center to call for help, or tap the cancel button below it.", 
        {
          language: isHindi ? "hi-IN" : "en-US",
          pitch: 1.0,
          rate: 0.85
        }
      );
    }

    return () => {
      clearContextualCommands("SOSConfirmation");
      // Allow speech to finish playing even if screen unmounts
    };
  }, [registerContextualCommands, clearContextualCommands]);

  const handleSOSConfirm = async () => {
    triggerHaptic("heavy");
    if (!isVoiceActive) {
      Speech.stop();
      const isHindi = language === "hindi" || language === "hinglish";
      const contact = await getPrimaryContact();
      Speech.speak(isHindi ? `${contact.name} को SOS कॉल किया जा रहा है।` : `Triggering SOS to ${contact.name}.`, { 
        language: isHindi ? "hi-IN" : "en-US",
        rate: 0.9
      });
    }
    
    // Disable contextual command so Voice Assistant doesn't double trigger
    clearContextualCommands("SOSConfirmation");
    
    await executeSOS();
    if (navigation.canGoBack()) navigation.goBack();
  };

  const handleCancel = (fromVoice: boolean | any = false) => {
    triggerHaptic("medium");
    if (fromVoice !== true) {
      Speech.stop();
      const isHindi = language === "hindi" || language === "hinglish";
      Speech.speak(isHindi ? "SOS रद्द कर दिया गया है।" : "SOS Cancelled.", { 
        language: isHindi ? "hi-IN" : "en-US",
        rate: 0.9
      });
    }
    clearContextualCommands("SOSConfirmation");
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GridPattern color={colors.danger} opacity={isDark ? 0.15 : 0.08} spacing={24} />
      
      {/* Header Area (Empty for spacing) */}
      <View style={styles.headerRow} />

      {/* Title Area */}
      <View style={styles.titleArea}>
        <AppText style={[styles.titleText, { color: colors.text }]}>
          {(language === "hindi" || language === "hinglish") ? "क्या आप आपातकाल में हैं?" : "Are you in an emergency?"}
        </AppText>
        <AppText style={[styles.subtitleText, { color: colors.textSecondary }]}>
          {(language === "hindi" || language === "hinglish") 
            ? "नीचे दिए गए बटन को दबाएँ और मदद जल्द ही आप तक पहुँचेगी।" 
            : "Press the button below and help will reach you shortly."}
        </AppText>
      </View>

      {/* Center SOS Button with Ripples */}
      <View style={styles.buttonContainer}>
        {/* Main SOS Button */}
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Pressable onPress={handleSOSConfirm} style={({ pressed }) => [styles.mainButton, pressed && { transform: [{ scale: 0.95 }] }]}>
            <LinearGradient colors={["#FF2A85", "#EF4444"]} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
            <AppText style={styles.mainButtonText}>SOS</AppText>
          </Pressable>
        </Animated.View>
        
        {/* Cancel Button (Styled like Capture Button) */}
        <Pressable onPress={handleCancel} style={({ pressed }) => [styles.cancelBtnCircle, pressed && { transform: [{ scale: 0.95 }] }]}>
          <Feather name="x" size={36} color="#FFF" />
        </Pressable>
      </View>

      {/* Address Bar */}
      <View style={styles.addressArea}>
        <View style={[styles.addressCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <AppText style={[styles.addressLabel, { color: colors.text }]}>
            {(language === "hindi" || language === "hinglish") ? "आपका वर्तमान पता" : "Your Current Address"}
          </AppText>
          <View style={styles.addressRow}>
             <View style={styles.avatarPlaceholder}>
               <Feather name="user" size={16} color="#FFF" />
             </View>
             <AppText style={[styles.addressText, { color: colors.textSecondary }]} numberOfLines={2}>
               {address}
             </AppText>
             <Feather name="map-pin" size={20} color={colors.primary} />
          </View>
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    paddingTop: Platform.OS === "android" ? 50 : 60,
    height: 80,
  },
  cancelBtnCircle: {
    marginTop: 60,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1C1C1E", // Dark color for cancel
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  titleArea: {
    paddingHorizontal: 30,
    marginTop: 20,
    alignItems: "center",
  },
  titleText: {
    fontSize: 28,
    fontFamily: "Inter_800ExtraBold",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitleText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  mainButton: {
    width: 220,
    height: 220,
    borderRadius: 110,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FF2A85",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 12,
    overflow: "hidden", // Keeps gradient inside the circle
  },
  mainButtonText: {
    fontSize: 54,
    fontFamily: "Inter_800ExtraBold",
    color: "#FFFFFF",
    letterSpacing: 3,
  },
  addressArea: {
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 30,
  },
  addressCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  addressLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF2A85",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginRight: 12,
  }
});
