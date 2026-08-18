import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Api } from "@/src/api";
import { colors } from "@/src/theme";
import { AdminHeader } from "@/src/components/AdminHeader";
import { ComplaintsView } from "@/src/components/ComplaintsView";

export default function AdminComplaints() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <AdminHeader title="Complaints" subtitle="All customer complaints across the platform" />
      <ComplaintsView fetcher={Api.adminComplaints} canManage accent={colors.primary} />
    </SafeAreaView>
  );
}
