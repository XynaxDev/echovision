import React from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { RouteProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useAppTheme } from "../context/ThemeContext";
import { AppText } from "../components/AppText";
import * as Speech from "expo-speech";
import { useLanguage } from "../context/LanguageContext";
import { useVoiceContext } from "../context/VoiceContext";
import { Feather } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { triggerHaptic } from "../utils/haptics";

type LegalViewerScreenRouteProp = RouteProp<RootStackParamList, "LegalViewer">;

interface Props {
  route: LegalViewerScreenRouteProp;
  navigation: any;
}

export function LegalViewerScreen({ route, navigation }: Props) {
  const { content } = route.params;
  const { colors } = useAppTheme();
  const { language } = useLanguage();
  const { isVoiceActive } = useVoiceContext();
  const [isSpeaking, setIsSpeaking] = React.useState(false);

  React.useEffect(() => {
    // Stop speech if assistant activates
    if (isVoiceActive) {
      Speech.stop();
      setIsSpeaking(false);
    }
  }, [isVoiceActive]);

  React.useEffect(() => {
    // Stop speech when leaving the screen
    return () => {
      Speech.stop();
    };
  }, []);

  const toggleSpeech = () => {
    triggerHaptic("light");
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
    } else {
      Speech.stop();
      setIsSpeaking(true);
      // Clean up the markdown syntax for better speech
      // Replacing • with a space so it doesn't read out "dot"
      const cleanText = content.replace(/\*\*/g, "").replace(/\*/g, "").replace(/•/g, " ");
      Speech.speak(cleanText, {
        language: language === "hindi" ? "hi-IN" : "en-US",
        rate: 0.85,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable 
          onPress={toggleSpeech} 
          style={{ marginRight: 16, padding: 8, backgroundColor: isSpeaking ? colors.primary : "transparent", borderRadius: 20 }}
        >
          <Feather name={isSpeaking ? "volume-x" : "volume-2"} size={22} color={isSpeaking ? "#FFF" : colors.text} />
        </Pressable>
      ),
    });
  }, [navigation, isSpeaking, colors]);

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {content.split("\n").map((line, lineIndex) => {
          if (!line) return <View key={lineIndex} style={{ height: 16 }} />;
          
          const isBullet = line.startsWith("• ");
          const textContent = isBullet ? line.substring(2) : line;
          
          // Simple Markdown parser for **bold** and *italic*
          const parseMarkdown = (text: string) => {
            const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
            return parts.map((part, i) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                return (
                  <AppText key={i} style={[styles.text, { color: colors.text, fontFamily: "Inter_700Bold" }]}>
                    {part.slice(2, -2)}
                  </AppText>
                );
              }
              if (part.startsWith("*") && part.endsWith("*")) {
                return (
                  <AppText key={i} style={[styles.text, { color: colors.text, fontStyle: "italic" }]}>
                    {part.slice(1, -1)}
                  </AppText>
                );
              }
              return (
                <AppText key={i} style={[styles.text, { color: colors.text }]}>
                  {part}
                </AppText>
              );
            });
          };

          if (isBullet) {
            return (
              <View key={lineIndex} style={{ flexDirection: "row", marginBottom: 8, paddingLeft: 16 }}>
                <AppText style={[styles.text, { color: colors.text, marginRight: 8 }]}>•</AppText>
                <View style={{ flex: 1 }}>
                  <AppText style={[styles.text, { color: colors.text }]}>{parseMarkdown(textContent)}</AppText>
                </View>
              </View>
            );
          }

          return (
            <View key={lineIndex} style={{ marginBottom: 8 }}>
              <AppText style={[styles.text, { color: colors.text }]}>{parseMarkdown(textContent)}</AppText>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    padding: 24,
    borderRadius: 16,
    // Add subtle shadow for depth
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  text: {
    fontSize: 15,
    lineHeight: 24,
    fontFamily: "Inter_400Regular",
  },
});
