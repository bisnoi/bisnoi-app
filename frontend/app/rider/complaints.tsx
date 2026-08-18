import React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Api } from "@/src/api";
import { colors, spacing, font } from "@/src/theme";
import { ComplaintsView } from "@/src/components/ComplaintsView";

export default function RiderComplaints() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Text style={{ fontSize: 22, fontWeight: font.black, color: colors.textPrimary }}>Complaints</Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Complaints on orders you delivered</Text>
      </View>
      <ComplaintsView fetcher={Api.riderComplaints} canManage accent={colors.secondary} />
    </SafeAreaView>
  );
}
