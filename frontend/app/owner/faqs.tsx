import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function OwnerFaqs() {
  return <LegalContentView audience="restaurant" contentKey="faqs" headerTitleFallback="FAQs" />;
}
