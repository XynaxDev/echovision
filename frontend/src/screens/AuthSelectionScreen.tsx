import React, { useRef, useState, useEffect } from "react";
import { triggerHaptic } from "../utils/haptics";
import { View, StyleSheet, Pressable, Platform, Dimensions, FlatList, Animated, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Toast from "react-native-toast-message";

import { useAppTheme } from "../context/ThemeContext";
import { AppText } from "../components/AppText";
import { GridPattern } from "../components/GridPattern";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "AuthSelection">;

const { width } = Dimensions.get("window");

const CAROUSEL_DATA = [
  {
    id: "1",
    title: "EchoVision",
    subtitle: "AI-powered accessibility for the visually impaired",
    icon: "logo",
  },
  {
    id: "2",
    title: "AI Voice Assistant",
    subtitle: "Navigate the world entirely hands-free with voice commands",
    icon: "mic",
  },
  {
    id: "3",
    title: "Scene Scanner",
    subtitle: "Describe your surroundings in real-time using AI vision",
    icon: "camera",
  },
  {
    id: "4",
    title: "Text Reader",
    subtitle: "Read text from books, signs, and documents aloud instantly",
    icon: "book-open",
  },
  {
    id: "5",
    title: "Emergency SOS",
    subtitle: "Quickly alert your emergency contacts with one tap",
    icon: "phone-call",
  },
];

export function AuthSelectionScreen({ navigation }: Props): React.JSX.Element {
  const { colors, isDark } = useAppTheme();

  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll carousel
  useEffect(() => {
    const interval = setInterval(() => {
      const nextIndex = (currentIndex + 1) % CAROUSEL_DATA.length;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setCurrentIndex(nextIndex);
    }, 3500);
    return () => clearInterval(interval);
  }, [currentIndex]);

  const handlePhoneLogin = () => {
    triggerHaptic("medium");
    navigation.navigate("Auth");
  };

  const handleGoogleLogin = () => {
    triggerHaptic("medium");
    Toast.show({
      type: "info",
      text1: "Coming Soon",
      text2: "Google Sign-In will be available soon!",
      position: "bottom",
      bottomOffset: 80,
    });
  };

  const renderItem = ({ item }: { item: typeof CAROUSEL_DATA[0] }) => {
    return (
      <View style={[styles.slide, { width }]}>
        {item.icon === "logo" ? (
          <View style={{ width: 80, height: 80, borderRadius: 24, overflow: "hidden", marginBottom: 16 }}>
            <Image 
              source={require("../../assets/echovisionapplogo_cropped.png")} 
              style={{ width: "100%", height: "100%" }} 
              resizeMode="cover"
            />
          </View>
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: isDark ? "rgba(26, 115, 232, 0.2)" : "rgba(26, 115, 232, 0.1)" }]}>
            <Feather name={item.icon as any} size={36} color={colors.primary} />
          </View>
        )}
        <AppText style={[styles.slideTitle, { color: colors.text }]}>{item.title}</AppText>
        <AppText style={[styles.slideSubtitle, { color: colors.textSecondary }]}>{item.subtitle}</AppText>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GridPattern color={colors.textSecondary} opacity={isDark ? 0.06 : 0.04} spacing={24} />
      


      {/* Header */}
      <View style={styles.headerArea}>
        <AppText style={[styles.getStartedTitle, { color: colors.text }]}>Get Started</AppText>
        <AppText style={[styles.tagline, { color: colors.textSecondary }]}>
          Empowering independence for the visually impaired{"\n"}through AI-driven accessibility
        </AppText>
      </View>

      {/* Feature Carousel */}
      <View style={styles.carouselContainer}>
        <FlatList
          ref={flatListRef}
          data={CAROUSEL_DATA}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: false,
          })}
          onMomentumScrollEnd={(ev) => {
            setCurrentIndex(Math.round(ev.nativeEvent.contentOffset.x / width));
          }}
          renderItem={renderItem}
        />
        <View style={styles.indicatorContainer}>
          {CAROUSEL_DATA.map((_, index) => {
            const indicatorWidth = scrollX.interpolate({
              inputRange: [(index - 1) * width, index * width, (index + 1) * width],
              outputRange: [8, 24, 8],
              extrapolate: "clamp",
            });
            const opacity = scrollX.interpolate({
              inputRange: [(index - 1) * width, index * width, (index + 1) * width],
              outputRange: [0.3, 1, 0.3],
              extrapolate: "clamp",
            });
            return (
              <Animated.View
                key={index.toString()}
                style={[styles.indicator, { width: indicatorWidth, opacity, backgroundColor: colors.primary }]}
              />
            );
          })}
        </View>
      </View>

      {/* Divider */}
      <View style={styles.dividerContainer}>
        <View style={[styles.line, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }]} />
      </View>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { 
              backgroundColor: "#1A73E8",
              opacity: pressed ? 0.85 : 1 
            }
          ]}
          onPress={handleGoogleLogin}
        >
          <View style={styles.googleIconWrapper}>
            <Image 
              source={{ uri: "https://img.icons8.com/color/48/000000/google-logo.png" }} 
              style={styles.googleIcon} 
            />
          </View>
          <AppText style={[styles.buttonText, { color: "#FFF" }]}>Continue with Google</AppText>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { 
              backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
              borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
              borderWidth: 1.5,
              opacity: pressed ? 0.85 : 1 
            }
          ]}
          onPress={handlePhoneLogin}
        >
          <Feather name="phone" size={20} color={colors.text} style={styles.buttonIcon} />
          <AppText style={[styles.buttonText, { color: colors.text }]}>Continue with Phone</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logoArea: {
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 70 : 50,
  },
  logoShadow: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  bigLogo: {
    width: 100,
    height: 100,
    borderRadius: 30,
  },
  headerArea: {
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 140 : 110,
    paddingHorizontal: 32,
  },
  getStartedTitle: {
    fontSize: 30,
    fontFamily: "Inter_900Black",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 22,
  },
  carouselContainer: {
    flex: 1,
    paddingTop: 16,
  },
  slide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  slideTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  slideSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  indicatorContainer: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 16,
  },
  indicator: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
  },
  dividerContainer: {
    paddingHorizontal: 40,
    marginBottom: 16,
  },
  line: {
    height: 1,
  },
  buttonContainer: {
    gap: 14,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 28,
    justifyContent: "center",
  },
  googleIconWrapper: {
    position: "absolute",
    left: 24,
    width: 28,
    height: 28,
    backgroundColor: "#FFF",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  googleIcon: {
    width: 18,
    height: 18,
  },
  buttonIcon: {
    position: "absolute",
    left: 24,
  },
  buttonText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
});
