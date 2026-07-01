import * as Speech from "expo-speech";

export const speakAnnouncement = (text: string, language: string = "english") => {
  const isHindi = language === "hindi";
  Speech.speak(text, {
    language: isHindi ? "hi-IN" : "en-US",
    rate: isHindi ? 0.85 : 1.0,
  });
};

export const stopAnnouncement = () => {
  Speech.stop();
};
