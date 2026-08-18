import React from "react";
import { LegalContentView } from "@/src/components/LegalContentView";

export default function CustomerContact() {
  return <LegalContentView audience="customer" contentKey="contact_us" headerTitleFallback="Contact Us" headerSubtitle="We’re here to help" />;
}
