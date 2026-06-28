import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Pattern, Rect, Circle } from 'react-native-svg';

interface GridPatternProps {
  color: string;
  spacing?: number;
  radius?: number;
  opacity?: number;
}

export function GridPattern({ color, spacing = 20, radius = 1, opacity = 0.3 }: GridPatternProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Pattern
          id="dottedGrid"
          width={spacing}
          height={spacing}
          patternUnits="userSpaceOnUse"
        >
          <Circle cx={spacing / 2} cy={spacing / 2} r={radius} fill={color} opacity={opacity} />
        </Pattern>
        <Rect width="100%" height="100%" fill="url(#dottedGrid)" />
      </Svg>
    </View>
  );
}
