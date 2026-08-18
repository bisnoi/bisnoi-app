import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function CustomerFaqs() {
  return <LegalContentView audience="customer" contentKey="faqs" headerTitleFallback="FAQs" />;
}
