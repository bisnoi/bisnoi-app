import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Switch, Platform, useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Card, Empty, Pill } from "@/src/components/ui";
import { ReceiptModal, inr, PAY_LABEL, TYPE_LABEL } from "@/src/components/ReceiptModal";
import { TablesView } from "@/src/components/TablesView";
import { KitchenView } from "@/src/components/KitchenView";
import { DineinOrdersView } from "@/src/components/DineinOrdersView";
import { TableOrderModal } from "@/src/components/TableOrderModal";

type Item = { id: string; restaurant_id: string; name: string; price: number; category?: string; category_id?: string | null; veg?: boolean; available?: boolean; is_available?: boolean };
type Cat = { id: string; restaurant_id: string; name: string };
type Rest = { id: string; name: string };

const PAYMENTS: { key: "cash" | "upi" | "card"; label: string; icon: any }[] = [
  { key: "cash", label: "Cash", icon: "cash" },
  { key: "upi", label: "UPI", icon: "qr-code" },
  { key: "card", label: "Card", icon: "card" },
];
const TYPES: { key: "dine_in" | "takeaway" | "walk_in"; label: string }[] = [
  { key: "dine_in", label: "Dine-in" },
  { key: "takeaway", label: "Takeaway" },
  { key: "walk_in", label: "Walk-in" },
];

