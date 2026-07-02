import React, { useState, useEffect, useRef } from "react";
import { triggerHaptic, setHapticsEnabled } from "../utils/haptics";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
  Modal,
  Image,
  Alert,
} from "react-native";
import { AppText } from "../components/AppText";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import auth from "@react-native-firebase/auth";
import * as Location from "expo-location";
import Toast from "react-native-toast-message";
import * as ImagePicker from "expo-image-picker";

import { useAppTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { useVoiceContext } from "../context/VoiceContext";
import * as Speech from "expo-speech";
import { GridPattern } from "../components/GridPattern";
import { legalDocuments, legalDocumentsHi } from "../data/legal";

// ═══════════════════════════════════════════════════════════════════════════
// Custom Switch (Flat Style)
// ═══════════════════════════════════════════════════════════════════════════

function ModernSwitch({ value, onValueChange, activeColor }: { value: boolean, onValueChange: () => void, activeColor?: string }) {
  const { colors } = useAppTheme();
  const effectiveActiveColor = activeColor || colors.primary;
  const [anim] = useState(new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
      bounciness: 0,
    }).start();
  }, [value]);

  const thumbPosition = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 24],
  });

  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#E5E5EA", effectiveActiveColor],
  });

  return (
    <Pressable onPress={() => {
      triggerHaptic("light");
      onValueChange();
    }}>
      <Animated.View style={[styles.switchTrack, { backgroundColor }]}>
        <Animated.View style={[styles.switchThumb, { transform: [{ translateX: thumbPosition }] }]} />
      </Animated.View>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Theme Selector Pill
// ═══════════════════════════════════════════════════════════════════════════

function ThemeSelectorPill({ talkbackOn }: { talkbackOn: boolean }) {
  const { themeMode, setThemeMode, colors, isDark } = useAppTheme();
  const { language } = useLanguage();

  const handleSelect = (mode: "system" | "light" | "dark") => {
    setThemeMode(mode);
    triggerHaptic("light");
    const msg = `Theme set to ${mode} mode.`;
    if (talkbackOn) {
      Speech.stop();
      Speech.speak(language === "hindi" ? `थीम ${mode} में बदल दी गई है` : msg, { rate: 0.85, language: language === "hindi" ? "hi-IN" : "en-US" });
    }
    Toast.show({ type: "success", text1: language === "hindi" ? "थीम अपडेट हो गई" : "Theme updated", text2: language === "hindi" ? `थीम ${mode} में बदल दी गई है` : msg });
  };

  const getBg = (mode: "system" | "light" | "dark") => (themeMode === mode ? (isDark ? colors.card : "#FFF") : "transparent");
  const getIconColor = (mode: "system" | "light" | "dark") => (themeMode === mode ? colors.text : colors.textSecondary);

  return (
    <View style={[styles.themePillContainer, { backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "#EFEFF0" }]}>
      <Pressable onPress={() => handleSelect("system")} style={[styles.themePillSegment, { backgroundColor: getBg("system") }]}>
        <Feather name="monitor" size={18} color={getIconColor("system")} />
      </Pressable>
      <Pressable onPress={() => handleSelect("light")} style={[styles.themePillSegment, { backgroundColor: getBg("light") }]}>
        <Feather name="sun" size={18} color={getIconColor("light")} />
      </Pressable>
      <Pressable onPress={() => handleSelect("dark")} style={[styles.themePillSegment, { backgroundColor: getBg("dark") }]}>
        <Feather name="moon" size={18} color={getIconColor("dark")} />
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Text Size Selector Pill
// ═══════════════════════════════════════════════════════════════════════════

function TextSizeSelectorPill({ talkbackOn }: { talkbackOn: boolean }) {
  const { textSize, setTextSize, colors, isDark } = useAppTheme();
  const { language } = useLanguage();

  const handleSelect = (size: "small" | "medium" | "large") => {
    setTextSize(size);
    triggerHaptic("light");
    const msg = `Text size set to ${size}.`;
    if (talkbackOn) {
      Speech.stop();
      Speech.speak(language === "hindi" ? `टेक्स्ट का आकार ${size} कर दिया गया है` : msg, { rate: 0.85, language: language === "hindi" ? "hi-IN" : "en-US" });
    }
    Toast.show({ type: "success", text1: language === "hindi" ? "टेक्स्ट का आकार अपडेट हो गया" : "Text size updated", text2: language === "hindi" ? `टेक्स्ट का आकार ${size} कर दिया गया है` : msg });
  };

  const getBg = (size: "small" | "medium" | "large") => (textSize === size ? (isDark ? colors.card : "#FFF") : "transparent");
  const getIconColor = (size: "small" | "medium" | "large") => (textSize === size ? colors.text : colors.textSecondary);

  return (
    <View style={[styles.themePillContainer, { backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "#EFEFF0" }]}>
      <Pressable onPress={() => handleSelect("small")} style={[styles.themePillSegment, { backgroundColor: getBg("small") }]}>
        <Text style={{ fontFamily: "Inter_700Bold", color: getIconColor("small"), fontSize: 12 }}>A</Text>
      </Pressable>
      <Pressable onPress={() => handleSelect("medium")} style={[styles.themePillSegment, { backgroundColor: getBg("medium") }]}>
        <Text style={{ fontFamily: "Inter_700Bold", color: getIconColor("medium"), fontSize: 16 }}>A</Text>
      </Pressable>
      <Pressable onPress={() => handleSelect("large")} style={[styles.themePillSegment, { backgroundColor: getBg("large") }]}>
        <Text style={{ fontFamily: "Inter_700Bold", color: getIconColor("large"), fontSize: 20 }}>A</Text>
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Render Helpers
// ═══════════════════════════════════════════════════════════════════════════

const SettingRow = ({ 
  title, 
  rightElement, 
  icon, 
  iconBg 
}: { 
  title: string, 
  rightElement: React.ReactNode, 
  icon?: React.ComponentProps<typeof Feather>["name"], 
  iconBg?: string 
}) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.settingRow}>
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 16 }}>
        {icon && iconBg && (
          <View style={[styles.rowIconContainer, { backgroundColor: iconBg }]}>
            <Feather name={icon} size={16} color="#FFFFFF" />
          </View>
        )}
        <AppText style={[styles.settingText, { color: colors.text }]} adjustsFontSizeToFit numberOfLines={1}>
          {title}
        </AppText>
      </View>
      {rightElement}
    </View>
  );
};

