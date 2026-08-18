import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function OwnerTerms() {
  return <LegalContentView audience="restaurant" contentKey="terms" headerTitleFallback="Terms & Conditions" />;
}
