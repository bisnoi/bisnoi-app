import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function CustomerTerms() {
  return <LegalContentView audience="customer" contentKey="terms" headerTitleFallback="Terms & Conditions" />;
}