const Divider = () => {
  const { isDark } = useAppTheme();
  return <View style={[styles.divider, { borderBottomColor: isDark ? "#222" : "#F0F0F0" }]} />;
};

const SectionHeader = ({ title }: { title: string }) => {
  const { colors } = useAppTheme();
  return <AppText style={[styles.sectionHeader, { color: colors.primary }]}>{title.toUpperCase()}</AppText>;
};

const SettingCard = ({ children }: { children: React.ReactNode }) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.settingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

export interface SOSContact {
  id: string;
  name: string;
  number: string;
  isPrimary: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Custom Confirmation Modal
// ═══════════════════════════════════════════════════════════════════════════

function ConfirmationModal({ visible, title, description, confirmText, cancelText = "Cancel", onConfirm, onCancel, isDanger = false, colors, isDark }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.modalOverlay}>
        <Pressable style={[styles.modalContent, { backgroundColor: colors.card, borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)", borderWidth: 1 }]} onPress={(e) => e.stopPropagation()}>
          <AppText style={[styles.modalTitle, { color: colors.text }]}>{title}</AppText>
          <AppText style={[styles.modalDesc, { color: colors.textSecondary }]}>{description}</AppText>
          <View style={styles.modalActions}>
            <Pressable onPress={onCancel} style={[styles.modalButton, styles.modalButtonCancel]}>
              <AppText style={[styles.modalButtonText, { color: colors.text }]}>{cancelText}</AppText>
            </Pressable>
            <Pressable onPress={() => { onConfirm(); }} style={[styles.modalButton, { backgroundColor: isDanger ? colors.danger : colors.primary }]}>
              <AppText style={[styles.modalButtonText, { color: "#FFF" }]}>{confirmText}</AppText>
            </Pressable>
          </View>
        </Pressable>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function SettingsScreen({ navigation, route }: any): React.JSX.Element {
  const { colors, isDark, setThemeMode } = useAppTheme();
  const { language, setLanguage, t } = useLanguage();
  const { isVoiceActive, toggleVoice } = useVoiceContext();
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionOffsetsRef = useRef<Record<string, number>>({});
  const requestedSection = route?.params?.section;

  const rememberSection = (section: string) => (event: any) => {
    sectionOffsetsRef.current[section] = event.nativeEvent.layout.y;
  };

  useEffect(() => {
    if (!requestedSection) return;
    const timer = setTimeout(() => {
      const y = sectionOffsetsRef.current[requestedSection] ?? 0;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [requestedSection]);
  
  const announce = (msgEn: string, msgHi: string) => {
    if (!talkbackOn) return;
    Speech.stop();
    const isHindi = language === "hindi";
    Speech.speak(isHindi ? msgHi : msgEn, { rate: 0.85, language: isHindi ? "hi-IN" : "en-US" });
  };
  
  const [contacts, setContacts] = useState<SOSContact[]>([]);
  const [newContactName, setNewContactName] = useState("");
  const [newContactNum, setNewContactNum] = useState("");

  const [hapticsOn, setHapticsOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [talkbackOn, setTalkbackOn] = useState(true);

  const [displayName, setDisplayName] = useState(auth().currentUser?.displayName || "");
  const [homeAddress, setHomeAddress] = useState("");
  const [editableAddress, setEditableAddress] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [tempAvatarUri, setTempAvatarUri] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<string>("Updating...");
  const [isSavingLoc, setIsSavingLoc] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [showLicense, setShowLicense] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([
      "@sos_contacts", 
      "@setting_haptics", 
      "@setting_voice",
      "@setting_talkback",
      "@echovision_home_address",
      "@echovision_current_location",
      "@echovision_profile_image",
    ]).then((values) => {
      values.forEach(([key, value]) => {
        if (value !== null) {
          if (key === "@sos_contacts") {
            try { setContacts(JSON.parse(value)); } catch (e) {}
          }
          if (key === "@setting_haptics") {
            const hOn = value === "true";
            setHapticsOn(hOn);
            setHapticsEnabled(hOn);
          }
          if (key === "@setting_voice") setVoiceOn(value === "true");
          if (key === "@setting_talkback") setTalkbackOn(value === "true");
          if (key === "@echovision_home_address") {
            setHomeAddress(value);
            setEditableAddress(value);
          }
          if (key === "@echovision_current_location") {
            setCurrentLocation(value);
          }
          if (key === "@echovision_profile_image") {
            setAvatarUri(value);
          }
        }
      });
    });
  }, []);

  const toggleHaptics = async () => {
    const newValue = !hapticsOn;
    setHapticsOn(newValue);
    setHapticsEnabled(newValue);
    await AsyncStorage.setItem("@setting_haptics", newValue.toString());
    announce("Haptics " + (newValue ? "enabled" : "disabled"), newValue ? "वाइब्रेशन चालू है" : "वाइब्रेशन बंद है");
    Toast.show({ type: "success", text1: language === "hindi" ? "सेटिंग्स अपडेट हो गई" : "Settings updated", text2: newValue ? (language === "hindi" ? "वाइब्रेशन चालू है" : "Haptics enabled") : (language === "hindi" ? "वाइब्रेशन बंद है" : "Haptics disabled") });
  };

  const toggleTalkback = async () => {
    const newValue = !talkbackOn;
    setTalkbackOn(newValue);
    await AsyncStorage.setItem("@setting_talkback", newValue.toString());
    const msg = newValue ? (language === "hindi" ? "टॉकबैक चालू है" : "TalkBack enabled") : (language === "hindi" ? "टॉकबैक बंद है" : "TalkBack disabled");
    if (newValue) {
      Speech.stop();
      Speech.speak(msg, { rate: 0.85, language: language === "hindi" ? "hi-IN" : "en-US" });
    }
    Toast.show({ type: "success", text1: language === "hindi" ? "सेटिंग्स अपडेट हो गई" : "Settings updated", text2: msg });
  };

  const toggleLanguage = async () => {
    const newLang = language === "english" ? "hindi" : "english";
    await setLanguage(newLang);
    triggerHaptic("light");
    if (talkbackOn) {
      Speech.stop();
      Speech.speak(newLang === "hindi" ? "भाषा हिंदी में बदल दी गई है" : "Language set to English", { rate: 0.85, language: newLang === "hindi" ? "hi-IN" : "en-US" });
    }
    Toast.show({ type: "success", text1: newLang === "hindi" ? "भाषा बदल दी गई है" : "Language updated", text2: newLang === "hindi" ? "भाषा हिंदी में बदल दी गई है" : "Language set to English" });
  };

  const saveContactsData = async (data: SOSContact[]) => {
    setContacts(data);
    await AsyncStorage.setItem("@sos_contacts", JSON.stringify(data));
  };

  const addContact = () => {
    if (!newContactName.trim() || !newContactNum.trim()) return;
    const isFirst = contacts.length === 0;
    const newC: SOSContact = {
      id: Date.now().toString(),
      name: newContactName.trim(),
      number: newContactNum.trim(),
      isPrimary: isFirst,
    };
    saveContactsData([...contacts, newC]);
    setNewContactName("");
    setNewContactNum("");
    setIsAddingContact(false);
    triggerHaptic("success");
    Toast.show({ type: "success", text1: "Contact saved", text2: `${newC.name} added to SOS list.` });
  };

  const removeContact = (id: string) => {
    setDeleteContactId(id);
    announce(
      "Are you sure you want to remove this contact? Cancel is on the left, Delete is on the right.",
      "क्या आप इस संपर्क को हटाना चाहते हैं? रद्द करें बाईं ओर है, डिलीट दाईं ओर है।"
    );
  };

  const confirmRemoveContact = () => {
    if (!deleteContactId) return;
    const filtered = contacts.filter((c) => c.id !== deleteContactId);
    if (filtered.length > 0 && !filtered.some((c) => c.isPrimary)) {
      filtered[0].isPrimary = true;
    }
    saveContactsData(filtered);
    triggerHaptic("medium");
    Toast.show({ type: "success", text1: "Contact removed" });
    setDeleteContactId(null);
  };

  const setPrimaryContact = (id: string) => {
    const updated = contacts.map(c => ({ ...c, isPrimary: c.id === id }));
    saveContactsData(updated);
    triggerHaptic("light");
    
    const newPrimary = updated.find(c => c.isPrimary);
    if (newPrimary) {
      announce(
        `Primary contact set to ${newPrimary.name}`,
        `प्राथमिक संपर्क ${newPrimary.name} पर सेट किया गया`
      );
    }
    
    Toast.show({ type: "success", text1: "Primary contact set" });
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        triggerHaptic("error");
        Toast.show({
          type: "error",
          text1: "Permission Denied",
          text2: "We need media library permission to upload your picture.",
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const pickedUri = result.assets[0].uri;
        triggerHaptic("success");
        setTempAvatarUri(pickedUri);
      }
    } catch (error) {
      triggerHaptic("error");
      Toast.show({
        type: "error",
        text1: "Upload Failed",
        text2: "An error occurred while picking the image.",
      });
    }
  };

  const removeImage = () => {
    triggerHaptic("light");
    setTempAvatarUri(null);
  };

  const saveProfile = async () => {
    if (auth().currentUser) {
      triggerHaptic("success");
      await auth().currentUser?.updateProfile({ 
        displayName, 
        photoURL: tempAvatarUri === null ? "" : tempAvatarUri 
      });
      
      if (tempAvatarUri !== avatarUri) {
        setAvatarUri(tempAvatarUri);
        if (tempAvatarUri) {
          await AsyncStorage.setItem("@echovision_profile_image", tempAvatarUri);
        } else {
          await AsyncStorage.setItem("@echovision_profile_image", "removed");
        }
      }

      if (editableAddress.trim() !== "") {
        await AsyncStorage.setItem("@echovision_home_address", editableAddress.trim());
        setHomeAddress(editableAddress.trim());
      }
      setIsEditingProfile(false);
      Toast.show({ type: "success", text1: "Profile saved", text2: "Your details have been updated." });
    }
  };

  const updateCurrentLocation = async () => {
    try {
      setIsSavingLoc(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error("Permission denied");

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const addressInfo = await Location.reverseGeocodeAsync(location.coords);
      
      if (addressInfo && addressInfo.length > 0) {
        const place = addressInfo[0];
        const parts = [place.street, place.district, place.city, place.region].filter(Boolean);
        const addrStr = parts.join(", ");
        
        setCurrentLocation(addrStr);
        await AsyncStorage.setItem("@echovision_current_location", addrStr);
        await AsyncStorage.setItem("@echovision_current_lat", location.coords.latitude.toString());
        await AsyncStorage.setItem("@echovision_current_lon", location.coords.longitude.toString());
        triggerHaptic("success");
        if (talkbackOn) Speech.speak(language === "hindi" ? "लोकेशन अपडेट हो गई है" : "Location updated", { rate: 0.85, language: language === "hindi" ? "hi-IN" : "en-US" });
        Toast.show({ type: "success", text1: "Location updated", text2: "Current location refreshed." });
      }
    } catch (e) {
      triggerHaptic("error");
      if (talkbackOn) Speech.speak(language === "hindi" ? "लोकेशन नहीं मिल पाई" : "Failed to grab location", { rate: 0.85, language: language === "hindi" ? "hi-IN" : "en-US" });
      Toast.show({ type: "error", text1: "Location Error", text2: "Failed to grab location." });
    } finally {
      setIsSavingLoc(false);
    }
  };

  const handleLogout = () => {
    triggerHaptic("medium");
    setLogoutModalVisible(true);
    announce(
      "Are you sure you want to log out? Cancel is on the left, Log Out is on the right.",
      "क्या आप सच में लॉग आउट करना चाहते हैं? रद्द करें बाईं ओर है, लॉग आउट दाईं ओर है।"
    );
  };

  const confirmLogout = async () => {
    try {
      setLogoutModalVisible(false);
      announce("Logging out", "लॉग आउट किया जा रहा है");
      triggerHaptic("warning");
      
      // Reset theme to system default upon logout
      setThemeMode("system");
      if (isVoiceActive) {
        toggleVoice();
      }
      await auth().signOut();
      navigation.reset({ index: 0, routes: [{ name: "AuthSelection" }] });
    } catch (e: any) {
      if (e.code === 'auth/no-current-user') {
        navigation.reset({ index: 0, routes: [{ name: "AuthSelection" }] });
      } else {
        console.error("Logout failed:", e);
        Toast.show({ type: "error", text1: "Logout failed", text2: "Please try again." });
      }
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <GridPattern color={colors.textSecondary} opacity={isDark ? 0.08 : 0.05} spacing={24} />
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <AppText style={[styles.profileName, { color: colors.text, marginBottom: 0 }]}>
              {language === "hindi" ? "सेटिंग्स" : "Settings"}
            </AppText>
            <Pressable 
              onPress={() => {
                triggerHaptic("light");
                navigation.goBack();
              }} 
              style={[styles.closeButton, { borderColor: colors.border }]}
            >
              <Feather name="x" size={20} color={colors.text} />
            </Pressable>
          </View>

          {/* Profile Section */}
          <View style={styles.profileSection} onLayout={rememberSection("profile")}>
            <SettingCard>
              <View style={styles.profileInfo}>
                {isEditingProfile ? (
                  <View style={{ gap: 12 }}>
                    <View style={{ alignItems: "center", marginBottom: 12 }}>
                      <Pressable onPress={pickImage} style={styles.largeAvatarContainer}>
                        {tempAvatarUri ? (
                          <Image source={{ uri: tempAvatarUri }} style={styles.largeAvatar} />
                        ) : (
                          <View style={[styles.largeAvatarPlaceholder, { backgroundColor: isDark ? "rgba(1, 113, 223, 0.15)" : "#E6F0FC" }]}>
                            <Feather name="user" size={32} color={colors.primary} />
                          </View>
                        )}
                        <View style={[styles.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
                          <Feather name="camera" size={11} color="#FFF" />
                        </View>
                      </Pressable>
                      {tempAvatarUri && (
                        <Pressable onPress={removeImage} style={{ marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(255,59,48,0.1)", borderRadius: 8 }}>
                          <AppText style={{ color: colors.danger, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Remove Image</AppText>
                        </Pressable>
                      )}
                    </View>
                    <View>
                      <AppText style={{ fontFamily: "Inter_600SemiBold", color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>Name</AppText>
                      <TextInput
                        style={[styles.nameInput, { color: colors.text, borderBottomColor: colors.border, marginRight: 0 }]}
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholder="Display Name"
                        placeholderTextColor={colors.textDisabled}
                        autoFocus
                        returnKeyType="next"
                      />
                    </View>
                    <View>
                      <AppText style={{ fontFamily: "Inter_600SemiBold", color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>Home Address</AppText>
                      <TextInput
                        style={[styles.nameInput, { color: colors.text, borderBottomColor: colors.border, marginRight: 0 }]}
                        value={editableAddress}
                        onChangeText={setEditableAddress}
                        placeholder="Enter Home Address"
                        placeholderTextColor={colors.textDisabled}
                        returnKeyType="done"
                        onSubmitEditing={saveProfile}
                      />
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
                      <Pressable 
                        onPress={() => {
                          setDisplayName(auth().currentUser?.displayName || "");
                          setEditableAddress(homeAddress || "");
                          setTempAvatarUri(avatarUri);
                          setIsEditingProfile(false);
                        }} 
                        style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: isDark ? "#333" : "#E5E5EA" }}
                      >
                        <AppText style={{ fontFamily: "Inter_700Bold", color: colors.text }}>Cancel</AppText>
                      </Pressable>
                      <Pressable onPress={saveProfile} style={[styles.inlineSaveBtn, { backgroundColor: colors.primary }]}>
                        <AppText style={styles.inlineSaveBtnText}>Save</AppText>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.profileCardContent}>
                    <View style={styles.largeAvatarContainer}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.largeAvatar} />
                      ) : (
                        <View style={[styles.largeAvatarPlaceholder, { backgroundColor: isDark ? "rgba(1, 113, 223, 0.15)" : "#E6F0FC" }]}>
                          <Feather name="user" size={32} color={colors.primary} />
                        </View>
                      )}
                    </View>
                    <View style={styles.profileCardDetails}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <AppText style={[styles.profileNameText, { color: colors.text }]} adjustsFontSizeToFit numberOfLines={1}>
                          {displayName || "User"}
                        </AppText>
                        <Pressable 
                          onPress={() => {
                            setTempAvatarUri(avatarUri);
                            setIsEditingProfile(true);
                          }} 
                          style={[styles.iconBtn, { backgroundColor: isDark ? "rgba(1,113,223,0.15)" : "rgba(1,113,223,0.08)" }]}
                        >
                          <Feather name="edit-2" size={15} color={colors.primary} />
                        </Pressable>
                      </View>
                      <AppText style={[styles.profileEmailText, { color: colors.textSecondary }]} numberOfLines={1}>
                        {auth().currentUser?.email || "No email linked"}
                      </AppText>
                      <AppText style={[styles.profileAddressText, { color: colors.textSecondary }]} numberOfLines={1}>
                        <AppText style={{ fontFamily: "Inter_700Bold", color: colors.text }}>Address: </AppText>
                        {homeAddress || "Not set"}
                      </AppText>
                    </View>
                  </View>
                )}
              </View>
            </SettingCard>
          </View>

          <View style={styles.listContainer}>
            
            <View onLayout={rememberSection("preferences")}>
              <SectionHeader title={t("preferences")} />
            </View>
            <SettingCard>
              <SettingRow 
                title={t("language")} 
                icon="globe"
                iconBg="#0171DF"
                rightElement={
                  <Pressable onPress={toggleLanguage} style={styles.rightControlRow}>
                    <AppText style={[styles.rightValueText, { color: colors.text }]}>{language === "english" ? "English" : "हिंदी"}</AppText>
                    <Feather name="chevron-down" size={16} color={colors.textSecondary} />
                  </Pressable>
                }
              />
              <Divider />
              <SettingRow 
                title={t("theme")} 
                icon="sun"
                iconBg="#8B5CF6"
                rightElement={<ThemeSelectorPill talkbackOn={talkbackOn} />}
              />
              <Divider />
              <SettingRow 
                title={t("font_size")} 
                icon="type"
                iconBg="#3CAE8B"
                rightElement={<TextSizeSelectorPill talkbackOn={talkbackOn} />}
              />
              <Divider />
              <SettingRow 
                title={t("haptic_feedback")} 
                icon="smartphone"
                iconBg="#FF5252"
                rightElement={<ModernSwitch value={hapticsOn} onValueChange={toggleHaptics} />}
              />
              <Divider />
              <View style={styles.locationWrapperRow} onLayout={rememberSection("location")}>
                <View style={styles.locationLeftRow}>
                  <View style={[styles.rowIconContainer, { backgroundColor: "#FFB300" }]}>
                    <Feather name="map-pin" size={16} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText style={[styles.settingText, { color: colors.text }]} adjustsFontSizeToFit numberOfLines={1}>
                      {language === "hindi" ? "वर्तमान स्थान" : "Current location"}
                    </AppText>
                    {currentLocation && (
                      <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
                        {currentLocation}
                      </AppText>
                    )}
                  </View>
                </View>
                <Pressable onPress={updateCurrentLocation} style={styles.rightControlRow}>
                  {isSavingLoc ? (
                    <ActivityIndicator size="small" color="#0171DF" />
                  ) : (
                    <>
                      <AppText style={[styles.rightValueText, { color: colors.primary }]} numberOfLines={1}>
                        {language === "hindi" ? "अपडेट करें" : "Update"}
                      </AppText>
                      <Feather name="refresh-cw" size={12} color={colors.primary} />
                    </>
                  )}
                </Pressable>
              </View>
            </SettingCard>
            
            <View style={{ marginTop: 24 }} />
            <View onLayout={rememberSection("voice")}>
              <SectionHeader title={language === "hindi" ? "आवाज़ (VOICE)" : "VOICE"} />
            </View>
            <SettingCard>
              <SettingRow 
                title={language === "hindi" ? "टॉकबैक फीडबैक" : "TalkBack Feedback"} 
                icon="volume-2"
                iconBg="#EC4899"
                rightElement={<ModernSwitch value={talkbackOn} onValueChange={toggleTalkback} />}
              />
            </SettingCard>
            
            <View style={{ marginTop: 24 }} />
            <View onLayout={rememberSection("contacts")}>
              <SectionHeader title={t("emergency_contact")} />
            </View>

            <SettingCard>
              {contacts.map((contact, idx) => (
                <View key={contact.id}>
                  <View style={[styles.settingRow, { paddingVertical: 12 }]}>
                    <Pressable onPress={() => setPrimaryContact(contact.id)} style={styles.radioHitbox}>
                      <View style={[styles.radioOuter, { borderColor: contact.isPrimary ? colors.primary : colors.textSecondary }]}>
                        {contact.isPrimary && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                      </View>
                    </Pressable>
                    <View style={{ flex: 1, paddingLeft: 12 }}>
                      <AppText style={{ fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text }}>{contact.name}</AppText>
                      <AppText style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary }}>{contact.number} {contact.isPrimary && "(Primary)"}</AppText>
                    </View>
                    <Pressable onPress={() => removeContact(contact.id)} style={{ padding: 8 }}>
                      <Feather name="trash-2" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                  <Divider />
                </View>
              ))}

              <View style={[styles.settingRow, { flexDirection: "column", alignItems: "stretch", paddingTop: 16 }]}>
                <Pressable onPress={() => setIsAddingContact(!isAddingContact)}>
                  <AppText style={[styles.settingText, { color: colors.primary, marginBottom: 12, fontSize: 15 }]}>
                    {isAddingContact 
                      ? (language === "hindi" ? "- रद्द करें" : "- Cancel Adding") 
                      : (language === "hindi" ? "+ नया संपर्क जोड़ें" : "+ Add New Contact")}
                  </AppText>
                </Pressable>
                
                {isAddingContact && (
                  <View style={styles.addContactForm}>
                    <TextInput
                      style={[styles.contactInput, { color: colors.text, borderBottomColor: colors.border }]}
                      placeholder="Name"
                      placeholderTextColor={colors.textDisabled}
                      value={newContactName}
                      onChangeText={setNewContactName}
                    />
                    <TextInput
                      style={[styles.contactInput, { color: colors.text, borderBottomColor: colors.border, marginTop: 12 }]}
                      placeholder="Phone number"
                      placeholderTextColor={colors.textDisabled}
                      keyboardType="phone-pad"
                      value={newContactNum}
                      onChangeText={setNewContactNum}
                    />
                    <Pressable onPress={addContact} style={[styles.addContactBtn, { backgroundColor: colors.primary }]}>
                      <AppText style={styles.addContactBtnText}>Save Contact</AppText>
                    </Pressable>
                  </View>
                )}
              </View>
            </SettingCard>

            <View style={{ marginTop: 24 }} />
            <View onLayout={rememberSection("legal")}>
              <SectionHeader title={language === "hindi" ? "कानूनी और नीतियां" : "LEGAL & POLICIES"} />
            </View>
            <SettingCard>
              <Pressable 
                onPress={() => {
                  triggerHaptic("light");
                  announce("Opening About EchoVision", "EchoVision के बारे में खोला जा रहा है");
                  navigation.navigate("LegalViewer", { 
                    title: language === "hindi" ? "EchoVision के बारे में" : "About EchoVision", 
                    content: language === "hindi" ? legalDocumentsHi.aboutApp : legalDocuments.aboutApp 
                  });
                }}
              >
                <SettingRow 
                  title={language === "hindi" ? "EchoVision के बारे में" : "About EchoVision"} 
                  icon="info"
                  iconBg="#0171DF"
                  rightElement={<Feather name="chevron-right" size={20} color={colors.textSecondary} />}
                />
              </Pressable>
              <Divider />
              <Pressable 
                onPress={() => {
                  triggerHaptic("light");
                  announce("Opening Privacy Policy", "प्राइवेसी पॉलिसी खोली जा रही है");
                  navigation.navigate("LegalViewer", { 
                    title: language === "hindi" ? "प्राइवेसी पॉलिसी" : "Privacy Policy", 
                    content: language === "hindi" ? legalDocumentsHi.privacyPolicy : legalDocuments.privacyPolicy 
                  });
                }}
              >
                <SettingRow 
                  title={language === "hindi" ? "प्राइवेसी पॉलिसी" : "Privacy Policy"} 
                  icon="shield"
                  iconBg="#00C4B4"
                  rightElement={<Feather name="chevron-right" size={20} color={colors.textSecondary} />}
                />
              </Pressable>
              <Divider />
              <Pressable 
                onPress={() => {
                  triggerHaptic("light");
                  announce("Opening Terms of Service", "सेवा की शर्तें खोली जा रही हैं");
                  navigation.navigate("LegalViewer", { 
                    title: language === "hindi" ? "सेवा की शर्तें" : "Terms of Service", 
                    content: language === "hindi" ? legalDocumentsHi.termsOfService : legalDocuments.termsOfService 
                  });
                }}
              >
                <SettingRow 
                  title={language === "hindi" ? "सेवा की शर्तें" : "Terms of Service"} 
                  icon="file-text"
                  iconBg="#8E44AD"
                  rightElement={<Feather name="chevron-right" size={20} color={colors.textSecondary} />}
                />
              </Pressable>
              <Divider />
              <Pressable 
                onPress={() => {
                  triggerHaptic("light");
                  announce("Opening Cookie Policy", "कुकी नीति खोली जा रही है");
                  navigation.navigate("LegalViewer", { 
                    title: language === "hindi" ? "कुकी नीति" : "Cookie Policy", 
                    content: language === "hindi" ? legalDocumentsHi.cookiePolicy : legalDocuments.cookiePolicy 
                  });
                }}
              >
                <SettingRow 
                  title={language === "hindi" ? "कुकी नीति" : "Cookie Policy"} 
                  icon="database"
                  iconBg="#F39C12"
                  rightElement={<Feather name="chevron-right" size={20} color={colors.textSecondary} />}
                />
              </Pressable>
              <Divider />
              <Pressable 
                onPress={() => {
                  triggerHaptic("light");
                  announce("Opening End-User License", "लाइसेंस खोला जा रहा है");
                  navigation.navigate("LegalViewer", { 
                    title: language === "hindi" ? "लाइसेंस" : "End-User License", 
                    content: language === "hindi" ? legalDocumentsHi.license : legalDocuments.license 
                  });
                }}
              >
                <SettingRow 
                  title={language === "hindi" ? "लाइसेंस" : "End-User License"} 
                  icon="award"
                  iconBg="#3498DB"
                  rightElement={<Feather name="chevron-right" size={20} color={colors.textSecondary} />}
                />
              </Pressable>
            </SettingCard>

            {/* Action Links Below List */}
            <View style={{ marginTop: 40, alignItems: "center", gap: 16 }} onLayout={rememberSection("logout")}>
              <Pressable style={[styles.logoutButton, { width: "100%", paddingVertical: 14 }]} onPress={handleLogout}>
                <Feather name="log-out" size={20} color="#FFF" style={{ marginRight: 8 }} />
                <AppText style={styles.logoutButtonText}>{t("logout")}</AppText>
              </Pressable>
            </View>
            
          </View>

          <View style={{ alignItems: "center", marginTop: 24, paddingBottom: 24 }}>
            <AppText style={{ fontSize: 13, color: colors.textSecondary }}>EchoVision v1.0.0</AppText>
          </View>
        </ScrollView>
      </View>

      <ConfirmationModal
        visible={logoutModalVisible}
        title={language === "hindi" ? "लॉग आउट" : "Log Out"}
        description={language === "hindi" ? "क्या आप सच में EchoVision से लॉग आउट करना चाहते हैं?" : "Are you sure you want to log out of EchoVision?"}
        confirmText={language === "hindi" ? "लॉग आउट" : "Log Out"}
        cancelText={language === "hindi" ? "रद्द करें" : "Cancel"}
        onConfirm={confirmLogout}
        onCancel={() => {
          triggerHaptic("light");
          announce("Logout cancelled", "लॉग आउट रद्द किया गया");
          setLogoutModalVisible(false);
        }}
        isDanger={true}
        colors={colors}
        isDark={isDark}
      />

      <ConfirmationModal
        visible={deleteContactId !== null}
        title={language === "hindi" ? "संपर्क हटाएं" : "Delete Contact"}
        description={language === "hindi" ? `क्या आप सच में ${contacts.find(c => c.id === deleteContactId)?.name || 'इस संपर्क'} को अपनी SOS सूची से हटाना चाहते हैं?` : `Are you sure you want to remove ${contacts.find(c => c.id === deleteContactId)?.name || 'this contact'} from your SOS list?`}
        confirmText={language === "hindi" ? "डिलीट" : "Delete"}
        cancelText={language === "hindi" ? "रद्द करें" : "Cancel"}
        onConfirm={confirmRemoveContact}
        onCancel={() => {
          triggerHaptic("light");
          announce("Contact deletion cancelled", "संपर्क हटाना रद्द किया गया");
          setDeleteContactId(null);
        }}
        isDanger={true}
        colors={colors}
        isDark={isDark}
      />

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 60 },
  
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 44 : 20,
  },

  settingCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 20,
  },

  profileSection: {
    paddingHorizontal: 24,
    marginTop: 20,
  },
  profileInfo: {
    width: "100%",
  },
  editProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileName: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 28,
    marginBottom: 4,
    flexShrink: 1,
  },
  iconBtn: {
    marginLeft: 12,
    padding: 6,
    borderRadius: 12,
  },
  nameInput: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    paddingVertical: 4,
    borderBottomWidth: 1,
    marginBottom: 4,
    marginRight: 12,
  },
  inlineSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  inlineSaveBtnText: {
    color: "#FFF",
    fontFamily: "Inter_700Bold",
  },
  profileSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },

  // Premium Profile Card Styles
  profileCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
  },
  largeAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  largeAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  profileCardDetails: {
    flex: 1,
    marginLeft: 16,
    gap: 4,
  },
  profileNameText: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 20,
    flexShrink: 1,
  },
  profileEmailText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    marginTop: -2,
  },
  profileAddressText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },

  listContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  sectionHeader: {
    fontFamily: "Inter_800ExtraBold",
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 8,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  settingText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    flexShrink: 1,
  },
  rowIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  locationWrapperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  locationLeftRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 16,
  },
  rightControlRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  rightValueText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    marginRight: 8,
  },
  divider: {
    height: 1,
    borderBottomWidth: 1,
  },

  // Switches (iOS-style standard size)
  switchTrack: {
    width: 48,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },

  // Theme Pill
  themePillContainer: {
    flexDirection: "row",
    borderRadius: 20,
    padding: 2,
  },
  themePillSegment: {
    width: 40,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },

  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: "#EF4444",
    borderRadius: 24,
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    width: "80%",
  },
  logoutButtonText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#FFF",
  },

  // Radio button for SOS
  radioHitbox: { padding: 4 },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    justifyContent: "center", alignItems: "center",
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },

  // Forms
  addContactForm: {
    paddingBottom: 8,
  },
  contactInput: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  addContactBtn: {
    marginTop: 16,
    backgroundColor: "#0171DF",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  addContactBtnText: {
    fontFamily: "Inter_700Bold",
    color: "#FFF",
    fontSize: 14,
  },

  footerLinks: {
    alignItems: "center",
    marginTop: 40,
    paddingBottom: 20,
  },
  footerText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginBottom: 4,
  },
  footerSubText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textDecorationLine: "underline",
    marginHorizontal: 10,
  },
  largeAvatarContainer: {
    position: "relative",
    width: 64,
    height: 64,
  },
  cameraBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  modalButtonCancel: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "rgba(150,150,150,0.3)",
  },
  modalButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