function localDayKey(dt: Date) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function dayLabel(dt: Date, todayKey: string, yestKey: string) {
  const k = localDayKey(dt);
  if (k === todayKey) return "Today";
  if (k === yestKey) return "Yesterday";
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function OwnerPOS() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ table?: string; type?: string }>();
  const [mode, setMode] = useState<"tables" | "dinein" | "kitchen" | "quick" | "bills">(
    params?.table || params?.type === "pickup" || params?.type === "delivery" ? "quick" : "tables"
  );
  const [rests, setRests] = useState<Rest[]>([]);
  const [activeRest, setActiveRest] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  // Dine-in tables / kitchen
  const [reloadSignal, setReloadSignal] = useState(0);
  const [selectedTable, setSelectedTable] = useState<{ id: string; label: string } | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  const bumpReload = () => setReloadSignal((n) => n + 1);

  useEffect(() => {
    if (autoOpened || !activeRest) return;
    if (params?.type === "pickup" || params?.type === "delivery") {
      setMode("quick");
      setOrderType(params.type === "pickup" ? "takeaway" : "walk_in");
      setAutoOpened(true);
      return;
    }
    if (!params?.table) return;
    const label = String(params.table);
    (async () => {
      try {
        const list: any = await Api.ownerTables(activeRest);
        const found = (list || []).find((t: any) => String(t.label) === label);
        if (found) {
          setSelectedTable({ id: found.id, label: found.label });
          setTableOpen(true);
        }
      } catch (e: any) {
        console.warn(e?.message);
      } finally {
        setAutoOpened(true);
      }
    })();
  }, [activeRest, params?.table, params?.type, autoOpened]);

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [cart, setCart] = useState<Record<string, { item: Item; qty: number }>>({});
  const [discountType, setDiscountType] = useState<"none" | "flat" | "percent">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxPercent, setTaxPercent] = useState("5");
  const [payment, setPayment] = useState<"cash" | "upi" | "card">("cash");
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "walk_in">("dine_in");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);
  const [billsFilter, setBillsFilter] = useState<"all" | "today" | "yesterday">("all");

  const activeRestObj = rests.find((r: any) => r.id === activeRest) as any;
  const posOff = !!activeRestObj && activeRestObj.pos_enabled === false;

  const load = useCallback(async () => {
    try {
      const [r, it, c, s] = await Promise.all([
        Api.ownerRests() as Promise<Rest[]>,
        Api.ownerListItems() as Promise<Item[]>,
        Api.ownerCategories() as Promise<Cat[]>,
        Api.ownerPosStats().catch(() => null),
      ]);
      setRests(r || []);
      setItems(it || []);
      setCats(c || []);
      setStats(s);
      if ((r || []).length && !activeRest) setActiveRest(r[0].id);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setLoading(false);
    }
  }, [activeRest]);

  const loadHistory = useCallback(async () => {
    try {
      const h = await Api.ownerListPos();
      setHistory((h as any[]) || []);
      Api.ownerPosStats().then(setStats).catch(() => {});
    } catch (e: any) { console.warn(e?.message); }
  }, []);

  const billGroups = useMemo(() => {
    const now = new Date();
    const todayKey = localDayKey(now);
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestKey = localDayKey(yest);

    const map = new Map<string, { key: string; label: string; bills: any[]; total: number }>();
    const sorted = [...history].sort((a: any, b: any) => {
      const ta = new Date(a.created_at || a.createdAt || a.date || a.timestamp || 0).getTime();
      const tb = new Date(b.created_at || b.createdAt || b.date || b.timestamp || 0).getTime();
      return tb - ta;
    });
    for (const b of sorted as any[]) {
      const raw = b.created_at || b.createdAt || b.date || b.timestamp;
      const dt = raw ? new Date(raw) : null;
      const valid = dt && !isNaN(dt.getTime());
      const key = valid ? localDayKey(dt as Date) : "unknown";
      const label = valid ? dayLabel(dt as Date, todayKey, yestKey) : "Earlier";
      if (!map.has(key)) map.set(key, { key, label, bills: [], total: 0 });
      const g = map.get(key)!;
      g.bills.push(b);
      g.total += Number(b.total) || 0;
    }
    return Array.from(map.values());
  }, [history]);

  const visibleGroups = useMemo(() => {
    if (billsFilter === "all") return billGroups;
    const now = new Date();
    const todayKey = localDayKey(now);
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestKey = localDayKey(yest);
    const wantKey = billsFilter === "today" ? todayKey : yestKey;
    return billGroups.filter((g) => g.key === wantKey);
  }, [billGroups, billsFilter]);

  const analyticsTotals = useMemo(() => {
    const bills = visibleGroups.flatMap((g) => g.bills);
    const totalSales = bills.reduce((s: number, b: any) => s + (Number(b.total) || 0), 0);
    return { count: bills.length, sales: totalSales, avg: bills.length ? totalSales / bills.length : 0 };
  }, [visibleGroups]);

  useFocusEffect(useCallback(() => { load(); }, []));

  const restItems = useMemo(
    () => items.filter((i) => (!activeRest || i.restaurant_id === activeRest) && (i.is_available ?? i.available ?? true) !== false),
    [items, activeRest],
  );
  const restCats = useMemo(() => cats.filter((c) => !activeRest || c.restaurant_id === activeRest), [cats, activeRest]);
  const catNames = useMemo(() => {
    const names = new Set<string>();
    restCats.forEach((c) => { if (c.name) names.add(c.name); });
    restItems.forEach((i) => { if (i.category) names.add(i.category); });
    return Array.from(names);
  }, [restCats, restItems]);
  const shownItems = useMemo(() => {
    let list = restItems;
    if (activeCat !== "all") list = list.filter((i) => (i.category || "") === activeCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [restItems, activeCat, search]);

  const cartList = Object.values(cart);
  const subtotal = cartList.reduce((s, c) => s + c.item.price * c.qty, 0);
  const dVal = parseFloat(discountValue) || 0;
  const discountAmount =
    discountType === "percent" ? Math.min(subtotal * Math.min(dVal, 100) / 100, subtotal)
      : discountType === "flat" ? Math.min(dVal, subtotal) : 0;
  const taxable = subtotal - discountAmount;
  const tPct = parseFloat(taxPercent) || 0;
  const taxAmount = taxEnabled ? taxable * tPct / 100 : 0;
  const total = taxable + taxAmount;

  const addItem = (it: Item) => setCart((p) => ({ ...p, [it.id]: { item: it, qty: (p[it.id]?.qty || 0) + 1 } }));
  const decItem = (id: string) => setCart((p) => {
    const cur = p[id]; if (!cur) return p;
    const q = cur.qty - 1; const n = { ...p };
    if (q <= 0) delete n[id]; else n[id] = { ...cur, qty: q };
    return n;
  });
  const resetBill = () => {
    setCart({}); setDiscountType("none"); setDiscountValue(""); setTaxEnabled(false); setTaxPercent("5");
    setPayment("cash"); setOrderType("dine_in"); setCustomerName(""); setCustomerPhone("");
  };

  const generate = async () => {
    if (cartList.length === 0) return;
    setSaving(true);
    try {
      const body = {
        restaurant_id: activeRest,
        order_type: orderType,
        items: cartList.map((c) => ({ menu_item_id: c.item.id, name: c.item.name, price: c.item.price, qty: c.qty })),
        discount_type: discountType === "none" ? null : discountType,
        discount_value: discountType === "none" ? 0 : dVal,
        tax_enabled: taxEnabled,
        tax_percent: tPct,
        payment_method: payment,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
      };
      const res = await Api.ownerCreatePos(body);
      setReceipt(res);
      resetBill();
      Api.ownerPosStats().then(setStats).catch(() => {});
    } catch (e: any) {
      if (Platform.OS === "web") window.alert(e?.message || "Failed to create bill");
    } finally {
      setSaving(false);
    }
  };

  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      {/* Title */}
      <View style={styles.titleBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>POS Billing</Text>
          <Text style={styles.sub}>Today: {stats ? `${stats.today_bills} bills • ${inr(stats.today_sales)}` : "—"}</Text>
        </View>
      </View>

      {/* Mode pills */}
      <View style={{ minWidth: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={[styles.modeRow, { paddingRight: spacing.xl }]}>
          {([
            { k: "tables", label: "Tables", icon: "grid" },
            { k: "dinein", label: "Dine-in", icon: "restaurant" },
            { k: "kitchen", label: "Kitchen", icon: "flame" },
            { k: "quick", label: "Quick Bill", icon: "flash" },
            { k: "bills", label: "Bills", icon: "receipt" },
          ] as const).map((m) => (
            <TouchableOpacity
              key={m.k}
              testID={`pos-mode-${m.k}`}
              onPress={() => { setMode(m.k); if (m.k === "bills") loadHistory(); else bumpReload(); }}
              style={[styles.modePill, mode === m.k && styles.modePillOn]}
              activeOpacity={0.85}
            >
              <Ionicons name={m.icon as any} size={15} color={mode === m.k ? colors.onPrimary : colors.textSecondary} />
              <Text style={[styles.modePillTxt, mode === m.k && styles.modePillTxtOn]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {rests.length > 1 && mode !== "bills" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.restRow}>
          {rests.map((r) => <Pill key={r.id} label={r.name} active={activeRest === r.id} onPress={() => { setActiveRest(r.id); setCart({}); bumpReload(); }} icon="restaurant" />)}
        </ScrollView>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 50 }} />
      ) : posOff ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="lock-closed" size={36} color={colors.textMuted} />
          </View>
          <Text style={{ fontSize: 19, fontWeight: font.black, color: colors.textPrimary, marginTop: 16 }}>POS is disabled</Text>
          <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 20, maxWidth: 320 }}>
            The Bisnoi POS &amp; Dine-in system is turned off for this outlet. Please contact Bisnoi admin to enable it.
          </Text>
        </View>
      ) : mode === "tables" ? (
        <TablesView
          rid={activeRest || undefined}
          reloadSignal={reloadSignal}
          onOpenTable={(t) => { setSelectedTable(t); setTableOpen(true); }}
        />
      ) : mode === "dinein" ? (
        <DineinOrdersView rid={activeRest || undefined} reloadSignal={reloadSignal} onChanged={bumpReload} />
      ) : mode === "kitchen" ? (
        <KitchenView rid={activeRest || undefined} reloadSignal={reloadSignal} onChanged={bumpReload} />
      ) : mode === "bills" ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
          <View style={styles.analyticsRow}>
            <View style={styles.analyticsCard}>
              <Text style={styles.analyticsVal}>{analyticsTotals.count}</Text>
              <Text style={styles.analyticsLabel}>Bills</Text>
            </View>
            <View style={styles.analyticsCard}>
              <Text style={styles.analyticsVal}>{inr(analyticsTotals.sales)}</Text>
              <Text style={styles.analyticsLabel}>Total Sales</Text>
            </View>
            <View style={styles.analyticsCard}>
              <Text style={styles.analyticsVal}>{inr(analyticsTotals.avg)}</Text>
              <Text style={styles.analyticsLabel}>Avg Bill</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: spacing.md }} contentContainerStyle={{ gap: 8 }}>
            <Pill label="All" active={billsFilter === "all"} onPress={() => setBillsFilter("all")} />
            <Pill label="Today" active={billsFilter === "today"} onPress={() => setBillsFilter("today")} />
            <Pill label="Yesterday" active={billsFilter === "yesterday"} onPress={() => setBillsFilter("yesterday")} />
          </ScrollView>

          {history.length === 0 ? (
            <Empty icon="receipt-outline" title="No bills yet" subtitle="Generated POS bills will appear here." />
          ) : visibleGroups.length === 0 ? (
            <Empty icon="receipt-outline" title="No bills for this date" subtitle="Try a different filter." />
          ) : visibleGroups.map((g) => (
            <View key={g.key} style={{ marginBottom: spacing.lg }}>
              <View style={styles.dayHead}>
                <Text style={styles.dayHeadLabel}>{g.label.toUpperCase()}</Text>
                <Text style={styles.dayHeadAmt}>{inr(g.total)}</Text>
              </View>
              {g.bills.map((b: any) => (
                <TouchableOpacity key={b.id} activeOpacity={0.85} onPress={() => setReceipt(b)} testID={`pos-history-${b.id}`}>
                  <Card style={{ marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={styles.billIc}><Ionicons name="receipt" size={18} color={colors.primary} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.billNo}>{b.bill_number}{b.table_label ? ` • ${b.table_label}` : ""}</Text>
                        <Text style={styles.billMeta}>{b.item_count} items • {TYPE_LABEL[b.order_type] || b.order_type} • {PAY_LABEL[b.payment_method] || b.payment_method}</Text>
                      </View>
                      <Text style={styles.billTotal}>{inr(b.total)}</Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : restItems.length === 0 ? (
        <Empty icon="fast-food" title="No menu items" subtitle="Add items in the Menu tab before billing." />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 230 }} keyboardShouldPersistTaps="handled">
            {/* Search + categories */}
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput testID="pos-search" value={search} onChangeText={setSearch} placeholder="Search items" placeholderTextColor={colors.textMuted} style={styles.searchInput} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: spacing.sm }} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              <Pill label="All" active={activeCat === "all"} onPress={() => setActiveCat("all")} />
              {catNames.map((name) => <Pill key={name} label={name} active={activeCat === name} onPress={() => setActiveCat(name)} />)}
            </ScrollView>

            {/* Item grid */}
            <View style={styles.grid}>
              {shownItems.map((it) => {
                const q = cart[it.id]?.qty || 0;
                return (
                  <View key={it.id} style={styles.itemCard}>
                    <Text style={styles.itemName} numberOfLines={2}>{it.name}</Text>
                    <Text style={styles.itemPrice}>{inr(it.price)}</Text>
                    {q > 0 ? (
                      <View style={styles.stepper}>
                        <TouchableOpacity testID={`pos-dec-${it.id}`} onPress={() => decItem(it.id)} style={styles.stepBtn}><Ionicons name="remove" size={16} color={colors.onPrimary} /></TouchableOpacity>
                        <Text style={styles.stepQty}>{q}</Text>
                        <TouchableOpacity testID={`pos-inc-${it.id}`} onPress={() => addItem(it)} style={styles.stepBtn}><Ionicons name="add" size={16} color={colors.onPrimary} /></TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity testID={`pos-add-${it.id}`} onPress={() => addItem(it)} style={styles.addBtn} activeOpacity={0.85}>
                        <Ionicons name="add" size={16} color={colors.primary} />
                        <Text style={styles.addTxt}>Add</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Cart + bill options (only when cart has items) */}
            {cartList.length > 0 ? (
              <>
                <Text style={styles.secTitle}>CART ({cartList.length})</Text>
                <Card style={{ marginBottom: spacing.md }}>
                  {cartList.map((c) => (
                    <View key={c.item.id} style={styles.cartRow}>
                      <Text style={styles.cartName} numberOfLines={1}>{c.item.name}</Text>
                      <View style={styles.cartStepper}>
                        <TouchableOpacity onPress={() => decItem(c.item.id)} style={styles.cartStepBtn}><Ionicons name="remove" size={14} color={colors.textPrimary} /></TouchableOpacity>
                        <Text style={styles.cartQty}>{c.qty}</Text>
                        <TouchableOpacity onPress={() => addItem(c.item)} style={styles.cartStepBtn}><Ionicons name="add" size={14} color={colors.textPrimary} /></TouchableOpacity>
                      </View>
                      <Text style={styles.cartAmt}>{inr(c.item.price * c.qty)}</Text>
                    </View>
                  ))}
                </Card>

                {/* Order type */}
                <Text style={styles.secTitle}>ORDER TYPE</Text>
                <View style={styles.segRow}>
                  {TYPES.map((t) => (
                    <TouchableOpacity key={t.key} testID={`pos-type-${t.key}`} onPress={() => setOrderType(t.key)} style={[styles.seg, orderType === t.key && styles.segOn]}>
                      <Text style={[styles.segTxt, orderType === t.key && styles.segTxtOn]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Discount */}
                <Text style={styles.secTitle}>DISCOUNT</Text>
                <View style={styles.segRow}>
                  {(["none", "flat", "percent"] as const).map((d) => (
                    <TouchableOpacity key={d} testID={`pos-disc-${d}`} onPress={() => setDiscountType(d)} style={[styles.seg, discountType === d && styles.segOn]}>
                      <Text style={[styles.segTxt, discountType === d && styles.segTxtOn]}>{d === "none" ? "None" : d === "flat" ? "₹ Flat" : "% Percent"}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {discountType !== "none" ? (
                  <TextInput testID="pos-disc-value" value={discountValue} onChangeText={(t) => setDiscountValue(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder={discountType === "percent" ? "Discount %" : "Discount amount ₹"} placeholderTextColor={colors.textMuted} style={styles.input} />
                ) : null}

                {/* GST */}
                <View style={styles.taxRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="receipt-outline" size={18} color={colors.primary} />
                    <Text style={styles.taxLabel}>Add GST / Tax</Text>
                  </View>
                  <Switch testID="pos-tax-toggle" value={taxEnabled} onValueChange={setTaxEnabled} trackColor={{ true: colors.primary, false: colors.borderStrong }} />
                </View>
                {taxEnabled ? (
                  <TextInput testID="pos-tax-percent" value={taxPercent} onChangeText={(t) => setTaxPercent(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="GST %" placeholderTextColor={colors.textMuted} style={styles.input} />
                ) : null}

                {/* Payment */}
                <Text style={styles.secTitle}>PAYMENT</Text>
                <View style={styles.segRow}>
                  {PAYMENTS.map((pm) => (
                    <TouchableOpacity key={pm.key} testID={`pos-pay-${pm.key}`} onPress={() => setPayment(pm.key)} style={[styles.seg, payment === pm.key && styles.segOn]}>
                      <Ionicons name={pm.icon} size={15} color={payment === pm.key ? colors.onPrimary : colors.textSecondary} />
                      <Text style={[styles.segTxt, payment === pm.key && styles.segTxtOn, { marginLeft: 5 }]}>{pm.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Customer (optional) */}
                <Text style={styles.secTitle}>CUSTOMER (OPTIONAL)</Text>
                <TextInput testID="pos-cust-name" value={customerName} onChangeText={setCustomerName} placeholder="Customer name" placeholderTextColor={colors.textMuted} style={styles.input} />
                <TextInput testID="pos-cust-phone" value={customerPhone} onChangeText={(t) => setCustomerPhone(t.replace(/[^0-9]/g, "").slice(0, 10))} keyboardType="phone-pad" placeholder="Phone" placeholderTextColor={colors.textMuted} style={[styles.input, { marginTop: 8 }]} />
              </>
            ) : (
              <View style={{ marginTop: spacing.lg }}>
                <Empty icon="cart-outline" title="Cart is empty" subtitle="Tap items above to start a bill." />
              </View>
            )}
          </ScrollView>

          {/* Sticky checkout bar */}
          {cartList.length > 0 ? (
            <View style={[styles.checkoutBar, { bottom: 68 + insets.bottom }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.coSmall}>{cartList.reduce((s, c) => s + c.qty, 0)} items • Sub {inr(subtotal)}{discountAmount > 0 ? ` • -${inr(discountAmount)}` : ""}{taxAmount > 0 ? ` • GST ${inr(taxAmount)}` : ""}</Text>
                <Text style={styles.coTotal}>{inr(total)}</Text>
              </View>
              <TouchableOpacity testID="pos-generate" onPress={generate} disabled={saving} style={[styles.genBtn, saving && { opacity: 0.6 }]} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color={colors.onPrimary} /> : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color={colors.onPrimary} />
                    <Text style={styles.genTxt}>Generate Bill</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}

      <ReceiptModal visible={!!receipt} bill={receipt} onClose={() => setReceipt(null)} onNewBill={mode === "quick" ? () => setReceipt(null) : undefined} />

      <TableOrderModal
        visible={tableOpen}
        table={selectedTable}
        items={items}
        cats={cats}
        onClose={() => { setTableOpen(false); setSelectedTable(null); bumpReload(); }}
        onChanged={bumpReload}
        onGoKitchen={() => { setTableOpen(false); setSelectedTable(null); setMode("kitchen"); bumpReload(); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  titleBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  modeRow: { paddingHorizontal: spacing.lg, gap: 8, paddingBottom: spacing.sm },
  modePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  modePillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  modePillTxt: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  modePillTxtOn: { color: colors.onPrimary },
  restRow: { paddingHorizontal: spacing.lg, gap: 8, paddingBottom: spacing.sm },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 44, marginBottom: spacing.sm },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  itemCard: { width: "31.5%", minWidth: 150, flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, ...shadow.card },
  itemName: { fontSize: 13, fontWeight: font.bold, color: colors.textPrimary, minHeight: 34 },
  itemPrice: { fontSize: 14, fontWeight: font.black, color: colors.primary, marginTop: 4 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 8, height: 34, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary },
  addTxt: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, backgroundColor: colors.primary, borderRadius: radius.sm, height: 34, paddingHorizontal: 4 },
  stepBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  stepQty: { color: colors.onPrimary, fontWeight: font.black, fontSize: 15 },
  secTitle: { fontSize: 12, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4, marginTop: spacing.lg, marginBottom: spacing.sm },
  cartRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  cartName: { flex: 1, fontSize: 14, fontWeight: font.semi, color: colors.textPrimary },
  cartStepper: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 4 },
  cartStepBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  cartQty: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary, minWidth: 18, textAlign: "center" },
  cartAmt: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary, minWidth: 64, textAlign: "right" },
  segRow: { flexDirection: "row", gap: spacing.sm },
  seg: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  segOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segTxt: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  segTxtOn: { color: colors.onPrimary },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, height: 46, fontSize: 15, color: colors.textPrimary, marginTop: 8 },
  taxRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 52, marginTop: spacing.lg },
  taxLabel: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  checkoutBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, ...shadow.lifted },
  coSmall: { fontSize: 11, color: colors.textSecondary },
  coTotal: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary, marginTop: 1 },
  genBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: 20, height: 50, borderRadius: radius.md },
  genTxt: { fontSize: 15, fontWeight: font.black, color: colors.onPrimary },
  billIc: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  billNo: { fontSize: 14, fontWeight: font.black, color: colors.textPrimary },
  billMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  billTotal: { fontSize: 16, fontWeight: font.black, color: colors.primary },
  analyticsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  analyticsCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", ...shadow.card },
  analyticsVal: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  analyticsLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: font.semi },
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayHeadLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.4 },
  dayHeadAmt: { fontSize: 14, fontWeight: font.black, color: colors.primary },
});
