import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Language = "english" | "hindi" | "hinglish";

type Translations = {
  [key: string]: {
    english: string;
    hindi: string;
    hinglish: string;
  };
};

const translations: Translations = {
  // Dashboard
  welcome_home: {
    english: "Welcome Home",
    hindi: "आपका स्वागत है",
    hinglish: "Aapka Swagat Hai",
  },
  welcome_to: {
    english: "Welcome to",
    hindi: "में आपका स्वागत है",
    hinglish: "Mein aapka swagat hai",
  },
  app_name: {
    english: "EchoVision",
    hindi: "ईको-विज़न",
    hinglish: "EchoVision",
  },
  tap_to_speak: {
    english: "Tap once to hear · Double-tap to open",
    hindi: "सुनने के लिए एक बार टैप करें · खोलने के लिए दो बार",
    hinglish: "Sunne ke liye ek baar tap karein · Kholne ke liye do baar",
  },
  
  // Navigation
  dashboard: {
    english: "Dashboard",
    hindi: "डैशबोर्ड",
    hinglish: "Dashboard",
  },
  scanner: {
    english: "Scanner",
    hindi: "स्कैनर",
    hinglish: "Scanner",
  },
  text_reader: {
    english: "Text Reader",
    hindi: "टेक्स्ट रीडर",
    hinglish: "Text Reader",
  },
  settings: {
    english: "Settings",
    hindi: "सेटिंग्स",
    hinglish: "Settings",
  },
  sos: {
    english: "SOS Emergency",
    hindi: "आपातकालीन SOS",
    hinglish: "Emergency SOS",
  },

  // Quadrant Subtitles
  scan_subtitle: {
    english: "Describe surroundings",
    hindi: "आसपास का वर्णन करें",
    hinglish: "Surroundings describe karein",
  },
  reader_subtitle: {
    english: "Read text aloud",
    hindi: "टेक्स्ट ज़ोर से पढ़ें",
    hinglish: "Text zor se padhein",
  },
  sos_subtitle: {
    english: "Broadcast Location & Call",
    hindi: "स्थान भेजें और कॉल करें",
    hinglish: "Location bhejein aur call karein",
  },
  settings_subtitle: {
    english: "App preferences",
    hindi: "ऐप प्राथमिकताएं",
    hinglish: "App preferences",
  },

  // Voice Assistant
  listening: {
    english: "Listening...",
    hindi: "सुन रहा हूँ...",
    hinglish: "Sun raha hoon...",
  },
  processing: {
    english: "Processing...",
    hindi: "प्रक्रिया हो रही है...",
    hinglish: "Processing ho rahi hai...",
  },
  hold_to_talk: {
    english: "Hold anywhere to talk",
    hindi: "बात करने के लिए कहीं भी दबा कर रखें",
    hinglish: "Baat karne ke liye daba kar rakhein",
  },
  release_to_send: {
    english: "Release to send",
    hindi: "भेजने के लिए छोड़ें",
    hinglish: "Bhejne ke liye chhodein",
  },

  // Scene Scanner
  scene_scanner: {
    english: "Scene Scanner",
    hindi: "दृश्य स्कैनर",
    hinglish: "Scene Scanner",
  },
  point_camera: {
    english: "Point your camera at the scene",
    hindi: "अपना कैमरा दृश्य की ओर करें",
    hinglish: "Apna camera scene ki taraf karein",
  },
  double_tap_capture: {
    english: "Double tap to capture",
    hindi: "तस्वीर खींचने के लिए दो बार टैप करें",
    hinglish: "Capture karne ke liye double tap karein",
  },
  analyzing_scene: {
    english: "Analyzing scene...",
    hindi: "दृश्य का विश्लेषण हो रहा है...",
    hinglish: "Scene analyze ho raha hai...",
  },
  capturing: {
    english: "Capturing...",
    hindi: "तस्वीर ली जा रही है...",
    hinglish: "Capturing...",
  },
  describing_aloud: {
    english: "Describing Aloud...",
    hindi: "ज़ोर से वर्णन किया जा रहा है...",
    hinglish: "Describe kiya ja raha hai...",
  },
  please_wait: {
    english: "Please wait a moment.",
    hindi: "कृपया कुछ क्षण प्रतीक्षा करें।",
    hinglish: "Please thoda wait karein.",
  },
  scan_again: {
    english: "Scan Again",
    hindi: "फिर से स्कैन करें",
    hinglish: "Phir se scan karein",
  },
  replay_audio: {
    english: "Replay Audio",
    hindi: "ऑडियो फिर से चलाएँ",
    hinglish: "Audio replay karein",
  },
  describe_scene: {
    english: "Describe Scene",
    hindi: "दृश्य का वर्णन करें",
    hinglish: "Scene describe karein",
  },
  read_text_btn: {
    english: "Read Text",
    hindi: "टेक्स्ट पढ़ें",
    hinglish: "Text padhein",
  },
  reading_aloud: {
    english: "Reading Aloud...",
    hindi: "ज़ोर से पढ़ा जा रहा है...",
    hinglish: "Reading aloud...",
  },

  // Settings
  preferences: {
    english: "Preferences",
    hindi: "प्राथमिकताएं",
    hinglish: "Preferences",
  },
  appearance: {
    english: "Appearance",
    hindi: "दिखावट",
    hinglish: "Appearance",
  },
  accessibility: {
    english: "Accessibility",
    hindi: "पहुंच-योग्यता",
    hinglish: "Accessibility",
  },
  about: {
    english: "About",
    hindi: "के बारे में",
    hinglish: "About",
  },
  licenses: {
    english: "Licenses",
    hindi: "लाइसेंस",
    hinglish: "Licenses",
  },
  language: {
    english: "Language",
    hindi: "भाषा",
    hinglish: "Language",
  },
  voice_feedback: {
    english: "Voice Feedback",
    hindi: "आवाज़ प्रतिक्रिया",
    hinglish: "Voice Feedback",
  },
  haptic_feedback: {
    english: "Haptic Feedback",
    hindi: "वाइब्रेशन (Haptics)",
    hinglish: "Haptic Vibration",
  },
  font_size: {
    english: "Font Size",
    hindi: "फ़ॉन्ट का आकार",
    hinglish: "Font Size",
  },
  emergency_contact: {
    english: "Emergency Contact",
    hindi: "आपातकालीन संपर्क",
    hinglish: "Emergency Contact",
  },
  save_contact: {
    english: "Save Contact",
    hindi: "संपर्क सहेजें",
    hinglish: "Contact Save Karein",
  },
  saved: {
    english: "Saved!",
    hindi: "सहेज लिया गया!",
    hinglish: "Save ho gaya!",
  },
  theme: {
    english: "Theme",
    hindi: "थीम",
    hinglish: "Theme",
  },
  light: {
    english: "Light",
    hindi: "लाइट",
    hinglish: "Light",
  },
  dark: {
    english: "Dark",
    hindi: "डार्क",
    hinglish: "Dark",
  },
  system: {
    english: "System",
    hindi: "सिस्टम",
    hinglish: "System",
  },
  profile: {
    english: "Profile",
    hindi: "प्रोफ़ाइल",
    hinglish: "Profile",
  },
  display_name: {
    english: "Display Name",
    hindi: "दिखाने वाला नाम",
    hinglish: "Display Name",
  },
  logout: {
    english: "Logout",
    hindi: "लॉग आउट",
    hinglish: "Logout",
  },
  saving: {
    english: "Saving...",
    hindi: "सेव किया जा रहा है...",
    hinglish: "Save ho raha hai...",
  },

  // SOS
  emergency_mode: {
    english: "EMERGENCY MODE",
    hindi: "आपातकालीन मोड",
    hinglish: "EMERGENCY MODE",
  },
  slide_to_call: {
    english: "Slide right to Call",
    hindi: "कॉल करने के लिए दाईं ओर स्लाइड करें",
    hinglish: "Call karne ke liye right slide karein",
  },
  calling_help: {
    english: "Calling for help...",
    hindi: "मदद के लिए कॉल किया जा रहा है...",
    hinglish: "Help ke liye call kar rahe hain...",
  },
  sos_ready: {
    english: "SOS Ready",
    hindi: "आपातकाल के लिए तैयार",
    hinglish: "SOS Ready",
  },
  
  // Generic
  error_try_again: {
    english: "Error. Please try again.",
    hindi: "त्रुटि। कृपया पुनः प्रयास करें।",
    hinglish: "Error aaya. Phir se try karein.",
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
      if (val === "english" || val === "hindi" || val === "hinglish") {
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
