import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/auth";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (user.role === "restaurant_owner" || user.role === "restaurant_staff") return <Redirect href="/owner" />;
  if (user.role === "rider") return <Redirect href="/rider" />;
  if (user.role === "admin" || user.role === "admin_staff") return <Redirect href="/admin" />;
  return <Redirect href="/customer" />;
}
