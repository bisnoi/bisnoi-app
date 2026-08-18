import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useSmartBack } from "@/src/utils/nav";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ApplicationStatusPill } from "@/src/applicationStatus";
import { Empty } from "@/src/components/ui";

export default function ApplyHub() {
  const router = useRouter();
  const goBack = useSmartBack();
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await Api.myApplications();
      setApps((r as any[]) || []);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const hasActivePartner = apps.some((a) => a.type === "restaurant_partner" && ["pending", "clarification_requested", "approved"].includes(a.status));
  const hasActiveRider = apps.some((a) => a.type === "rider" && ["pending", "clarification_requested", "approved"].includes(a.status));

  const goApp = (a: any) => {
    if (a.status === "clarification_requested") {
      router.push({ pathname: "/customer/apply/clarification", params: { id: a.id } } as any);
    } else {
      // Read-only timeline view via same clarification screen (we will show details)
      router.push({ pathname: "/customer/apply/clarification", params: { id: a.id, view: "1" } } as any);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="customer-apply-back" onPress={goBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Become a Partner</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.lead}>Grow with Bisnoi</Text>
        <Text style={styles.leadSub}>Join thousands of partners and riders earning with us. Pick a path below.</Text>

        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.card, hasActivePartner && styles.cardDisabled]}
            disabled={hasActivePartner}
            onPress={() => router.push("/customer/apply/partner" as any)}
          >
            <View style={[styles.cardIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="restaurant" size={26} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Restaurant Partner</Text>
              <Text style={styles.cardSub}>List your restaurant, manage menu, accept orders</Text>
              {hasActivePartner ? (
                <Text style={styles.activeNote}>Application already in progress</Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.card, hasActiveRider && styles.cardDisabled]}
            disabled={hasActiveRider}
            onPress={() => router.push("/customer/apply/rider" as any)}
          >
            <View style={[styles.cardIcon, { backgroundColor: colors.successSoft }]}>
              <Ionicons name="bicycle" size={26} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Delivery Rider</Text>
              <Text style={styles.cardSub}>Flexible earnings, ride and deliver in your free time</Text>
              {hasActiveRider ? (
                <Text style={styles.activeNote}>Application already in progress</Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>MY APPLICATIONS</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : apps.length === 0 ? (
          <Empty icon="document-text" title="No applications yet" subtitle="Pick a path above to get started" />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {apps.map((a) => (
              <TouchableOpacity key={a.id} style={styles.appRow} activeOpacity={0.85} onPress={() => goApp(a)}>
                <View style={[styles.cardIcon, { backgroundColor: a.type === "rider" ? colors.successSoft : colors.primarySoft }]}>
                  <Ionicons name={a.type === "rider" ? "bicycle" : "restaurant"} size={20} color={a.type === "rider" ? colors.success : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.appTitle}>{a.type === "rider" ? "Rider Application" : "Restaurant Partner"}</Text>
                  <Text style={styles.appSub}>Submitted {new Date(a.created_at).toLocaleDateString()}</Text>
                  {a.admin_notes ? (
                    <Text numberOfLines={2} style={styles.adminNote}>“{a.admin_notes}”</Text>
                  ) : null}
                </View>
                <ApplicationStatusPill status={a.status} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  lead: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary },
  leadSub: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  cardDisabled: { opacity: 0.6 },
  cardIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  cardSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  activeNote: { fontSize: 11, fontWeight: font.bold, color: colors.warning, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.3 },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md, fontSize: 13, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.5 },
  appRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  appTitle: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  appSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  adminNote: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontStyle: "italic" },
});
