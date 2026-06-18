# EchoVision Frontend

This is the React Native Expo frontend for **EchoVision**, an accessibility platform designed to empower visually impaired users through voice, vision, and haptic feedback.

## Features
- **Welcome & Auth Flow**: High-contrast, accessible landing page with text-to-speech orientation.
- **Accessible Dashboard**: 4-quadrant layout with tap-to-vocalize and double-tap-to-activate mechanics.
- **Voice Assistant**: Natural voice interaction powered by Gemini & Sarvam STT/TTS.
- **Scene Scanner**: Real-time environment description using the camera and Gemini Vision.
- **Text Reader**: On-device text recognition using ML Kit OCR.
- **SOS Alert**: Long-press safety feature to send GPS coordinates and trigger an emergency call.
- **Theme Selection**: Persistent Light, Dark, and System modes configured for WCAG AAA contrast compliance.
- **Global Gestures**: Two-finger 800ms long press to instantly summon the voice assistant from anywhere.

## Tech Stack
- **Framework**: React Native 0.76 + Expo SDK 53
- **Language**: TypeScript (Strict Mode)
- **Navigation**: React Navigation 7 (Native Stack)
- **Local Storage**: AsyncStorage
- **APIs/Modules**: `expo-speech`, `expo-haptics`, `expo-camera`, `expo-location`, `expo-sms`, `@react-native-ml-kit/text-recognition`

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm start
```
This will start the Expo Metro Bundler. You can open the app on your physical device using the **Expo Go** app (scan the QR code) or press `a` / `i` to open in an Android Emulator or iOS Simulator.

### 3. Scripts
- `npm start` - Starts the Expo development server.
- `npm run android` - Runs the app on a connected Android device/emulator.
- `npm run ios` - Runs the app on a connected iOS device/simulator.
- `npm run lint` - Runs the TypeScript compiler to check for errors (`npx tsc --noEmit`).

## Project Structure
```
frontend/
├── App.tsx                           # Root Entry + GlobalGestureWrapper
├── app.json                          # Expo configuration
├── package.json                      # Dependencies
└── src/
    ├── components/                   # Reusable UI components (Buttons, Toggles)
    ├── constants/                    # Colors and Theme tokens
    ├── context/                      # ThemeContext for light/dark modes
    ├── navigation/                   # AppNavigator (Native Stack)
    ├── screens/                      # All application screens
    └── services/                     # API client for backend communication
```

## Backend Connection
Ensure that the backend is running and the `src/services/api.ts` base URL is pointed to your local network IP (e.g., `http://192.168.x.x:8000`) or your deployed backend URL.
