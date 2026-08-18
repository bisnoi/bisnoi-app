import React from "react";
import { Screen, ScreenHeader } from "@/src/components/ScreenHeader";
import { ComplaintsView } from "@/src/components/ComplaintsView";
import { Api } from "@/src/api";
import { colors } from "@/src/theme";

export default function CustomerComplaints() {
  return (
    <Screen>
      <ScreenHeader title="My Complaints" subtitle="Track issues you've reported" />
      <ComplaintsView fetcher={Api.myComplaints} canManage={false} canReply accent={colors.primary} />
    </Screen>
  );
}
