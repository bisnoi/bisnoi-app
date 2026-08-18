import React from "react";
import { View, Image } from "react-native";

// The real Bisnoi logo mark (B monogram + leaf + food cloche on brand green).
const LOGO_MARK = require("@/assets/images/logo-mark.png");

// Brand green that matches the logo background so any rounded gaps blend in.
const BRAND_GREEN = "#287939";

/**
 * Bisnoi brand mark — renders the actual logo image inside a rounded badge.
 * Used next to the "Bisnoi" wordmark in headers / login, and standalone.
 */
export function BrandMark({ size = 40, radius }: { size?: number; radius?: number }) {
  const r = radius ?? Math.round(size * 0.28);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        overflow: "hidden",
        backgroundColor: BRAND_GREEN,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image source={LOGO_MARK} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}
