import React, { useState, useEffect } from "react";
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
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import auth from "@react-native-firebase/auth";
import * as Location from "expo-location";
import Toast from "react-native-toast-message";

import { useAppTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";

// ═══════════════════════════════════════════════════════════════════════════
// Custom Switch (Flat Style)
// ═══════════════════════════════════════════════════════════════════════════

function ModernSwitch({ value, onValueChange, activeColor = "#1D74F5" }: { value: boolean, onValueChange: () => void, activeColor?: string }) {
  const { colors } = useAppTheme();
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
    outputRange: [2, 22],
  });

  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#E5E5EA", activeColor],
  });

  return (
    <Pressable onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

function ThemeSelectorPill() {
  const { themeMode, setThemeMode, colors, isDark } = useAppTheme();

  const handleSelect = (mode: "system" | "light" | "dark") => {
    setThemeMode(mode);
    Haptics.selectionAsync();
    Toast.show({ type: "success", text1: "Theme updated", text2: `Set to ${mode} mode.` });
  };

  const getBg = (mode: "system" | "light" | "dark") => (themeMode === mode ? (isDark ? "#333" : "#FFF") : "transparent");
  const getIconColor = (mode: "system" | "light" | "dark") => (themeMode === mode ? colors.text : colors.textSecondary);

  return (
    <View style={[styles.themePillContainer, { backgroundColor: isDark ? "#111" : "#EFEFF0" }]}>
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

function TextSizeSelectorPill() {
  const { textSize, setTextSize, colors, isDark } = useAppTheme();

  const handleSelect = (size: "small" | "medium" | "large") => {
    setTextSize(size);
    Haptics.selectionAsync();
    Toast.show({ type: "success", text1: "Text size updated", text2: `Set to ${size}.` });
  };

  const getBg = (size: "small" | "medium" | "large") => (textSize === size ? (isDark ? "#333" : "#FFF") : "transparent");
  const getIconColor = (size: "small" | "medium" | "large") => (textSize === size ? colors.text : colors.textSecondary);

  return (
    <View style={[styles.themePillContainer, { backgroundColor: isDark ? "#111" : "#EFEFF0" }]}>
      <Pressable onPress={() => handleSelect("small")} style={[styles.themePillSegment, { backgroundColor: getBg("small") }]}>
        <Text style={{ fontFamily: "Nunito_700Bold", color: getIconColor("small"), fontSize: 12 }}>A</Text>
      </Pressable>
      <Pressable onPress={() => handleSelect("medium")} style={[styles.themePillSegment, { backgroundColor: getBg("medium") }]}>
        <Text style={{ fontFamily: "Nunito_700Bold", color: getIconColor("medium"), fontSize: 16 }}>A</Text>
      </Pressable>
      <Pressable onPress={() => handleSelect("large")} style={[styles.themePillSegment, { backgroundColor: getBg("large") }]}>
        <Text style={{ fontFamily: "Nunito_700Bold", color: getIconColor("large"), fontSize: 20 }}>A</Text>
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface SOSContact {
  id: string;
  name: string;
  number: string;
  isPrimary: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function SettingsScreen({ navigation }: any): React.JSX.Element {
  const { colors, isDark } = useAppTheme();
  const { language, setLanguage, t } = useLanguage();
  
  const [contacts, setContacts] = useState<SOSContact[]>([]);
  const [newContactName, setNewContactName] = useState("");
  const [newContactNum, setNewContactNum] = useState("");

  const [hapticsOn, setHapticsOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [talkbackOn, setTalkbackOn] = useState(true);

  const [displayName, setDisplayName] = useState(auth().currentUser?.displayName || "");
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const [homeAddress, setHomeAddress] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);
  const [editableAddress, setEditableAddress] = useState("");
  const [isSavingLoc, setIsSavingLoc] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [showLicense, setShowLicense] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([
      "@sos_contacts", 
      "@setting_haptics", 
      "@setting_voice",
      "@setting_talkback",
      "@echovision_home_address",
    ]).then((values) => {
      values.forEach(([key, value]) => {
        if (value !== null) {
          if (key === "@sos_contacts") {
            try { setContacts(JSON.parse(value)); } catch (e) {}
          }
          if (key === "@setting_haptics") setHapticsOn(value === "true");
          if (key === "@setting_voice") setVoiceOn(value === "true");
          if (key === "@setting_talkback") setTalkbackOn(value === "true");
          if (key === "@echovision_home_address") {
            setHomeAddress(value);
            setEditableAddress(value);
          }
        }
      });
    });
  }, []);
  // ── Handlers ──

  const toggleHaptics = async () => {
    const newValue = !hapticsOn;
    setHapticsOn(newValue);
    await AsyncStorage.setItem("@setting_haptics", newValue.toString());
    Toast.show({ type: "success", text1: "Settings updated", text2: `Haptics feedback ${newValue ? "enabled" : "disabled"}.` });
  };

  const toggleVoice = async () => {
    const newValue = !voiceOn;
    setVoiceOn(newValue);
    await AsyncStorage.setItem("@setting_voice", newValue.toString());
    Toast.show({ type: "success", text1: "Settings updated", text2: `Voice Assistant ${newValue ? "enabled" : "disabled"}.` });
  };

  const toggleTalkback = async () => {
    const newValue = !talkbackOn;
    setTalkbackOn(newValue);
    await AsyncStorage.setItem("@setting_talkback", newValue.toString());
    Toast.show({ type: "success", text1: "Settings updated", text2: `TalkBack ${newValue ? "enabled" : "disabled"}.` });
  };

  const toggleLanguage = async () => {
    const newLang = language === "english" ? "hindi" : "english";
    await setLanguage(newLang);
    Haptics.selectionAsync();
    Toast.show({ type: "success", text1: "Language updated", text2: `Language set to ${newLang === "english" ? "English" : "Hindi"}.` });
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Toast.show({ type: "success", text1: "Contact saved", text2: `${newC.name} added to SOS list.` });
  };

  const removeContact = (id: string) => {
    const filtered = contacts.filter((c) => c.id !== id);
    if (filtered.length > 0 && !filtered.some((c) => c.isPrimary)) {
      filtered[0].isPrimary = true;
    }
    saveContactsData(filtered);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Toast.show({ type: "success", text1: "Contact removed" });
  };

  const setPrimaryContact = (id: string) => {
    const updated = contacts.map(c => ({ ...c, isPrimary: c.id === id }));
    saveContactsData(updated);
    Haptics.selectionAsync();
    Toast.show({ type: "success", text1: "Primary contact set" });
  };

  const saveProfile = async () => {
    if (auth().currentUser) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await auth().currentUser?.updateProfile({ displayName });
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Toast.show({ type: "success", text1: "Location updated", text2: "Current location refreshed." });
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Toast.show({ type: "error", text1: "Location Error", text2: "Failed to grab location." });
    } finally {
      setIsSavingLoc(false);
    }
  };

  const handleLogout = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await auth().signOut();
  };

  // Render Helpers
  const SettingRow = ({ title, rightElement }: { title: string, rightElement: React.ReactNode }) => (
    <View style={styles.settingRow}>
      <Text style={[styles.settingText, { color: colors.text }]}>{title}</Text>
      {rightElement}
    </View>
  );

  const Divider = () => <View style={[styles.divider, { borderBottomColor: isDark ? "#222" : "#F0F0F0" }]} />;

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={[styles.sectionHeader, { color: colors.primary }]}>{title}</Text>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={[styles.container, { backgroundColor: isDark ? "#000" : "#FFF" }]}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        


        {/* Profile Section (No Avatar) */}
        <View style={styles.profileSection}>
          <View style={styles.profileInfo}>
            {isEditingProfile ? (
              <View>
                <View style={styles.editProfileRow}>
                  <TextInput
                    style={[styles.nameInput, { color: colors.text, borderBottomColor: colors.border }]}
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Display Name"
                    placeholderTextColor={colors.textDisabled}
                    autoFocus
                    returnKeyType="next"
                  />
                  <Pressable onPress={saveProfile} style={styles.inlineSaveBtn}>
                    <Text style={styles.inlineSaveBtnText}>Save</Text>
                  </Pressable>
                </View>
                <TextInput
                  style={[styles.nameInput, { color: colors.text, borderBottomColor: colors.border, marginTop: 8 }]}
                  value={editableAddress}
                  onChangeText={setEditableAddress}
                  placeholder="Enter Home Address"
                  placeholderTextColor={colors.textDisabled}
                  returnKeyType="done"
                  onSubmitEditing={saveProfile}
                />
              </View>
            ) : (
              <View style={styles.editProfileRow}>
                <Text style={[styles.profileName, { color: colors.text }]}>{displayName || "User"}</Text>
                <Pressable onPress={() => setIsEditingProfile(true)} style={styles.iconBtn}>
                  <Feather name="edit-2" size={16} color={colors.primary} />
                </Pressable>
              </View>
            )}
            {!isEditingProfile && (
              <Text style={[styles.profileSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                <Text style={{ fontFamily: "Nunito_700Bold", color: colors.text }}>Address: </Text>
                {homeAddress || "Not set"}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.listContainer}>
          
          <SectionHeader title="PREFERENCES" />
          
          <SettingRow 
            title="Language" 
            rightElement={
              <Pressable onPress={toggleLanguage} style={styles.rightControlRow}>
                <Text style={[styles.rightValueText, { color: colors.text }]}>{language === "english" ? "English" : "Hindi"}</Text>
                <Feather name="chevron-down" size={16} color={colors.textSecondary} />
              </Pressable>
            }
          />
          <Divider />
          <SettingRow 
            title="Theme" 
            rightElement={<ThemeSelectorPill />}
          />
          <Divider />
          <SettingRow 
            title="Text Size" 
            rightElement={<TextSizeSelectorPill />}
          />
          <Divider />
          <SettingRow 
            title="Haptics feedback" 
            rightElement={<ModernSwitch value={hapticsOn} onValueChange={toggleHaptics} />}
          />
          <Divider />
          <View style={[styles.settingRow, { alignItems: "flex-start" }]}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={[styles.settingText, { color: colors.text }]}>Current location</Text>
              {currentLocation && (
                <Text style={{ fontFamily: "Nunito_400Regular", fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
                  {currentLocation}
                </Text>
              )}
            </View>
            <Pressable onPress={updateCurrentLocation} style={styles.rightControlRow}>
              {isSavingLoc ? (
                <ActivityIndicator size="small" color="#1D74F5" />
              ) : (
                <>
                  <Text style={[styles.rightValueText, { color: colors.primary }]} numberOfLines={1}>
                    Update
                  </Text>
                  <Feather name="map-pin" size={16} color={colors.primary} />
                </>
              )}
            </Pressable>
          </View>
          
          <View style={{ marginTop: 24 }} />
          <SectionHeader title="VOICE" />

          <SettingRow 
            title="Voice Assistant" 
            rightElement={<ModernSwitch value={voiceOn} onValueChange={toggleVoice} />}
          />
          <Divider />
          <SettingRow 
            title="TalkBack Feedback" 
            rightElement={<ModernSwitch value={talkbackOn} onValueChange={toggleTalkback} />}
          />
          
          <View style={{ marginTop: 24 }} />
          <SectionHeader title="EMERGENCY SOS" />

          {contacts.map((contact, idx) => (
            <View key={contact.id}>
              <View style={[styles.settingRow, { paddingVertical: 12 }]}>
                <Pressable onPress={() => setPrimaryContact(contact.id)} style={styles.radioHitbox}>
                  <View style={[styles.radioOuter, { borderColor: contact.isPrimary ? "#1D74F5" : colors.textSecondary }]}>
                    {contact.isPrimary && <View style={[styles.radioInner, { backgroundColor: "#1D74F5" }]} />}
                  </View>
                </Pressable>
                <View style={{ flex: 1, paddingLeft: 12 }}>
                  <Text style={{ fontFamily: "Nunito_600SemiBold", fontSize: 16, color: colors.text }}>{contact.name}</Text>
                  <Text style={{ fontFamily: "Nunito_400Regular", fontSize: 13, color: colors.textSecondary }}>{contact.number} {contact.isPrimary && "(Primary)"}</Text>
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
              <Text style={[styles.settingText, { color: colors.primary, marginBottom: 12, fontSize: 15 }]}>
                {isAddingContact ? "− Cancel Adding" : "+ Add New Contact"}
              </Text>
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
                <Pressable onPress={addContact} style={styles.addContactBtn}>
                  <Text style={styles.addContactBtnText}>Save Contact</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Action Links Below List */}
          <View style={{ marginTop: 40, alignItems: "center" }}>
            <Pressable style={styles.logoutButton} onPress={handleLogout}>
              <Feather name="log-out" size={20} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.logoutButtonText}>Logout</Text>
            </Pressable>
          </View>
          
        </View>

        {/* Footer Links */}
        <View style={styles.footerLinks}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>Version 1.0.0</Text>
          <Pressable onPress={() => setShowLicense(true)}>
            <Text style={[styles.footerText, { color: colors.textSecondary, textDecorationLine: "underline" }]}>License & Policies</Text>
          </Pressable>
          <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 8 }}>
            <Text style={[styles.footerSubText, { color: colors.textSecondary }]}>User regulations</Text>
            <Text style={[styles.footerSubText, { color: colors.textSecondary }]}>Privacy and cookies</Text>
          </View>
        </View>

      </ScrollView>

      {/* License Modal */}
      <Modal visible={showLicense} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowLicense(false)}>
        <View style={[styles.container, { backgroundColor: isDark ? "#111" : "#F9F9F9", paddingTop: Platform.OS === "ios" ? 20 : 40 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontFamily: "Nunito_700Bold", fontSize: 20, color: colors.text }}>License & Policies</Text>
            <Pressable onPress={() => setShowLicense(false)} style={{ padding: 4 }}>
              <Feather name="x" size={24} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={{ fontFamily: "Nunito_400Regular", fontSize: 14, color: colors.text, lineHeight: 22 }}>
              <Text style={{ fontFamily: "Nunito_700Bold", fontSize: 16 }}>EchoVision App License Agreement</Text>
              {"\n\n"}
              This software is provided "as is", without warranty of any kind, express or implied. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability arising from, out of, or in connection with the software.
              {"\n\n"}
              The EchoVision app is intended as an accessibility aid and does not replace professional medical or navigational assistance. Users are responsible for their own safety and should not rely exclusively on the app's output in potentially dangerous situations.
              {"\n\n"}
              All third-party services (such as NVIDIA NIM, Sarvam AI, and Deepgram) are governed by their respective terms of service and privacy policies.
            </Text>
          </ScrollView>
        </View>
      </Modal>

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
  },
  profileName: {
    fontFamily: "Nunito_700Bold",
    fontSize: 26,
    marginBottom: 4,
  },
  iconBtn: {
    marginLeft: 12,
    padding: 6,
    backgroundColor: "rgba(29, 116, 245, 0.1)",
    borderRadius: 16,
  },
  nameInput: {
    flex: 1,
    fontFamily: "Nunito_700Bold",
    fontSize: 16,
    paddingVertical: 4,
    borderBottomWidth: 1,
    marginBottom: 4,
    marginRight: 12,
  },
  inlineSaveBtn: {
    backgroundColor: "#1D74F5",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  inlineSaveBtnText: {
    color: "#FFF",
    fontFamily: "Nunito_700Bold",
  },
  profileSubtitle: {
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
  },

  listContainer: {
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  sectionHeader: {
    fontFamily: "Nunito_800ExtraBold",
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  settingText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 16,
  },
  rightControlRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  rightValueText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    marginRight: 8,
  },
  divider: {
    height: 1,
    borderBottomWidth: 1,
  },

  // Switches
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
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

  // Sliders Mockup
  sliderMockup: {
    flexDirection: "row",
    alignItems: "center",
    width: 120,
  },
  sliderTrack: {
    flex: 1,
    height: 2,
    marginHorizontal: 8,
    justifyContent: "center",
  },
  sliderThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#CCC",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
    position: "absolute",
    left: "50%",
    transform: [{ translateX: -8 }],
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
    fontFamily: "Nunito_700Bold",
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
    fontFamily: "Nunito_400Regular",
    fontSize: 15,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  addContactBtn: {
    marginTop: 16,
    backgroundColor: "#1D74F5",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  addContactBtnText: {
    fontFamily: "Nunito_700Bold",
    color: "#FFF",
    fontSize: 14,
  },

  footerLinks: {
    alignItems: "center",
    marginTop: 40,
    paddingBottom: 20,
  },
  footerText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
    marginBottom: 4,
  },
  footerSubText: {
    fontFamily: "Nunito_500Medium",
    fontSize: 11,
    textDecorationLine: "underline",
    marginHorizontal: 10,
  },
});
