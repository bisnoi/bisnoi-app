import React from "react";
import { Api } from "@/src/api";
import { colors } from "@/src/theme";
import { Screen, ScreenHeader } from "@/src/components/ScreenHeader";
import { ComplaintsView } from "@/src/components/ComplaintsView";

export default function OwnerComplaints() {
  return (
    <Screen>
      <ScreenHeader title="Complaints" subtitle="Customer complaints for your restaurant" />
      <ComplaintsView fetcher={Api.ownerComplaints} canManage accent={colors.primary} />
    </Screen>
  );
}
