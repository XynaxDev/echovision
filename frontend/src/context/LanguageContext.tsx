import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Language = "english" | "hindi";

type Translations = {
  [key: string]: {
    english: string;
    hindi: string;
  };
};

const translations: Translations = {
  // Dashboard
  welcome_home: {
    english: "Welcome Home",
    hindi: "आपका स्वागत है",
  },
  welcome_to: {
    english: "Welcome to",
    hindi: "में आपका स्वागत है",
  },
  app_name: {
    english: "EchoVision",
    hindi: "ईको-विज़न",
  },
  tap_to_speak: {
    english: "Tap once to hear · Double-tap to open",
    hindi: "सुनने के लिए एक बार टैप करें · खोलने के लिए दो बार",
  },
  
  // Navigation
  dashboard: {
    english: "Dashboard",
    hindi: "डैशबोर्ड",
  },
  scanner: {
    english: "Scanner",
    hindi: "स्कैनर",
  },
  text_reader: {
    english: "Text Reader",
    hindi: "टेक्स्ट रीडर",
  },
  settings: {
    english: "Settings",
    hindi: "सेटिंग्स",
  },
  sos: {
    english: "SOS Emergency",
    hindi: "आपातकालीन SOS",
  },

  // Quadrant Subtitles
  scan_subtitle: {
    english: "Describe surroundings",
    hindi: "आसपास का वर्णन करें",
  },
  reader_subtitle: {
    english: "Read text aloud",
    hindi: "टेक्स्ट ज़ोर से पढ़ें",
  },
  sos_subtitle: {
    english: "Broadcast Location & Call",
    hindi: "स्थान भेजें और कॉल करें",
  },
  settings_subtitle: {
    english: "App preferences",
    hindi: "ऐप प्राथमिकताएं",
  },

  // Voice Assistant
  listening: {
    english: "Listening...",
    hindi: "सुन रही हूँ...",
  },
  processing: {
    english: "Processing...",
    hindi: "प्रक्रिया हो रही है...",
  },
  hold_to_talk: {
    english: "Hold anywhere to talk",
    hindi: "बात करने के लिए कहीं भी दबा कर रखें",
  },
  release_to_send: {
    english: "Release to send",
    hindi: "भेजने के लिए छोड़ें",
  },

  // Scene Scanner
  scene_scanner: {
    english: "Scene Scanner",
    hindi: "दृश्य स्कैनर",
  },
  point_camera: {
    english: "Point your camera at the scene",
    hindi: "अपना कैमरा दृश्य की ओर करें",
  },
  double_tap_capture: {
    english: "Double tap to capture",
    hindi: "तस्वीर खींचने के लिए दो बार टैप करें",
  },
  analyzing_scene: {
    english: "Analyzing scene...",
    hindi: "दृश्य का विश्लेषण हो रहा है...",
  },
  capturing: {
    english: "Capturing...",
    hindi: "तस्वीर ली जा रही है...",
  },
  describing_aloud: {
    english: "Describing Aloud...",
    hindi: "ज़ोर से वर्णन किया जा रहा है...",
  },
  please_wait: {
    english: "Please wait a moment.",
    hindi: "कृपया कुछ क्षण प्रतीक्षा करें।",
  },
  scan_again: {
    english: "Scan Again",
    hindi: "फिर से स्कैन करें",
  },
  replay_audio: {
    english: "Replay Audio",
    hindi: "ऑडियो फिर से चलाएँ",
  },
  describe_scene: {
    english: "Describe Scene",
    hindi: "दृश्य का वर्णन करें",
  },
  read_text_btn: {
    english: "Read Text",
    hindi: "टेक्स्ट पढ़ें",
  },
  reading_aloud: {
    english: "Reading Aloud...",
    hindi: "ज़ोर से पढ़ा जा रहा है...",
  },

  // Settings
  preferences: {
    english: "Preferences",
    hindi: "प्राथमिकताएं",
  },
  appearance: {
    english: "Appearance",
    hindi: "दिखावट",
  },
  accessibility: {
    english: "Accessibility",
    hindi: "पहुंच-योग्यता",
  },
  about: {
    english: "About",
    hindi: "के बारे में",
  },
  licenses: {
    english: "Licenses",
    hindi: "लाइसेंस",
  },
  language: {
    english: "Language",
    hindi: "भाषा",
  },
  voice_feedback: {
    english: "Voice Feedback",
    hindi: "आवाज़ प्रतिक्रिया",
  },
  haptic_feedback: {
    english: "Haptic Feedback",
    hindi: "वाइब्रेशन (Haptics)",
  },
  font_size: {
    english: "Font Size",
    hindi: "फ़ॉन्ट का आकार",
  },
  emergency_contact: {
    english: "Emergency Contact",
    hindi: "आपातकालीन संपर्क",
  },
  save_contact: {
    english: "Save Contact",
    hindi: "संपर्क सहेजें",
  },
  saved: {
    english: "Saved!",
    hindi: "सहेज लिया गया!",
  },
  theme: {
    english: "Theme",
    hindi: "थीम",
  },
  light: {
    english: "Light",
    hindi: "लाइट",
  },
  dark: {
    english: "Dark",
    hindi: "डार्क",
  },
  system: {
    english: "System",
    hindi: "सिस्टम",
  },
  profile: {
    english: "Profile",
    hindi: "प्रोफ़ाइल",
  },
  display_name: {
    english: "Display Name",
    hindi: "दिखाने वाला नाम",
  },
  logout: {
    english: "Logout",
    hindi: "लॉग आउट",
  },
  saving: {
    english: "Saving...",
    hindi: "सेव किया जा रहा है...",
  },

  // SOS
  emergency_mode: {
    english: "EMERGENCY MODE",
    hindi: "आपातकालीन मोड",
  },
  slide_to_call: {
    english: "Slide right to Call",
    hindi: "कॉल करने के लिए दाईं ओर स्लाइड करें",
  },
  calling_help: {
    english: "Calling for help...",
    hindi: "मदद के लिए कॉल किया जा रहा है...",
  },
  sos_ready: {
    english: "SOS Ready",
    hindi: "आपातकाल के लिए तैयार",
  },
  
  // Generic
  error_try_again: {
    english: "Error. Please try again.",
    hindi: "त्रुटि। कृपया पुनः प्रयास करें।",
  }
};

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>("hindi"); // Default

  useEffect(() => {
    AsyncStorage.getItem("@echovision_language").then((val) => {
      if (val === "english" || val === "hindi") {
        setLanguageState(val);
      }
    });
  }, []);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    await AsyncStorage.setItem("@echovision_language", lang);
  };

  const t = (key: string): string => {
    if (translations[key] && translations[key][language]) {
      return translations[key][language];
    }
    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
