import React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Api } from "@/src/api";
import { colors, spacing, font } from "@/src/theme";
import { ReviewsList } from "@/src/components/ReviewsList";

export default function OwnerReviews() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={[]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Text style={{ fontSize: 22, fontWeight: font.black, color: colors.textPrimary }}>Reviews</Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>What customers say about your restaurant</Text>
      </View>
      <ReviewsList
        fetcher={Api.ownerReviews}
        accent={colors.primary}
        emptySubtitle="Customer reviews for your restaurant will appear here."
      />
    </SafeAreaView>
  );
}
