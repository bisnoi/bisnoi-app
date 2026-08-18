import React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Api } from "@/src/api";
import { colors, spacing, font } from "@/src/theme";
import { ReviewsList } from "@/src/components/ReviewsList";

export default function RiderReviews() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Text style={{ fontSize: 22, fontWeight: font.black, color: colors.textPrimary }}>Reviews</Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Ratings from orders you delivered</Text>
      </View>
      <ReviewsList
        fetcher={Api.riderReviews}
        accent={colors.secondary}
        emptySubtitle="Ratings from your completed deliveries will appear here."
      />
    </SafeAreaView>
  );
}
