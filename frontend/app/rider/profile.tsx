import React, { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { SharedProfile } from "@/src/components/SharedProfile";
import { DetailSection, maskAccount } from "@/src/components/ProfileDetails";
import { Api } from "@/src/api";
import { colors } from "@/src/theme";
import { dobFromIso } from "@/src/components/form";

export default function RiderProfile() {
  const router = useRouter();
  const [details, setDetails] = useState<any>(null);

  useFocusEffect(useCallback(() => {
    Api.myDetails().then(setDetails).catch(() => {});
  }, []));

  const p = details?.application?.payload || {};
  const user = details?.user || {};

  const extra = (
    <>
      <DetailSection
        title="Account"
        icon="id-card"
        accent={colors.primary}
        rows={[
          { label: "Account ID", value: user.account_id },
          { label: "Role", value: user.role ? String(user.role).toUpperCase() : null },
        ]}
      />
      <DetailSection
        title="Personal"
        icon="person"
        accent={colors.secondary}
        rows={[
          { label: "Full Name", value: p.full_name || user.name },
          { label: "Phone", value: p.contact_phone || user.phone },
          { label: "Email", value: p.contact_email },
          { label: "Date of Birth", value: dobFromIso(p.date_of_birth) || p.date_of_birth },
          { label: "City", value: p.city },
          { label: "Address", value: p.address },
          { label: "Pincode", value: p.pincode },
        ]}
      />
      <DetailSection
        title="Vehicle"
        icon="bicycle"
        accent={colors.secondary}
        rows={[
          { label: "Type", value: p.vehicle_type ? String(p.vehicle_type).toUpperCase() : null },
          { label: "Vehicle No.", value: p.vehicle_number },
          { label: "RC No.", value: p.rc_number },
          { label: "License No.", value: p.license_number },
        ]}
      />
      <DetailSection
        title="KYC"
        icon="shield-checkmark"
        accent={colors.secondary}
        rows={[
          { label: "Aadhaar", value: maskAccount(p.aadhaar_number) },
          { label: "PAN No.", value: p.pan_number },
        ]}
      />
      <DetailSection
        title="Bank Details"
        icon="card"
        accent={colors.secondary}
        rows={[
          { label: "Account Name", value: p.bank_account_name },
          { label: "Account No.", value: maskAccount(p.bank_account_number) },
          { label: "IFSC", value: p.bank_ifsc },
        ]}
      />
    </>
  );

  const items = [
    { icon: "help-circle" as const, label: "Help & Support", sub: "FAQs and rider care", onPress: () => router.push("/rider/help" as any) },
    { icon: "chatbubbles" as const, label: "FAQs", onPress: () => router.push("/rider/faqs" as any) },
    { icon: "call" as const, label: "Contact Us", onPress: () => router.push("/rider/contact-us" as any) },
    { icon: "document-text" as const, label: "Terms & Conditions", onPress: () => router.push("/rider/terms" as any) },
    { icon: "shield-checkmark" as const, label: "Privacy Policy", onPress: () => router.push("/rider/privacy" as any) },
    { icon: "cash-outline" as const, label: "Refund Policy", onPress: () => router.push("/rider/refund-policy" as any) },
    { icon: "close-circle-outline" as const, label: "Cancellation Policy", onPress: () => router.push("/rider/cancellation-policy" as any) },
  ];

  return <SharedProfile title="Rider Profile" accent={colors.secondary} extra={extra} items={items} />;
}
