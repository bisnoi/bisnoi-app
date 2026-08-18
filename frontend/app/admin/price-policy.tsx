import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Switch, ActivityIndicator, Image, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";

type Policy = {
  allow_owner_price_edit: boolean;
  hike_max_percent: number;
  drop_max_percent: number;
  require_admin_approval_on_change: boolean;
};

type RestaurantRow = {
  id: string;
  name: string;
  image?: string;
  price_policy?: Partial<Policy> | null;
};

export default function AdminPricePolicy() {
  const [tab, setTab] = useState<"global" | "per_restaurant">("global");
  // Global
  const [g, setG] = useState<Policy | null>(null);
  const [gServer, setGServer] = useState<Policy | null>(null);
  const [savingG, setSavingG] = useState(false);
  const [savedG, setSavedG] = useState(false);
  const [err, setErr] = useState("");

  // Per-restaurant
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [selected, setSelected] = useState<RestaurantRow | null>(null);
  const [override, setOverride] = useState<Partial<Policy> | null>(null);
  const [effective, setEffective] = useState<Policy | null>(null);
  const [savingR, setSavingR] = useState(false);
  const [searchQ, setSearchQ] = useState("");

  const loadGlobal = useCallback(async () => {
    setErr("");
    try {
      const r: any = await Api.adminGetPricePolicy();
      setG(r); setGServer(r);
    } catch (e: any) {
      setErr(e?.message || "Could not load policy");
    }
  }, []);

  const loadRestaurants = useCallback(async () => {
    try {
      const r: any = await Api.adminRests();
      setRestaurants((r as RestaurantRow[]) || []);
    } catch (e: any) {
      /* ignore */
    }
  }, []);

  useEffect(() => { loadGlobal(); loadRestaurants(); }, [loadGlobal, loadRestaurants]);

  const dirtyG = useMemo(() => !!g && !!gServer && JSON.stringify(g) !== JSON.stringify(gServer), [g, gServer]);

  const saveGlobal = async () => {
    if (!g || savingG) return;
    setSavingG(true); setErr("");
    try {
      const r: any = await Api.adminSetPricePolicy(g);
      setG(r); setGServer(r);
      setSavedG(true); setTimeout(() => setSavedG(false), 2000);
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally { setSavingG(false); }
  };

  const openRestaurant = async (r: RestaurantRow) => {
    setSelected(r); setOverride(null); setEffective(null);
    try {
      const data: any = await Api.adminGetRestaurantPricePolicy(r.id);
      setOverride(data.override); setEffective(data.effective);
    } catch (e: any) {
      Alert.alert("Load failed", e?.message || "Could not load restaurant policy");
    }
  };

  const patchOverride = (k: keyof Policy, v: any) => {
    setOverride((prev) => ({ ...(prev || {}), [k]: v }));
  };

  const saveOverride = async () => {
    if (!selected || savingR) return;
    setSavingR(true);
    try {
      const payload = override || {};
      const data: any = await Api.adminSetRestaurantPricePolicy(selected.id, payload);
      setOverride(data.override); setEffective(data.effective);
      Alert.alert("Saved", "Restaurant-specific price policy updated.");
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Something went wrong");
    } finally { setSavingR(false); }
  };

  const clearOverride = async () => {
    if (!selected) return;
    setSavingR(true);
    try {
      const data: any = await Api.adminClearRestaurantPricePolicy(selected.id);
      setOverride(null); setEffective(data.effective);
      Alert.alert("Cleared", "This restaurant now follows the global policy.");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not clear override");
    } finally { setSavingR(false); }
  };

  const filteredRestaurants = restaurants.filter((r) =>
    !searchQ || (r.name || "").toLowerCase().includes(searchQ.toLowerCase()),
  );

  return (
    <Screen>
      <ScreenHeader title="Price Policy" subtitle="Restrict how much owners can hike / drop menu prices" />

      <View style={styles.tabsWrap}>
        {(["global", "per_restaurant"] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.85}
            style={[styles.tab, tab === t && styles.tabActive]} testID={`price-tab-${t}`}>
            <Ionicons name={t === "global" ? "globe-outline" : "storefront-outline"} size={16} color={tab === t ? colors.onPrimary : colors.textSecondary} />
            <Text style={[styles.tabTxt, tab === t && { color: colors.onPrimary }]}>
              {t === "global" ? "Global Default" : "Per-Restaurant"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "global" ? (
        !g ? (
          <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>GLOBAL POLICY (APPLIES TO ALL RESTAURANTS)</Text>
            <Text style={styles.help}>
              This policy is enforced whenever a restaurant owner tries to change a menu item's price. Baseline = last
              admin-approved price for that item. Per-restaurant overrides can be set in the second tab.
            </Text>

            <View style={[styles.card, { marginTop: spacing.md }]}>
              <ToggleRow
                label="Allow owners to edit prices"
                sub="Master switch. When off, only admins can change menu prices."
                icon="lock-open-outline"
                value={g.allow_owner_price_edit}
                onChange={(v) => setG({ ...g, allow_owner_price_edit: v })}
                testID="policy-allow-edit"
              />
              <View style={styles.divider} />
              <NumberRow
                label="Max hike allowed"
                sub={`Owner can raise price by up to ${g.hike_max_percent}% over baseline.`}
                icon="trending-up-outline"
                suffix="%"
                value={g.hike_max_percent}
                onChange={(v) => setG({ ...g, hike_max_percent: v })}
                min={0} max={500}
                testID="policy-hike"
              />
              <View style={styles.divider} />
              <NumberRow
                label="Max drop allowed"
                sub={`Owner can lower price by up to ${g.drop_max_percent}% below baseline.`}
                icon="trending-down-outline"
                suffix="%"
                value={g.drop_max_percent}
                onChange={(v) => setG({ ...g, drop_max_percent: v })}
                min={0} max={100}
                testID="policy-drop"
              />
              <View style={styles.divider} />
              <ToggleRow
                label="Require admin approval on price change"
                sub="Owner edits mark the item as pending re-approval before going live."
                icon="checkmark-done-outline"
                value={g.require_admin_approval_on_change}
                onChange={(v) => setG({ ...g, require_admin_approval_on_change: v })}
                testID="policy-approval"
              />
            </View>

            <View style={[styles.exampleCard, { marginTop: spacing.md }]}>
              <Ionicons name="bulb-outline" size={20} color={colors.warning} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.exampleTitle}>Example</Text>
                <Text style={styles.exampleTxt}>
                  For an item with baseline ₹200: owner can price between{" "}
                  <Text style={{ fontWeight: font.black }}>
                    ₹{Math.max(0, 200 - Math.round(200 * g.drop_max_percent / 100))}
                  </Text>{" "}
                  and{" "}
                  <Text style={{ fontWeight: font.black }}>
                    ₹{200 + Math.round(200 * g.hike_max_percent / 100)}
                  </Text>.
                </Text>
              </View>
            </View>

            {err ? <Text style={styles.error}>{err}</Text> : null}

            <TouchableOpacity
              style={[styles.saveBtn, { opacity: !dirtyG || savingG ? 0.5 : 1 }]}
              disabled={!dirtyG || savingG} onPress={saveGlobal} activeOpacity={0.9}
              testID="save-global-policy">
              {savingG ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name={savedG ? "checkmark-circle" : "save-outline"} size={18} color={colors.onPrimary} />
                  <Text style={styles.saveTxt}>{savedG ? "Saved" : dirtyG ? "Save Global Policy" : "No changes"}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        )
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {!selected ? (
            <>
              <Text style={styles.sectionLabel}>SELECT A RESTAURANT TO OVERRIDE</Text>
              <TextInput
                value={searchQ}
                onChangeText={setSearchQ}
                placeholder="Search restaurants..."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { marginTop: spacing.sm }]}
                testID="policy-search"
              />
              <View style={{ marginTop: spacing.md, gap: 8 }}>
                {filteredRestaurants.map((r) => (
                  <TouchableOpacity key={r.id} activeOpacity={0.85} onPress={() => openRestaurant(r)}
                    style={styles.restRow} testID={`rest-${r.id}`}>
                    {r.image ? <Image source={{ uri: r.image }} style={styles.restImg} /> : <View style={[styles.restImg, { backgroundColor: colors.background }]} />}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.restName}>{r.name}</Text>
                      <Text style={styles.restSub}>
                        {r.price_policy ? "Custom override set" : "Follows global policy"}
                      </Text>
                    </View>
                    {r.price_policy ? <View style={styles.customBadge}><Text style={styles.customBadgeTxt}>OVERRIDE</Text></View> : null}
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => { setSelected(null); setOverride(null); setEffective(null); loadRestaurants(); }} style={styles.backRow} testID="back-to-list">
                <Ionicons name="chevron-back" size={18} color={colors.primary} />
                <Text style={styles.backTxt}>Back to restaurants</Text>
              </TouchableOpacity>
              <Text style={styles.sectionLabel}>{selected.name.toUpperCase()}</Text>
              <Text style={styles.help}>
                Set restaurant-specific limits. Leave a field to inherit the global default.
              </Text>

              {!effective ? (
                <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
              ) : (
                <>
                  <View style={[styles.card, { marginTop: spacing.md }]}>
                    <ToggleRow
                      label="Allow owner price edits"
                      sub="Overrides global master switch"
                      icon="lock-open-outline"
                      value={(override?.allow_owner_price_edit ?? effective.allow_owner_price_edit) as boolean}
                      onChange={(v) => patchOverride("allow_owner_price_edit", v)}
                      testID="rest-allow-edit"
                    />
                    <View style={styles.divider} />
                    <NumberRow
                      label="Max hike allowed"
                      sub={`Current: ${effective.hike_max_percent}%`}
                      icon="trending-up-outline" suffix="%"
                      value={(override?.hike_max_percent ?? effective.hike_max_percent) as number}
                      onChange={(v) => patchOverride("hike_max_percent", v)}
                      min={0} max={500} testID="rest-hike"
                    />
                    <View style={styles.divider} />
                    <NumberRow
                      label="Max drop allowed"
                      sub={`Current: ${effective.drop_max_percent}%`}
                      icon="trending-down-outline" suffix="%"
                      value={(override?.drop_max_percent ?? effective.drop_max_percent) as number}
                      onChange={(v) => patchOverride("drop_max_percent", v)}
                      min={0} max={100} testID="rest-drop"
                    />
                  </View>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.lg }}>
                    <TouchableOpacity
                      style={[styles.saveBtnGhost]}
                      disabled={savingR || !override}
                      onPress={clearOverride}
                      activeOpacity={0.85}
                      testID="clear-rest-policy"
                    >
                      <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} />
                      <Text style={styles.saveTxtGhost}>Clear Override</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveBtn, { flex: 1, marginTop: 0, opacity: savingR || !override ? 0.5 : 1 }]}
                      disabled={savingR || !override}
                      onPress={saveOverride}
                      activeOpacity={0.9}
                      testID="save-rest-policy"
                    >
                      {savingR ? <ActivityIndicator color={colors.onPrimary} /> : (
                        <>
                          <Ionicons name="save-outline" size={18} color={colors.onPrimary} />
                          <Text style={styles.saveTxt}>Save Override</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function ToggleRow({ label, sub, icon, value, onChange, testID }: any) {
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.iconBox}><Ionicons name={icon} size={18} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={rowStyles.label}>{label}</Text>
        <Text style={rowStyles.sub}>{sub}</Text>
      </View>
      <Switch value={!!value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor="#fff" testID={testID} />
    </View>
  );
}

function NumberRow({ label, sub, icon, value, onChange, min, max, suffix, testID }: any) {
  const dec = () => onChange(Math.max(min, (value || 0) - 5));
  const inc = () => onChange(Math.min(max, (value || 0) + 5));
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.iconBox}><Ionicons name={icon} size={18} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={rowStyles.label}>{label}</Text>
        <Text style={rowStyles.sub}>{sub}</Text>
      </View>
      <View style={rowStyles.stepper}>
        <TouchableOpacity onPress={dec} style={rowStyles.stepBtn} testID={`${testID}-dec`}><Ionicons name="remove" size={16} color={colors.textPrimary} /></TouchableOpacity>
        <TextInput
          value={String(value ?? 0)}
          onChangeText={(t) => onChange(Math.max(min, Math.min(max, parseInt(t.replace(/[^0-9]/g, "") || "0", 10))))}
          keyboardType="number-pad"
          style={rowStyles.stepInput}
          testID={testID}
        />
        <Text style={rowStyles.suffix}>{suffix}</Text>
        <TouchableOpacity onPress={inc} style={rowStyles.stepBtn} testID={`${testID}-inc`}><Ionicons name="add" size={16} color={colors.textPrimary} /></TouchableOpacity>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  iconBox: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  stepInput: { width: 44, textAlign: "center", fontSize: 14, fontWeight: font.bold, color: colors.textPrimary, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingVertical: 4 },
  suffix: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary, marginHorizontal: 2 },
});

const styles = StyleSheet.create({
  tabsWrap: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabTxt: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  sectionLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6 },
  help: { fontSize: 12, color: colors.textSecondary, marginTop: 6, lineHeight: 18 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },
  restRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 10 },
  restImg: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.background },
  restName: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  restSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  customBadge: { backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  customBadgeTxt: { fontSize: 10, fontWeight: font.black, color: colors.primary, letterSpacing: 0.5 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 10 },
  backTxt: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  exampleCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FEF6E7", borderWidth: 1, borderColor: "#F59E0B", padding: 12, borderRadius: radius.lg },
  exampleTitle: { fontSize: 13, fontWeight: font.black, color: "#92400E" },
  exampleTxt: { fontSize: 12, color: "#92400E", marginTop: 2, lineHeight: 18 },
  error: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.md },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: radius.lg, marginTop: spacing.xl, backgroundColor: colors.primary, ...shadow.lifted },
  saveTxt: { fontSize: 15, fontWeight: font.black, color: colors.onPrimary },
  saveBtnGhost: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 52, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  saveTxtGhost: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
});
