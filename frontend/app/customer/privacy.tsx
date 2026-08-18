import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function CustomerPrivacy() {
  return <LegalContentView audience="customer" contentKey="privacy" headerTitleFallback="Privacy Policy" />;
}
