import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Api } from "@/src/api";
import { colors } from "@/src/theme";
import { AdminHeader } from "@/src/components/AdminHeader";
import { ReviewsList } from "@/src/components/ReviewsList";

export default function AdminReviews() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <AdminHeader title="Reviews" subtitle="All customer reviews across restaurants" />
      <ReviewsList
        fetcher={Api.adminReviews}
        accent={colors.primary}
        emptySubtitle="No customer reviews on the platform yet."
      />
    </SafeAreaView>
  );
}
