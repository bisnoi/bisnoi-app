import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function CustomerRefund() {
  return <LegalContentView audience="customer" contentKey="refund_policy" headerTitleFallback="Refund Policy" />;
}
