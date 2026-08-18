import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function RiderCancellation() {
  return <LegalContentView audience="rider" contentKey="cancellation_policy" headerTitleFallback="Cancellation Policy" />;
}
