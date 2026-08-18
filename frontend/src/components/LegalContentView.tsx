import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Api } from "@/src/api";
import { openSupportChat } from "@/src/chatControl";

export type LegalAudience = "customer" | "restaurant" | "rider";
export type LegalKey =
  | "terms"
  | "privacy"
  | "refund_policy"
  | "cancellation_policy"
  | "contact_us"
  | "faqs"
  | "help";

export function LegalContentView({
  audience,
  contentKey,
  headerTitleFallback,
  headerSubtitle,
}: {
  audience: LegalAudience;
  contentKey: LegalKey;
  headerTitleFallback?: string;
  headerSubtitle?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<any>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const d: any = await Api.getLegal(audience, contentKey);
        if (!cancelled) setDoc(d);
      } catch {
        if (!cancelled) setDoc(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audience, contentKey]);

  const content: any = doc?.content || {};
  const title: string = content?.title || headerTitleFallback || contentKey;
  const updated: string | undefined = content?.updated_at;

  const dateStr = useMemo(() => {
    if (!updated) return "";
    try {
      const d = new Date(updated);
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    } catch {
      return "";
    }
  }, [updated]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader title={title} subtitle={headerSubtitle} />
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 112 }}>
          {!!dateStr && <Text style={styles.updated}>Last updated: {dateStr}</Text>}

          {/* Live chat entry (moved here from the old floating button) */}
          {contentKey === "help" ? (
            <TouchableOpacity
              testID="help-open-chat"
              activeOpacity={0.9}
              onPress={openSupportChat}
              style={styles.chatCta}
            >
              <View style={styles.chatCtaIcon}>
                <Ionicons name="chatbubble-ellipses" size={22} color={colors.onPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.chatCtaTitle}>Chat with us</Text>
                <Text style={styles.chatCtaSub}>Get instant help from our assistant or a live agent</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.onPrimary} />
            </TouchableOpacity>
          ) : null}

          {/* CONTACT US block */}
          {contentKey === "contact_us" && content?.contact ? (
            <ContactCard contact={content.contact} />
          ) : null}

          {/* FAQs block */}
          {contentKey === "faqs" && Array.isArray(content?.faqs) ? (
            <View style={{ gap: spacing.md }}>
              {content.faqs.map((f: any, i: number) => (
                <TouchableOpacity
                  key={String(i)}
                  style={styles.faq}
                  activeOpacity={0.9}
                  onPress={() => setOpenIdx(openIdx === i ? null : i)}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={styles.q}>{f.q}</Text>
                    <Ionicons name={openIdx === i ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
                  </View>
                  {openIdx === i && <Text style={styles.a}>{f.a}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {/* Section-based content */}
          {Array.isArray(content?.sections) &&
            content.sections.map((s: any, i: number) => (
              <View key={String(i)} style={styles.card}>
                {!!s.title && <Text style={styles.sectionTitle}>{s.title}</Text>}
                {!!s.body && <Text style={styles.sectionBody}>{s.body}</Text>}
              </View>
            ))}

          {/* Empty */}
          {!content?.sections?.length && !content?.faqs?.length && !content?.contact && (
            <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40 }}>
              No content available yet.
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ContactCard({ contact }: { contact: any }) {
  const call = (n: string) => Linking.openURL(`tel:${n.replace(/\s+/g, "")}`);
  const email = (e: string) => Linking.openURL(`mailto:${e}`);
  const wa = (n: string) => Linking.openURL(`https://wa.me/${n.replace(/[^0-9]/g, "")}`);
  return (
    <View style={{ gap: spacing.md }}>
      {!!contact.description && (
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>{contact.description}</Text>
      )}
      <View style={styles.contactGrid}>
        {!!contact.phone && (
          <TouchableOpacity style={styles.contactTile} onPress={() => call(contact.phone)}>
            <Ionicons name="call" color={colors.primary} size={22} />
            <Text style={styles.contactTileLabel}>Call us</Text>
            <Text style={styles.contactTileSub}>{contact.phone}</Text>
          </TouchableOpacity>
        )}
        {!!contact.email && (
          <TouchableOpacity style={styles.contactTile} onPress={() => email(contact.email)}>
            <Ionicons name="mail" color={colors.primary} size={22} />
            <Text style={styles.contactTileLabel}>Email us</Text>
            <Text style={styles.contactTileSub}>{contact.email}</Text>
          </TouchableOpacity>
        )}
        {!!contact.whatsapp && (
          <TouchableOpacity style={styles.contactTile} onPress={() => wa(contact.whatsapp)}>
            <Ionicons name="logo-whatsapp" color={colors.primary} size={22} />
            <Text style={styles.contactTileLabel}>WhatsApp</Text>
            <Text style={styles.contactTileSub}>{contact.whatsapp}</Text>
          </TouchableOpacity>
        )}
      </View>
      {(!!contact.address || !!contact.hours) && (
        <View style={styles.card}>
          {!!contact.hours && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.sectionBody}>{contact.hours}</Text>
            </View>
          )}
          {!!contact.address && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
              <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.sectionBody, { flex: 1 }]}>{contact.address}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  updated: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  chatCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  chatCtaIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  chatCtaTitle: { color: colors.onPrimary, fontWeight: font.black, fontSize: 15 },
  chatCtaSub: { color: colors.onPrimary, opacity: 0.9, fontSize: 12, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  sectionTitle: { fontSize: 14, fontWeight: font.black, color: colors.textPrimary, marginBottom: 6 },
  sectionBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  faq: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.card,
  },
  q: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary, flex: 1, paddingRight: 8 },
  a: { fontSize: 13, color: colors.textSecondary, marginTop: 8, lineHeight: 19 },
  contactGrid: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  contactTile: {
    flexGrow: 1,
    minWidth: 130,
    alignItems: "center",
    gap: 4,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  contactTileLabel: { fontSize: 13, fontWeight: font.bold, color: colors.textPrimary, marginTop: 4 },
  contactTileSub: { fontSize: 12, color: colors.textSecondary, textAlign: "center" },
});
