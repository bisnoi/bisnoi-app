import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/src/theme";

/**
 * Cart & checkout now live on ONE page (Zomato-style): /customer/cart.
 * This route only exists so old links keep working.
 */
export default function CheckoutRedirect() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace("/customer/cart" as any), 50);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
