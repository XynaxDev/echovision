import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

export function AppText({ style, ...props }: TextProps) {
  const { fontScale } = useAppTheme();
  const { language } = useLanguage();
  
  // Extract the base font size from the style, or default to 14
  const flattenedStyle = StyleSheet.flatten(style) || {};
  const baseFontSize = flattenedStyle.fontSize || 14;
  const scaledFontSize = baseFontSize * fontScale;
  
  // Also scale line height proportionally if it exists to maintain layout integrity
  let scaledLineHeight = flattenedStyle.lineHeight ? flattenedStyle.lineHeight * fontScale : undefined;

  let fontFamily = flattenedStyle.fontFamily;
  let fontWeight = flattenedStyle.fontWeight;

  // ──────────────────────────────────────────────────────────────────────────
  // HINDI FONT FIX:
  // Inter doesn't support Devanagari. If we force 'Inter_700Bold', Android 
  // falls back to the system Hindi font but ignores the '700Bold' weight 
  // (because it's just a family name), resulting in very thin text.
  // We intercept it here, strip the custom family, and apply real font weights!
  // ──────────────────────────────────────────────────────────────────────────
  if (language === 'hindi' && typeof fontFamily === 'string') {
    if (fontFamily.includes('900')) fontWeight = '900';
    else if (fontFamily.includes('800')) fontWeight = '800';
    else if (fontFamily.includes('700') || fontFamily.toLowerCase().includes('bold')) fontWeight = 'bold';
    else if (fontFamily.includes('600')) fontWeight = '600';
    else if (fontFamily.includes('500') || fontFamily.toLowerCase().includes('medium')) fontWeight = '500';
    else if (fontFamily.includes('400') || fontFamily.toLowerCase().includes('regular')) fontWeight = 'normal';
    
    // Remove custom font family so system can use default bold Noto/Hind
    fontFamily = undefined;
    
    // Hindi matras (top/bottom accents) get cropped easily. 
    // Bump line height slightly if it exists, or remove strict line heights.
    if (scaledLineHeight) {
      scaledLineHeight = scaledLineHeight * 1.2; 
    }
  }

  return (
    <Text 
      style={[
        style, 
        { 
          fontSize: scaledFontSize, 
          lineHeight: scaledLineHeight,
          ...(fontFamily !== undefined ? { fontFamily } : { fontFamily: undefined }),
          ...(fontWeight !== undefined ? { fontWeight } : {})
        }
      ]} 
      {...props} 
    />
  );
}
