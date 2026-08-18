import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function OwnerRefund() {
  return <LegalContentView audience="restaurant" contentKey="refund_policy" headerTitleFallback="Refund Policy" />;
}
