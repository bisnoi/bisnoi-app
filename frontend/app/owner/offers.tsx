import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Card, Empty } from "@/src/components/ui";
import { Screen, ScreenHeader } from "@/src/components/ScreenHeader";

type Offer = { id: string; title: string; code: string; type: string; value: number; max_discount?: number; min_order?: number; description?: string; applied?: boolean };

export default function OwnerOffers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const d = await Api.ownerOffers(); setOffers((d as any).offers || []); }
    catch (e: any) { console.warn(e?.message); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (o: Offer) => {
    setBusy(o.id);
    try {
      if (o.applied) await Api.ownerRemoveOffer(o.id);
      else await Api.ownerApplyOffer(o.id);
      await load();
    } catch (e: any) { if (Platform.OS === "web") window.alert(e?.message); }
    finally { setBusy(null); }
  };

  const appliedCount = offers.filter((o) => o.applied).length;

  return (
    <Screen>
      <ScreenHeader title="Offers" subtitle="Apply admin offers to your restaurant" />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
          <View style={styles.banner}>
            <Ionicons name="pricetags" size={20} color={colors.primary} />
            <Text style={styles.bannerTxt}>Only <Text style={{ fontWeight: font.black }}>one offer</Text> can run at a time. {appliedCount} offer{appliedCount === 1 ? "" : "s"} currently live. Remove it to switch to another.</Text>
          </View>
          {offers.length === 0 ? (
            <Empty icon="pricetag-outline" title="No offers available" subtitle="Admin hasn't published any offers yet." />
          ) : offers.map((o) => {
            const locked = !o.applied && appliedCount >= 1;
            return (
            <Card key={o.id} style={[styles.offer, o.applied && { borderColor: colors.primary, borderWidth: 1.5 }]}>
              <View style={styles.tagStrip}>
                <View style={styles.tagIc}><Ionicons name="pricetag" size={16} color={colors.onPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{o.title}</Text>
                  {o.description ? <Text style={styles.desc} numberOfLines={2}>{o.description}</Text> : null}
                </View>
              </View>
              <View style={styles.metaRow}>
                <View style={styles.codeBox}><Text style={styles.codeTxt}>{o.code}</Text></View>
                {o.min_order ? <Text style={styles.minTxt}>Min order ₹{o.min_order}</Text> : <Text style={styles.minTxt}>No min order</Text>}
              </View>
              {locked ? (
                <View style={[styles.applyBtn, styles.lockedBtn]}>
                  <Ionicons name="lock-closed" size={15} color={colors.textMuted} />
                  <Text style={[styles.applyTxt, { color: colors.textMuted }]}>Remove active offer to apply</Text>
                </View>
              ) : (
                <TouchableOpacity testID={`offer-toggle-${o.id}`} onPress={() => toggle(o)} disabled={busy === o.id}
                  style={[styles.applyBtn, o.applied ? styles.removeBtn : styles.addBtn]} activeOpacity={0.85}>
                  {busy === o.id ? <ActivityIndicator color={o.applied ? colors.error : colors.onPrimary} size="small" /> : (
                    <>
                      <Ionicons name={o.applied ? "checkmark-circle" : "add-circle"} size={18} color={o.applied ? colors.error : colors.onPrimary} />
                      <Text style={[styles.applyTxt, { color: o.applied ? colors.error : colors.onPrimary }]}>{o.applied ? "Remove" : "Apply"}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </Card>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  bannerTxt: { flex: 1, fontSize: 12, color: colors.textPrimary, lineHeight: 17 },
  offer: { marginBottom: spacing.sm },
  tagStrip: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  tagIc: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  desc: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  codeBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  codeTxt: { fontSize: 12, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 1 },
  minTxt: { fontSize: 12, color: colors.textSecondary },
  applyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: radius.md, marginTop: spacing.md },
  addBtn: { backgroundColor: colors.primary },
  removeBtn: { borderWidth: 1, borderColor: colors.error, backgroundColor: colors.errorSoft },
  lockedBtn: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  applyTxt: { fontSize: 14, fontWeight: font.black },
});
