import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function RiderTerms() {
  return <LegalContentView audience="rider" contentKey="terms" headerTitleFallback="Terms & Conditions" />;
}
