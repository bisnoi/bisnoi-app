import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function OwnerCancellation() {
  return <LegalContentView audience="restaurant" contentKey="cancellation_policy" headerTitleFallback="Cancellation Policy" />;
}
