import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function CustomerHelp() {
  return <LegalContentView audience="customer" contentKey="help" headerTitleFallback="Help & Support" />;
}
