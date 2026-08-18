import React from "react";
import { SharedProfile } from "@/src/components/SharedProfile";
import { colors } from "@/src/theme";
import { useSmartBack } from "@/src/utils/nav";

export default function AdminProfile() {
  const goBack = useSmartBack();
  return <SharedProfile title="Admin Profile" accent={colors.textPrimary} onBack={goBack} />;
}
