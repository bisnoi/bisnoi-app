import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function CustomerCancellation() {
  return <LegalContentView audience="customer" contentKey="cancellation_policy" headerTitleFallback="Cancellation Policy" />;
}
