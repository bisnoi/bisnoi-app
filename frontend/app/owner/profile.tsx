import React, { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { SharedProfile } from "@/src/components/SharedProfile";
import { DetailSection, maskAccount } from "@/src/components/ProfileDetails";
import { Api } from "@/src/api";
import { colors } from "@/src/theme";
import { useSmartBack } from "@/src/utils/nav";

export default function OwnerProfile() {
  const router = useRouter();
  const goBack = useSmartBack();
  const [details, setDetails] = useState<any>(null);

  useFocusEffect(useCallback(() => {
    Api.myDetails().then(setDetails).catch(() => {});
  }, []));

  const rest = details?.restaurant || {};
  const p = details?.application?.payload || {};
  const user = details?.user || {};

  const cuisines = (rest.cuisines && rest.cuisines.length ? rest.cuisines : p.cuisines) || [];

  const extra = (
    <>
      <DetailSection
        title="Restaurant"
        icon="storefront"
        rows={[
          { label: "Name", value: rest.name || p.restaurant_name },
          { label: "Cuisines", value: cuisines.join(", ") },
          { label: "Status", value: (rest.status || "").toUpperCase() },
          { label: "Rating", value: rest.rating ? `${rest.rating} \u2605` : null },
          { label: "Address", value: rest.address || p.address },
          { label: "City", value: rest.city || p.city },
          { label: "Pincode", value: rest.pincode || p.pincode },
        ]}
      />
      <DetailSection
        title="Business & Contact"
        icon="business"
        rows={[
          { label: "Business Name", value: p.business_name },
          { label: "Owner Name", value: p.owner_name || user.name },
          { label: "Contact Phone", value: rest.contact_phone || p.contact_phone || user.phone },
          { label: "Contact Email", value: rest.contact_email || p.contact_email },
          { label: "Opening Time", value: p.opening_time },
          { label: "Closing Time", value: p.closing_time },
        ]}
      />
      <DetailSection
        title="Compliance"
        icon="shield-checkmark"
        rows={[
          { label: "FSSAI No.", value: rest.fssai_license || p.fssai_number },
          { label: "GST No.", value: rest.gst_number || p.gst_number },
          { label: "PAN No.", value: p.pan_number },
        ]}
      />
      <DetailSection
        title="Bank Details"
        icon="card"
        rows={[
          { label: "Account Name", value: rest.bank_account_name || p.bank_account_name },
          { label: "Account No.", value: maskAccount(rest.bank_account_number || p.bank_account_number) },
          { label: "IFSC", value: rest.bank_ifsc || p.bank_ifsc },
        ]}
      />
    </>
  );

  const items = [
    { icon: "trending-up" as const, label: "My Performance", sub: "Score, mark-ready, handover, availability", onPress: () => router.push("/owner/performance" as any) },
    { icon: "help-circle" as const, label: "Help & Support", sub: "FAQs and partner care", onPress: () => router.push("/owner/help" as any) },
    { icon: "chatbubbles" as const, label: "FAQs", onPress: () => router.push("/owner/faqs" as any) },
    { icon: "call" as const, label: "Contact Us", onPress: () => router.push("/owner/contact-us" as any) },
    { icon: "document-text" as const, label: "Terms & Conditions", onPress: () => router.push("/owner/terms" as any) },
    { icon: "shield-checkmark" as const, label: "Privacy Policy", onPress: () => router.push("/owner/privacy" as any) },
    { icon: "cash-outline" as const, label: "Refund Policy", onPress: () => router.push("/owner/refund-policy" as any) },
    { icon: "close-circle-outline" as const, label: "Cancellation Policy", onPress: () => router.push("/owner/cancellation-policy" as any) },
  ];

  return <SharedProfile title="Restaurant Profile" accent={colors.primary} onBack={goBack} extra={extra} items={items} />;
}
