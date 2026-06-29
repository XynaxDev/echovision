import React, { useEffect, useRef } from 'react';
import * as Network from 'expo-network';
import Toast from 'react-native-toast-message';
import * as Speech from 'expo-speech';
import { useLanguage } from '../context/LanguageContext';

export function NetworkWatcher() {
  const { language } = useLanguage();
  const wasOffline = useRef(false);

  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        
        if (state.isConnected === false && state.isInternetReachable === false) {
          if (!wasOffline.current) {
            wasOffline.current = true;
            
            Toast.show({
              type: 'error',
              text1: language === 'hindi' ? 'नेटवर्क एरर' : 'Network Error',
              text2: language === 'hindi' ? 'इंटरनेट कनेक्शन टूट गया है' : 'Internet connection lost',
            });

            Speech.stop();
            Speech.speak(
              language === 'hindi' ? "इंटरनेट कनेक्शन टूट गया है" : "Internet connection lost",
              {
                language: language === 'hindi' ? 'hi-IN' : 'en-US',
                pitch: 1.0,
                rate: 1.0
              }
            );
          }
        } else if (state.isConnected && state.isInternetReachable) {
          if (wasOffline.current) {
            wasOffline.current = false;
            
            Toast.show({
              type: 'success',
              text1: language === 'hindi' ? 'ऑनलाइन' : 'Online',
              text2: language === 'hindi' ? 'इंटरनेट कनेक्शन वापस आ गया है' : 'Internet connection restored',
            });

            Speech.stop();
            Speech.speak(
              language === 'hindi' ? "इंटरनेट कनेक्शन वापस आ गया है" : "Internet connection restored",
              {
                language: language === 'hindi' ? 'hi-IN' : 'en-US',
                pitch: 1.0,
                rate: 1.0
              }
            );
          }
        }
      } catch (error) {
        // Ignore network check errors
      }
    };

    // Check every 3 seconds
    const interval = setInterval(checkNetwork, 3000);
    return () => clearInterval(interval);
  }, [language]);

  return null;
}
