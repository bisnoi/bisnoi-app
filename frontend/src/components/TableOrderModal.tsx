import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Switch, Modal, Platform, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Pill } from "@/src/components/ui";
import { ReceiptModal, inr } from "@/src/components/ReceiptModal";

type ItemVariation = { id: string; name: string; price: number; is_available?: boolean };
type Item = { id: string; restaurant_id: string; name: string; price: number; category?: string; category_id?: string | null; subcategory_id?: string | null; veg?: boolean; available?: boolean; is_available?: boolean; variations?: ItemVariation[]; isOpenItem?: boolean };
type Cat = { id: string; restaurant_id: string; name: string; parent_id?: string | null };
type Table = { id: string; label: string };
type BillItem = { menu_item_id?: string | null; name: string; price: number; qty: number; veg?: boolean | null };

const KOT_STATUS: Record<string, { label: string; color: string }> = {
  sent: { label: "Sent", color: colors.warning },
  preparing: { label: "Preparing", color: colors.primary },
  ready: { label: "Ready", color: colors.success },
};

const keyOf = (i: { menu_item_id?: string | null; name: string; price: number }) =>
  `${i.menu_item_id || i.name}|${i.price}`;

function mergeItems(...lists: BillItem[][]): BillItem[] {
  const map: Record<string, BillItem> = {};
  const order: string[] = [];
  lists.forEach((lst) => (lst || []).forEach((it) => {
    if (!it || (it.qty || 0) <= 0) return;
    const k = keyOf(it);
    if (!map[k]) { map[k] = { ...it, qty: 0 }; order.push(k); }
    map[k].qty += it.qty;
  }));
  return order.map((k) => map[k]).filter((m) => m.qty > 0);
}

export function TableOrderModal({
  visible, table, items, cats, onClose, onChanged, onGoKitchen,
}: {
  visible: boolean;
  table: Table | null;
  items: Item[];
  cats: Cat[];
  onClose: () => void;
  onChanged: () => void;
  onGoKitchen?: () => void;
}) {
  const [tab, setTab] = useState<"add" | "bill">("add");
  const [session, setSession] = useState<any>(null);
  const [kotItems, setKotItems] = useState<BillItem[]>([]);
  const [draftItems, setDraftItems] = useState<BillItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [newCart, setNewCart] = useState<Record<string, { item: Item; qty: number; variation?: ItemVariation }>>({});
  const [varPickItem, setVarPickItem] = useState<Item | null>(null);
  const [openItemModal, setOpenItemModal] = useState(false);
  const [oiName, setOiName] = useState("");
  const [oiAmount, setOiAmount] = useState("");
  const cartKey = (itemId: string, variationId?: string) => (variationId ? `${itemId}::${variationId}` : itemId);

  const [discountType, setDiscountType] = useState<"none" | "flat" | "percent">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxPercent, setTaxPercent] = useState("5");

  const [custName, setCustName] = useState("");
  const [custSuggestions, setCustSuggestions] = useState<{ name: string; phone: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [custPhone, setCustPhone] = useState("");
  const [billTab, setBillTab] = useState<"order" | "customer">("order");
  const [custAddress, setCustAddress] = useState("");
  const [custCity, setCustCity] = useState("");

  const [savingDraft, setSavingDraft] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "kot" | "ebill" | "settle">("");
  const [kotQtyBusy, setKotQtyBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [afterReceiptClose, setAfterReceiptClose] = useState<"stay" | "close">("stay");

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // settlement panel
  const [settleOpen, setSettleOpen] = useState(false);
  const [payCash, setPayCash] = useState("");
  const [payUpi, setPayUpi] = useState("");
  const [payDue, setPayDue] = useState("");
  const [settleMethod, setSettleMethod] = useState<"cash" | "card" | "upi" | "due" | "other">("cash");
  const [settleAmount, setSettleAmount] = useState("");

  const [splitMode, setSplitMode] = useState(false);
  const [partOpen, setPartOpen] = useState(false);
  const [itsPaid, setItsPaid] = useState(false);
  const [itsPaidAmount, setItsPaidAmount] = useState("");

  const applyPayload = (res: any) => {
    setSession(res.session);
    setKotItems(res.kot_items || []);
    setDraftItems((res.draft_items || []).map((d: any) => ({ ...d })));
    const s = res.session;
    if (s) {
      setCustName(s.customer_name || "");
      setCustPhone(s.customer_phone || "");
      setCustAddress(s.customer_address || "");
      setCustCity(s.customer_city || "");
    }
  };

  const loadSession = useCallback(async () => {
    if (!table) return;
    try {
      const res: any = await Api.ownerTableSession(table.id);
      applyPayload(res);
    } catch (e: any) {
      if (Platform.OS === "web") window.alert(e?.message || "Could not load table");
    } finally {
      setLoading(false);
    }
  }, [table]);

  useEffect(() => {
    if (visible && table) {
      setTab("add"); setNewCart({}); setSearch(""); setActiveCat("all");
      setDiscountType("none"); setDiscountValue(""); setTaxEnabled(false); setTaxPercent("5");
      setCustName(""); setCustPhone(""); setCustAddress(""); setCustCity("");
      setPayCash(""); setPayUpi(""); setPayDue(""); setSettleOpen(false); setPartOpen(false);
      setSettleMethod("cash"); setSettleAmount(""); setSplitMode(false);
      setItsPaid(false); setItsPaidAmount("");
      setLoading(true);
      loadSession();
    }
  }, [visible, table, loadSession]);

  const restItems = useMemo(
    () => items.filter((i) => (i.is_available ?? i.available ?? true) !== false),
    [items],
  );
  const catOptions = useMemo(
    () => (cats || []).filter((c) => c.name).map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id || null })),
    [cats],
  );
  const catNames = useMemo(() => catOptions.map((c) => c.name), [catOptions]);
  const shownItems = useMemo(() => {
    let list = restItems;
    if (activeCat !== "all") {
      const sel = catOptions.find((c) => c.id === activeCat);
      if (sel) {
        list = sel.parent_id
          ? list.filter((i) => i.subcategory_id === sel.id)
          : list.filter((i) => i.category_id === sel.id || i.subcategory_id === sel.id);
      } else {
        list = list.filter((i) => (i.category || "") === activeCat);
      }
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [restItems, activeCat, search, catOptions]);

  const newCartList = Object.values(newCart);
  const newCartQty = newCartList.reduce((s, c) => s + c.qty, 0);
  const addNew = (it: Item, variation?: ItemVariation) => {
    const key = cartKey(it.id, variation?.id);
    setNewCart((p) => ({ ...p, [key]: { item: it, qty: (p[key]?.qty || 0) + 1, variation } }));
  };
  const decNew = (id: string) => setNewCart((p) => {
    const cur = p[id]; if (!cur) return p;
    const q = cur.qty - 1; const n = { ...p };
    if (q <= 0) delete n[id]; else n[id] = { ...cur, qty: q };
    return n;
  });

  // Combined bill = sent KOT items + not-yet-sent draft items (live).
  const billItems = useMemo(() => mergeItems(kotItems, draftItems), [kotItems, draftItems]);
  const subtotal = useMemo(() => billItems.reduce((s, m) => s + m.price * m.qty, 0), [billItems]);
  const dVal = parseFloat(discountValue) || 0;
  const discountAmount = discountType === "percent" ? Math.min(subtotal * Math.min(dVal, 100) / 100, subtotal)
    : discountType === "flat" ? Math.min(dVal, subtotal) : 0;
  const taxable = subtotal - discountAmount;
  const tPct = parseFloat(taxPercent) || 0;
  const taxAmount = taxEnabled ? taxable * tPct / 100 : 0;
  const grandTotal = Math.max(0, taxable + taxAmount);

  const phoneOk = custPhone.trim().length === 10;
  const nameOk = custName.trim().length > 0;
  const customerOk = phoneOk && nameOk;
  const hasRunning = billItems.length > 0;

  const customerBody = () => ({
    customer_name: custName.trim() || null,
    customer_phone: custPhone.trim() || null,
    customer_address: custAddress.trim() || null,
    customer_city: custCity.trim() || null,
  });

  // Autocomplete: as the owner types a phone prefix, look up returning
  // customers from past POS bills so they can pick one instead of retyping.
  useEffect(() => {
    if (custPhone.trim().length < 2) { setCustSuggestions([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      Api.ownerSearchCustomers(custPhone.trim())
        .then((res: any) => { if (alive) setCustSuggestions(Array.isArray(res) ? res : []); })
        .catch(() => { if (alive) setCustSuggestions([]); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [custPhone]);

  const pickCustomer = (c: { name: string; phone: string }) => {
    setCustPhone(c.phone);
    if (c.name) setCustName(c.name);
    setShowSuggestions(false);
    setCustSuggestions([]);
  };

  const openHistory = async () => {
    if (!phoneOk) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res: any = await Api.ownerCustomerHistory(custPhone.trim());
      setHistoryOrders(res?.orders || []);
    } catch (e: any) {
      setHistoryOrders([]);
    } finally {
      setHistoryLoading(false);
    }
  };
  const draftPayload = (list: BillItem[]) =>
    list.map((d) => ({ menu_item_id: d.menu_item_id, name: d.name, price: d.price, qty: d.qty, veg: d.veg }));

  const persistDraft = useCallback(async (list: BillItem[]) => {
    if (!table) return;
    setSavingDraft(true);
    try {
      const res: any = await Api.ownerSaveDraft(table.id, { items: draftPayload(list), ...customerBody() });
      applyPayload(res);
      onChanged();
    } catch (e: any) {
      if (Platform.OS === "web") window.alert(e?.message || "Could not save");
      await loadSession();
    } finally {
      setSavingDraft(false);
    }
  }, [table, custName, custPhone, custAddress, custCity]);

  // "Add item" — merge the selected round into the order's draft (NOT sent to kitchen).
  const addItemsToOrder = async () => {
    if (newCartList.length === 0) return;
    const next = mergeItems(
      draftItems,
      newCartList.map((c) => ({ menu_item_id: c.item.isOpenItem ? null : c.item.id, name: c.variation ? `${c.item.name} (${c.variation.name})` : c.item.name, price: c.variation ? c.variation.price : c.item.price, qty: c.qty, veg: c.item.veg })),
    );
    setDraftItems(next);
    setNewCart({});
    setTab("bill");
    await persistDraft(next);
  };

  const changeDraftQty = (it: BillItem, delta: number) => {
    const next = draftItems
      .map((d) => (keyOf(d) === keyOf(it) ? { ...d, qty: d.qty + delta } : d))
      .filter((d) => d.qty > 0);
    setDraftItems(next);
    persistDraft(next);
  };
  const removeDraft = (it: BillItem) => {
    const next = draftItems.filter((d) => keyOf(d) !== keyOf(it));
    setDraftItems(next);
    persistDraft(next);
  };

  // Adjust the quantity of an item that's already inside a sent KOT. Allowed
  // any time before the table is settled — table.id + kot.id + item index
  // uniquely identifies the row.
  const changeKotItemQty = async (kotId: string, itemIndex: number, currentQty: number, delta: number) => {
    if (!table) return;
    const newQty = currentQty + delta;
    const busyKey = `${kotId}-${itemIndex}`;
    setKotQtyBusy(busyKey);
    try {
      await Api.ownerUpdateKotItemQty(table.id, kotId, itemIndex, newQty);
      await loadSession();
    } catch (e: any) {
      if (Platform.OS === "web") window.alert(e?.message || "Could not update item quantity");
    } finally {
      setKotQtyBusy(null);
    }
  };

  // SAVE -> persist + go back to tables list
  const onSave = async () => {
    if (!customerOk) { setBillTab("customer"); window.alert("Customer details mandatory"); return; }
    setBusy("save");
    try {
      await persistDraft(draftItems);
      onClose();
    } finally { setBusy(""); }
  };

  // KOT -> send draft to kitchen, then jump to the Kitchen view
  const onSendKot = async () => {
    if (!customerOk) { setBillTab("customer"); window.alert("Customer details mandatory"); return; }
    if (draftItems.length === 0) {
      if (Platform.OS === "web") window.alert("Pehle 'Add item' se item add karein, phir KOT bhejein.");
      return;
    }
    setBusy("kot");
    try {
      await Api.ownerSendKot(table!.id, { items: draftPayload(draftItems), ...customerBody() });
      setDraftItems([]);
      onChanged();
      if (onGoKitchen) onGoKitchen(); else onClose();
    } catch (e: any) {
      if (Platform.OS === "web") window.alert(e?.message || "KOT bhejne me dikkat");
    } finally { setBusy(""); }
  };

  const billRequestBody = () => ({
    discount_type: discountType === "none" ? null : discountType,
    discount_value: discountType === "none" ? 0 : dVal,
    tax_enabled: taxEnabled,
    tax_percent: tPct,
    ...customerBody(),
  });

  // eBILL -> generate + WhatsApp to customer, table stays OPEN
  const onEbill = async () => {
    if (!customerOk) { window.alert("Customer ka naam aur 10-digit phone bharein."); return; }
    setBusy("ebill");
    try {
      // make sure latest draft is saved so the bill includes everything
      await persistDraft(draftItems);
      const res: any = await Api.ownerEbillTable(table!.id, billRequestBody());
      setAfterReceiptClose("stay");
      setReceipt(res);
      onChanged();
    } catch (e: any) {
      window.alert(e?.message || "eBill banane me dikkat");
    } finally { setBusy(""); }
  };

  // PRINT (settle panel) -> just print the current bill, no settlement
  const onPrintOnly = async () => {
    await persistDraft(draftItems);
    if (Platform.OS === "web") window.print();
  };

  // SETTLE -> open the settlement panel
  const openSettle = async () => {
    if (!customerOk) { setBillTab("customer"); window.alert("Customer details mandatory"); return; }
    await persistDraft(draftItems);
    setPayCash(String(Math.round(grandTotal)));
    setPayUpi(""); setPayDue("");
    setSettleMethod("cash"); setSettleAmount(String(Math.round(grandTotal))); setSplitMode(false); setPartOpen(false);
    setItsPaid(false); setItsPaidAmount("");
    setSettleOpen(true);
  };

  const collected = itsPaid
    ? (parseFloat(itsPaidAmount) || 0)
    : splitMode
      ? (parseFloat(payCash) || 0) + (parseFloat(payUpi) || 0) + (parseFloat(payDue) || 0)
      : grandTotal;
  const balance = Math.max(0, grandTotal - collected);
  const change = Math.max(0, collected - grandTotal);

  const confirmSettle = async () => {
    // "Due" is never sent as a payment method — the backend only accepts
    // cash/upi/card. Any shortfall between what's actually collected and the
    // bill total is automatically recorded as due/write-off by the backend,
    // so a "Due" amount (whole-bill or split) means simply sending less than
    // the total (or nothing at all) — never a {method:"due"} entry.
    let payments: { method: string; amount: number }[];
    if (itsPaid) {
      payments = [{ method: settleMethod === "other" || settleMethod === "due" ? "cash" : settleMethod, amount: parseFloat(itsPaidAmount) || 0 }].filter((p) => p.amount > 0);
      if (payments.length === 0) { window.alert("Amount daalein."); return; }
    } else if (splitMode) {
      payments = [
        { method: "cash", amount: parseFloat(payCash) || 0 },
        { method: "upi", amount: parseFloat(payUpi) || 0 },
      ].filter((p) => p.amount > 0);
    } else if (settleMethod === "due") {
      payments = [];
    } else {
      payments = [{ method: settleMethod === "other" ? "upi" : settleMethod, amount: grandTotal }].filter((p) => p.amount > 0);
    }
    setBusy("settle");
    try {
      const res: any = await Api.ownerSettleTable(table!.id, { payments, ...billRequestBody() });
      setSettleOpen(false);
      setAfterReceiptClose("close");
      setReceipt(res);
      onChanged();
    } catch (e: any) {
      window.alert(e?.message || "Settle karne me dikkat");
    } finally { setBusy(""); }
  };

  const cancelTable = () => {
    if (!table) return;
    const ok = Platform.OS === "web" ? window.confirm(`Cancel running order at ${table.label}? This cannot be undone.`) : true;
    if (!ok) return;
    Api.ownerCancelTable(table.id).then(() => { onChanged(); onClose(); }).catch((e: any) => {
      if (Platform.OS === "web") window.alert(e?.message || "Could not cancel");
    });
  };

  const draftQty = draftItems.reduce((s, d) => s + d.qty, 0);
  const billQty = billItems.reduce((s, m) => s + m.qty, 0);

  const categorySidebar = isDesktop ? (
    <ScrollView style={styles.catSidebar} contentContainerStyle={{ paddingVertical: spacing.sm }}>
      <TouchableOpacity testID="table-cat-all" onPress={() => setActiveCat("all")} style={[styles.catSidebarItem, activeCat === "all" && styles.catSidebarItemOn]}>
        <Text style={[styles.catSidebarTxt, activeCat === "all" && styles.catSidebarTxtOn]}>All Items</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="table-cat-open-item" onPress={() => setOpenItemModal(true)} style={styles.catSidebarItem}>
        <Text style={styles.catSidebarTxt}>Open Item</Text>
      </TouchableOpacity>
      {catOptions.map((c) => (
        <TouchableOpacity key={c.id} testID={`table-cat-${c.id}`} onPress={() => setActiveCat(c.id)} style={[styles.catSidebarItem, activeCat === c.id && styles.catSidebarItemOn]}>
          <Text style={[styles.catSidebarTxt, activeCat === c.id && styles.catSidebarTxtOn]} numberOfLines={2}>{c.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  ) : null;

  const addPane = (
    <View style={isDesktop ? styles.addPane : { flex: 1 }}>
      <View style={isDesktop ? styles.addPaneRow : { flex: 1 }}>
        {categorySidebar}
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: newCartQty > 0 ? 150 : 40 }} keyboardShouldPersistTaps="handled">
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput testID="table-search" value={search} onChangeText={setSearch} placeholder="Search items" placeholderTextColor={colors.textMuted} style={styles.searchInput} />
            </View>
            {!isDesktop ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: spacing.sm }} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                <Pill label="All" active={activeCat === "all"} onPress={() => setActiveCat("all")} />
                <Pill label="Open Item" active={false} onPress={() => setOpenItemModal(true)} />
                {catOptions.map((c) => <Pill key={c.id} label={c.name} active={activeCat === c.id} onPress={() => setActiveCat(c.id)} />)}
              </ScrollView>
            ) : null}

            <View style={styles.grid}>
              {shownItems.map((it) => {
                const hasVar = !!(it.variations && it.variations.length > 0);
                const baseKey = cartKey(it.id);
                const q = hasVar
                  ? Object.entries(newCart).filter(([k]) => k === it.id || k.startsWith(`${it.id}::`)).reduce((s, [, v]) => s + v.qty, 0)
                  : (newCart[baseKey]?.qty || 0);
                return (
                  <View key={it.id} style={styles.itemCard}>
                    <Text style={styles.itemName} numberOfLines={2}>{it.name}</Text>
                    <Text style={styles.itemPrice}>{hasVar ? `From ${inr(Math.min(...it.variations!.map((v) => v.price)))}` : inr(it.price)}</Text>
                    {hasVar ? (
                      <TouchableOpacity testID={`table-add-${it.id}`} onPress={() => setVarPickItem(it)} style={styles.addBtn} activeOpacity={0.85}>
                        <Ionicons name="add" size={16} color={colors.primary} />
                        <Text style={styles.addTxt}>{q > 0 ? `Added (${q})` : "Add"}</Text>
                      </TouchableOpacity>
                    ) : q > 0 ? (
                      <View style={styles.stepper}>
                        <TouchableOpacity testID={`table-dec-${it.id}`} onPress={() => decNew(baseKey)} style={styles.stepBtn}><Ionicons name="remove" size={16} color={colors.onPrimary} /></TouchableOpacity>
                        <Text style={styles.stepQty}>{q}</Text>
                        <TouchableOpacity testID={`table-inc-${it.id}`} onPress={() => addNew(it)} style={styles.stepBtn}><Ionicons name="add" size={16} color={colors.onPrimary} /></TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity testID={`table-add-${it.id}`} onPress={() => addNew(it)} style={styles.addBtn} activeOpacity={0.85}>
                        <Ionicons name="add" size={16} color={colors.primary} />
                        <Text style={styles.addTxt}>Add</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <Modal animationType="fade" transparent visible={openItemModal} onRequestClose={() => setOpenItemModal(false)}>
            <View style={styles.popBackdrop}>
              <View style={styles.popCard}>
                <View style={{ padding: spacing.lg }}>
                  <Text style={[styles.itemName, { fontSize: 16, marginBottom: spacing.sm }]}>Open Item</Text>
                  <TextInput
                    testID="open-item-name"
                    value={oiName}
                    onChangeText={setOiName}
                    placeholder="Item name"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, { marginBottom: spacing.sm }]}
                  />
                  <TextInput
                    testID="open-item-amount"
                    value={oiAmount}
                    onChangeText={(t) => setOiAmount(t.replace(/[^0-9.]/g, ""))}
                    keyboardType="numeric"
                    placeholder="Amount ₹"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                  <TouchableOpacity
                    testID="open-item-save"
                    disabled={!oiName.trim() || !(parseFloat(oiAmount) > 0)}
                    onPress={() => {
                      const amt = parseFloat(oiAmount) || 0;
                      if (!oiName.trim() || amt <= 0) return;
                      addNew({
                        id: `open-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        restaurant_id: "",
                        name: oiName.trim(),
                        price: amt,
                        isOpenItem: true,
                      });
                      setOpenItemModal(false);
                      setOiName("");
                      setOiAmount("");
                    }}
                    style={[styles.addBtn, { marginTop: spacing.md, borderColor: colors.primary, backgroundColor: colors.primary, opacity: (!oiName.trim() || !(parseFloat(oiAmount) > 0)) ? 0.5 : 1 }]}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.addTxt, { color: colors.onPrimary }]}>Add to bill</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setOpenItemModal(false)} style={{ marginTop: spacing.sm, alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <Modal animationType="fade" transparent visible={!!varPickItem} onRequestClose={() => setVarPickItem(null)}>
            <View style={styles.popBackdrop}>
              <View style={styles.popCard}>
                <View style={{ padding: spacing.lg }}>
                  <Text style={[styles.itemName, { fontSize: 16, marginBottom: spacing.sm }]}>{varPickItem?.name}</Text>
                  {(varPickItem?.variations || []).map((v) => {
                    const key = cartKey(varPickItem!.id, v.id);
                    const vq = newCart[key]?.qty || 0;
                    return (
                      <View key={v.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <View>
                          <Text style={{ fontSize: 14, fontWeight: font.semi, color: colors.textPrimary }}>{v.name}</Text>
                          <Text style={{ fontSize: 13, color: colors.textMuted }}>{inr(v.price)}</Text>
                        </View>
                        {vq > 0 ? (
                          <View style={styles.stepper}>
                            <TouchableOpacity onPress={() => decNew(key)} style={styles.stepBtn}><Ionicons name="remove" size={16} color={colors.onPrimary} /></TouchableOpacity>
                            <Text style={styles.stepQty}>{vq}</Text>
                            <TouchableOpacity onPress={() => addNew(varPickItem!, v)} style={styles.stepBtn}><Ionicons name="add" size={16} color={colors.onPrimary} /></TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => addNew(varPickItem!, v)} style={styles.addBtn} activeOpacity={0.85}>
                            <Ionicons name="add" size={16} color={colors.primary} />
                            <Text style={styles.addTxt}>Add</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                  <TouchableOpacity onPress={() => setVarPickItem(null)} style={[styles.addBtn, { marginTop: spacing.md, borderColor: colors.primary, backgroundColor: colors.primary }]} activeOpacity={0.85}>
                    <Text style={[styles.addTxt, { color: colors.onPrimary }]}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Sticky "Add item" bar */}
          {newCartQty > 0 ? (
            <View style={styles.kotBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kotBarSmall}>{newCartQty} item(s) selected</Text>
                <Text style={styles.kotBarNames} numberOfLines={1}>{newCartList.map((c) => `${c.variation ? `${c.item.name} (${c.variation.name})` : c.item.name}×${c.qty}`).join(", ")}</Text>
              </View>
              <TouchableOpacity testID="table-add-item" onPress={addItemsToOrder} disabled={savingDraft} style={[styles.kotBtn, savingDraft && { opacity: 0.6 }]} activeOpacity={0.85}>
                {savingDraft ? <ActivityIndicator color={colors.onPrimary} /> : (
                  <>
                    <Ionicons name="add-circle" size={18} color={colors.onPrimary} />
                    <Text style={styles.kotBtnTxt}>Add item</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );

  const billPane = (
    <View style={isDesktop ? styles.billPane : { flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 220 }} keyboardShouldPersistTaps="handled">
        <View style={styles.billTabRow}>
          <TouchableOpacity testID="table-tab-order" onPress={() => setBillTab("order")} style={[styles.billTabBtn, billTab === "order" && styles.billTabBtnOn]}>
            <Text style={[styles.billTabTxt, billTab === "order" && styles.billTabTxtOn]}>Order</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="table-tab-customer" onPress={() => setBillTab("customer")} style={[styles.billTabBtn, billTab === "customer" && styles.billTabBtnOn]}>
            <Text style={[styles.billTabTxt, billTab === "customer" && styles.billTabTxtOn]}>Customer{!customerOk ? " \u2022" : ""}</Text>
          </TouchableOpacity>
        </View>

        {billTab === "order" ? (
        <>
        {/* Add more item */}
        {!isDesktop ? (
          <TouchableOpacity testID="table-add-more" onPress={() => setTab("add")} style={styles.addMoreBtn} activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.addMoreTxt}>Add more item</Text>
          </TouchableOpacity>
        ) : null}

        {!hasRunning ? (
          <View style={styles.emptyBox}>
            <Ionicons name="fast-food-outline" size={40} color={colors.primary} />
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptySub}>Tap “Add more item” to add dishes to this order.</Text>
          </View>
        ) : (
          <>
            {/* CURRENT ORDER (editable, not yet sent) */}
            {draftItems.length > 0 ? (
              <>
                <Text style={styles.secTitle}>CURRENT ORDER ({draftQty}) • not sent</Text>
                <View style={styles.billCard}>
                  {draftItems.map((d, i) => (
                    <View key={`${keyOf(d)}-${i}`} style={styles.draftRow} testID={`table-draft-${d.menu_item_id || d.name}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.billName} numberOfLines={1}>{d.name}</Text>
                        <Text style={styles.draftPrice}>{inr(d.price)} each</Text>
                      </View>
                      <View style={styles.draftStepper}>
                        <TouchableOpacity testID={`table-draft-dec-${d.menu_item_id || d.name}`} onPress={() => changeDraftQty(d, -1)} style={styles.draftStepBtn}><Ionicons name="remove" size={15} color={colors.textPrimary} /></TouchableOpacity>
                        <Text style={styles.draftQty}>{d.qty}</Text>
                        <TouchableOpacity testID={`table-draft-inc-${d.menu_item_id || d.name}`} onPress={() => changeDraftQty(d, 1)} style={styles.draftStepBtn}><Ionicons name="add" size={15} color={colors.textPrimary} /></TouchableOpacity>
                      </View>
                      <Text style={styles.billAmt}>{inr(d.price * d.qty)}</Text>
                      <TouchableOpacity testID={`table-draft-remove-${d.menu_item_id || d.name}`} onPress={() => removeDraft(d)} hitSlop={8} style={{ marginLeft: 6 }}>
                        <Ionicons name="close-circle" size={20} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* KOTs sent */}
            {(session?.kots?.length || 0) > 0 ? (
              <>
                <Text style={styles.secTitle}>KOTS SENT ({session.kots.length})</Text>
                {session.kots.map((k: any) => {
                  const st = KOT_STATUS[k.status] || KOT_STATUS.sent;
                  return (
                    <View key={k.id} style={styles.kotCard} testID={`table-kot-${k.id}`}>
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                        <Text style={styles.kotNo}>{k.kot_number}</Text>
                        <View style={[styles.statusPill, { backgroundColor: st.color + "22" }]}>
                          <Text style={[styles.statusTxt, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </View>
                      {k.items.map((it: any, i: number) => {
                        const busyKey = `${k.id}-${i}`;
                        const isBusy = kotQtyBusy === busyKey;
                        return (
                          <View key={i} style={styles.kotItemRow}>
                            <Text style={styles.kotItem} numberOfLines={1}>{it.name}</Text>
                            <View style={styles.draftStepper}>
                              <TouchableOpacity
                                testID={`table-kot-dec-${k.id}-${i}`}
                                onPress={() => changeKotItemQty(k.id, i, it.qty, -1)}
                                disabled={isBusy}
                                style={[styles.draftStepBtn, isBusy && { opacity: 0.5 }]}
                              >
                                <Ionicons name="remove" size={14} color={colors.textPrimary} />
                              </TouchableOpacity>
                              {isBusy ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                              ) : (
                                <Text style={styles.draftQty}>{it.qty}</Text>
                              )}
                              <TouchableOpacity
                                testID={`table-kot-inc-${k.id}-${i}`}
                                onPress={() => changeKotItemQty(k.id, i, it.qty, 1)}
                                disabled={isBusy}
                                style={[styles.draftStepBtn, isBusy && { opacity: 0.5 }]}
                              >
                                <Ionicons name="add" size={14} color={colors.textPrimary} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </>
            ) : null}

            {/* Bill summary */}
            <Text style={styles.secTitle}>BILL SUMMARY</Text>
            <View style={styles.billCard}>
              {billItems.map((m, i) => (
                <View key={i} style={styles.billRow}>
                  <Text style={styles.billName} numberOfLines={1}>{m.name} <Text style={{ color: colors.textMuted }}>×{m.qty}</Text></Text>
                  <Text style={styles.billAmt}>{inr(m.price * m.qty)}</Text>
                </View>
              ))}
              <View style={styles.billDivider} />
              <View style={styles.billRow}><Text style={styles.billLabel}>Subtotal</Text><Text style={styles.billVal}>{inr(subtotal)}</Text></View>
              {discountAmount > 0 ? <View style={styles.billRow}><Text style={styles.billLabel}>Discount{discountType === "percent" ? ` (${dVal}%)` : ""}</Text><Text style={styles.billVal}>-{inr(discountAmount)}</Text></View> : null}
              {taxAmount > 0 ? <View style={styles.billRow}><Text style={styles.billLabel}>GST ({tPct}%)</Text><Text style={styles.billVal}>+{inr(taxAmount)}</Text></View> : null}
              <View style={styles.billRow}><Text style={styles.billTotalLabel}>TOTAL</Text><Text style={styles.billTotal}>{inr(grandTotal)}</Text></View>
            </View>

            {/* Discount */}
            <Text style={styles.secTitle}>DISCOUNT</Text>
            <View style={styles.segRow}>
              {(["none", "flat", "percent"] as const).map((d) => (
                <TouchableOpacity key={d} testID={`table-disc-${d}`} onPress={() => setDiscountType(d)} style={[styles.seg, discountType === d && styles.segOn]}>
                  <Text style={[styles.segTxt, discountType === d && styles.segTxtOn]}>{d === "none" ? "None" : d === "flat" ? "₹ Flat" : "% Percent"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {discountType !== "none" ? (
              <TextInput testID="table-disc-value" value={discountValue} onChangeText={(t) => setDiscountValue(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder={discountType === "percent" ? "Discount %" : "Discount amount ₹"} placeholderTextColor={colors.textMuted} style={styles.input} />
            ) : null}

            {/* GST */}
            <View style={styles.taxRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="receipt-outline" size={18} color={colors.primary} />
                <Text style={styles.taxLabel}>Add GST / Tax</Text>
              </View>
              <Switch testID="table-tax-toggle" value={taxEnabled} onValueChange={setTaxEnabled} trackColor={{ true: colors.primary, false: colors.borderStrong }} />
            </View>
            {taxEnabled ? (
              <TextInput testID="table-tax-percent" value={taxPercent} onChangeText={(t) => setTaxPercent(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="GST %" placeholderTextColor={colors.textMuted} style={styles.input} />
            ) : null}

            <TouchableOpacity testID="table-cancel" onPress={cancelTable} style={styles.cancelBtn} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={styles.cancelTxt}>Cancel order (free table)</Text>
            </TouchableOpacity>
          </>
        )}
        </>
        ) : (
        <>
          <Text style={styles.secTitle}>CUSTOMER DETAILS</Text>
          <View style={{ position: "relative" }}>
            <View style={styles.inputWrap}>
              <TextInput
                testID="table-cust-phone"
                value={custPhone}
                onChangeText={(t) => { setCustPhone(t.replace(/[^0-9]/g, "").slice(0, 10)); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                keyboardType="phone-pad"
                placeholder="Phone (10-digit) *"
                placeholderTextColor={colors.textMuted}
                style={[styles.input2, !phoneOk && styles.inputReq]}
              />
              {!phoneOk ? (
                <Text style={styles.reqStar}>required</Text>
              ) : (
                <TouchableOpacity testID="table-cust-history-btn" onPress={openHistory} style={styles.historyBtn} activeOpacity={0.75}>
                  <Ionicons name="time-outline" size={16} color={colors.primary} />
                  <Text style={styles.historyBtnTxt}>History</Text>
                </TouchableOpacity>
              )}
            </View>
            {showSuggestions && custSuggestions.length > 0 ? (
              <View style={styles.custSuggestBox}>
                {custSuggestions.map((c) => (
                  <TouchableOpacity key={c.phone} testID={`table-cust-suggest-${c.phone}`} onPress={() => pickCustomer(c)} style={styles.custSuggestRow} activeOpacity={0.7}>
                    <Ionicons name="person-circle-outline" size={18} color={colors.textSecondary} />
                    <View style={{ marginLeft: 8 }}>
                      <Text style={styles.custSuggestName}>{c.name || "Guest"}</Text>
                      <Text style={styles.custSuggestPhone}>{c.phone}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.inputWrap}>
            <TextInput testID="table-cust-name" value={custName} onChangeText={setCustName} placeholder="Name *" placeholderTextColor={colors.textMuted} style={[styles.input2, !nameOk && custName.length === 0 && styles.inputReq]} />
            {!nameOk ? <Text style={styles.reqStar}>required</Text> : <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
          </View>
          <TextInput testID="table-cust-address" value={custAddress} onChangeText={setCustAddress} placeholder="Address (optional)" placeholderTextColor={colors.textMuted} style={styles.input} />
          <TextInput testID="table-cust-city" value={custCity} onChangeText={setCustCity} placeholder="City (optional)" placeholderTextColor={colors.textMuted} style={[styles.input, { marginTop: 8 }]} />
        </>
        )}
      </ScrollView>

      {/* Bottom action panel */}
      <View style={styles.actionBar}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginBottom: spacing.sm }}>
            <Text style={styles.sheetTotalLabel}>Total </Text>
            <Text style={styles.sheetTotalVal}>{inr(grandTotal)}</Text>
          </View>

          {!settleOpen ? (
            /* -------- SIMPLE BAR (default) -------- */
            <View style={styles.sheetBtnRow}>
              <ActionBtn testID="table-save" icon="save-outline" label="Save" onPress={onSave} loading={busy === "save"} variant="red" />
              <ActionBtn testID="table-kot" icon="flame" label="KOT" onPress={onSendKot} loading={busy === "kot"} variant="dark" disabled={draftItems.length === 0} />
              <ActionBtn testID="table-kot-print" icon="print-outline" label="KOT & Print" onPress={async () => { await onSendKot(); if (Platform.OS === "web") window.print(); }} loading={busy === "kot"} variant="dark" disabled={draftItems.length === 0} />
              <ActionBtn testID="table-settle-open" icon="cash-outline" label="Settle" onPress={openSettle} loading={false} variant="primary" disabled={!hasRunning} />
            </View>
          ) : (
            /* -------- EXPANDED SETTLE PANEL -------- */
            <>
              <View style={styles.sheetTabsRow}>
                {[
                  { key: "cash", label: "Cash", icon: "cash-outline" },
                  { key: "card", label: "Card", icon: "card-outline" },
                  { key: "upi", label: "UPI", icon: "phone-portrait-outline" },
                  { key: "due", label: "Due", icon: "time-outline" },
                  { key: "part", label: "Part", icon: "git-branch-outline" },
                ].map((m) => {
                  const selected = m.key === "part" ? splitMode : (!splitMode && settleMethod === (m.key as any));
                  return (
                    <TouchableOpacity
                      key={m.key}
                      testID={`settle-method-${m.key}`}
                      onPress={() => {
                        if (m.key === "part") { setSplitMode(true); setPartOpen(true); }
                        else { setSettleMethod(m.key as any); setSplitMode(false); }
                      }}
                      style={[styles.sheetTab, selected ? styles.sheetTabOn : null]}
                    >
                      <Ionicons name={m.icon as any} size={15} color={selected ? colors.primary : colors.textSecondary} style={{ marginRight: 4 }} />
                      <Text style={[styles.sheetTabTxt, selected ? styles.sheetTabTxtOn : null]}>{m.label}</Text>
                      {selected ? <Ionicons name="checkmark-circle" size={13} color={colors.primary} style={{ marginLeft: 4 }} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.itsPaidRow}>
                <TouchableOpacity
                  testID="settle-its-paid-toggle"
                  onPress={() => setItsPaid((v) => {
                    const nv = !v;
                    if (nv && !itsPaidAmount) setItsPaidAmount(String(Math.round(grandTotal)));
                    return nv;
                  })}
                  style={styles.itsPaidToggle}
                  hitSlop={6}
                >
                  <Ionicons name={itsPaid ? "checkbox" : "square-outline"} size={20} color={itsPaid ? colors.primary : colors.textMuted} />
                  <Text style={styles.itsPaidLabel}>It's Paid</Text>
                </TouchableOpacity>
                {itsPaid ? (
                  <TextInput
                    testID="settle-its-paid-amount"
                    value={itsPaidAmount}
                    onChangeText={(t) => setItsPaidAmount(t.replace(/[^0-9.]/g, ""))}
                    keyboardType="numeric"
                    placeholder={`₹${Math.round(grandTotal)}`}
                    placeholderTextColor={colors.textMuted}
                    style={styles.itsPaidInput}
                  />
                ) : null}
              </View>

              {!itsPaid && (balance > 0 || change > 0) ? (
                <View style={styles.sheetSummary}>
                  {balance > 0 ? (
                    <View style={styles.billRow}><Text style={[styles.billLabel, { color: colors.warning }]}>Balance → auto discount</Text><Text style={[styles.billVal, { color: colors.warning }]}>-{inr(balance)}</Text></View>
                  ) : null}
                  {change > 0 ? (
                    <View style={styles.billRow}><Text style={styles.billLabel}>Change to return</Text><Text style={styles.billVal}>{inr(change)}</Text></View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.sheetBtnRow}>
                <ActionBtn testID="settle-cancel" icon="close" label="Cancel" onPress={() => setSettleOpen(false)} loading={false} variant="ghost" />
                <ActionBtn testID="settle-print" icon="print-outline" label="Print" onPress={onPrintOnly} loading={false} variant="dark" />
                <ActionBtn testID="settle-ebill" icon="logo-whatsapp" label="eBill" onPress={onEbill} loading={busy === "ebill"} variant="dark" disabled={!hasRunning} />
                <ActionBtn testID="settle-confirm" icon="checkmark-done" label="Settle" onPress={confirmSettle} loading={busy === "settle"} variant="red" disabled={collected <= 0} />
              </View>
            </>
          )}
        </View>
      </View>

      {/* Part (split) payment popup */}
      <Modal animationType="fade" transparent visible={partOpen} onRequestClose={() => setPartOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
          <View style={styles.popCard}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 18, fontWeight: font.black, color: colors.textPrimary }}>Split Payment</Text>
              <TouchableOpacity testID="part-popup-close" onPress={() => setPartOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: spacing.lg }}>
              <Text style={styles.payLabel}>Cash</Text>
              <TextInput testID="settle-cash" value={payCash} onChangeText={(t) => setPayCash(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="₹ 0" placeholderTextColor={colors.textMuted} style={styles.input} />
              <Text style={styles.payLabel}>UPI</Text>
              <TextInput testID="settle-upi" value={payUpi} onChangeText={(t) => setPayUpi(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="₹ 0" placeholderTextColor={colors.textMuted} style={styles.input} />
              <Text style={styles.payLabel}>Due</Text>
              <TextInput testID="settle-due" value={payDue} onChangeText={(t) => setPayDue(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="₹ 0" placeholderTextColor={colors.textMuted} style={styles.input} />
              <TouchableOpacity testID="part-popup-done" onPress={() => setPartOpen(false)} style={{ marginTop: spacing.md, height: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }} activeOpacity={0.85}>
                <Text style={{ color: "#FFFFFF", fontWeight: font.black, fontSize: 14 }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        {/* Header */}
        <View style={styles.head}>
          <View style={styles.tableChip}><Ionicons name="grid" size={16} color={colors.onPrimary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{table?.label}</Text>
            <Text style={styles.sub}>{hasRunning ? `Running • ${inr(subtotal)} • ${(session?.kots?.length || 0)} KOT(s)` : "New order"}</Text>
          </View>
          {savingDraft ? <ActivityIndicator color={colors.primary} style={{ marginRight: 8 }} /> : null}
          <TouchableOpacity testID="table-order-close" onPress={onClose} hitSlop={10}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
        </View>

        {/* Tabs (mobile only — desktop shows both panes side by side) */}
        {!isDesktop ? (
          <View style={styles.tabRow}>
            <TouchableOpacity testID="table-tab-add" onPress={() => setTab("add")} style={[styles.tabBtn, tab === "add" && styles.tabOn]}>
              <Ionicons name="add-circle" size={16} color={tab === "add" ? colors.onPrimary : colors.textSecondary} />
              <Text style={[styles.tabTxt, tab === "add" && styles.tabTxtOn]}>Add Items</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="table-tab-bill" onPress={() => setTab("bill")} style={[styles.tabBtn, tab === "bill" && styles.tabOn]}>
              <Ionicons name="receipt" size={16} color={tab === "bill" ? colors.onPrimary : colors.textSecondary} />
              <Text style={[styles.tabTxt, tab === "bill" && styles.tabTxtOn]}>Order & Bill{billQty ? ` (${billQty})` : ""}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 50 }} />
        ) : isDesktop ? (
          <View style={styles.splitRow}>
            {addPane}
            {billPane}
          </View>
        ) : tab === "add" ? (
          addPane
        ) : (
          billPane
        )}

        

        <ReceiptModal
          visible={!!receipt}
          bill={receipt}
          onClose={() => { setReceipt(null); if (afterReceiptClose === "close") onClose(); }}
        />
      </SafeAreaView>

      <Modal animationType="fade" transparent visible={historyOpen} onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.popBackdrop}>
          <View style={[styles.popCard, { maxHeight: "75%" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, paddingBottom: spacing.sm }}>
              <View>
                <Text style={[styles.itemName, { fontSize: 16 }]}>Order History</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{custPhone}</Text>
              </View>
              <TouchableOpacity onPress={() => setHistoryOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
              {historyLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
              ) : historyOrders.length === 0 ? (
                <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 30 }}>No past orders for this number yet.</Text>
              ) : (
                historyOrders.map((o: any, idx: number) => (
                  <View key={o.id || idx} style={styles.historyCard}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={styles.historyDate}>
                        {o.created_at ? new Date(o.created_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                      </Text>
                      <Text style={styles.historyAmt}>{inr(o.total || 0)}</Text>
                    </View>
                    <Text style={styles.historyMeta}>
                      {o.table_label ? `Table ${o.table_label}` : (o.order_type || "")}{o.bill_number ? ` • ${o.bill_number}` : ""}
                    </Text>
                    <Text style={styles.historyItems} numberOfLines={2}>
                      {(o.items || []).map((it: any) => `${it.name} x${it.qty}`).join(", ")}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

function ActionBtn({ testID, icon, label, onPress, loading, variant, disabled }: {
  testID: string; icon: any; label: string; onPress: () => void; loading?: boolean;
  variant: "primary" | "dark" | "ghost" | "red"; disabled?: boolean;
}) {
  const bg = variant === "primary" ? colors.primary : variant === "dark" ? colors.dark : variant === "red" ? colors.error : colors.surface;
  const fg = variant === "ghost" ? colors.textPrimary : "#FFFFFF";
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.85}
      style={[styles.actBtn, { backgroundColor: bg }, variant === "ghost" && styles.actBtnGhost, (disabled || loading) && { opacity: 0.45 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <Text style={[styles.actTxt, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  splitRow: { flex: 1, minWidth: 0, flexDirection: "row" },
  addPane: { flex: 1.3, minWidth: 0, borderRightWidth: 1, borderRightColor: colors.border },
  addPaneRow: { flex: 1, minWidth: 0, flexDirection: "row" },
  catSidebar: { minWidth: 120, maxWidth: 220, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow.card },
  catSidebarItem: { paddingVertical: 14, paddingHorizontal: 16, borderLeftWidth: 3, borderLeftColor: "transparent", borderBottomWidth: 1, borderBottomColor: colors.primary, ...shadow.card },
  catSidebarItemOn: { backgroundColor: colors.primary, borderLeftColor: colors.primary },
  catSidebarTxt: { fontSize: 18, fontWeight: font.semi, color: colors.textSecondary },
  catSidebarTxtOn: { color: colors.onPrimary, fontWeight: font.black },
  billPane: { flex: 0.75, minWidth: 0, backgroundColor: colors.surfaceAlt },
  billTabRow: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 4, marginBottom: spacing.md },
  billTabBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  billTabBtnOn: { backgroundColor: colors.primarySoft },
  billTabTxt: { fontSize: 13, fontWeight: font.semi, color: colors.textSecondary },
  billTabTxtOn: { color: colors.primary, fontWeight: font.black },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableChip: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 19, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  tabRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabTxt: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  tabTxtOn: { color: colors.onPrimary },

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

  kotBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, ...shadow.lifted },
  kotBarSmall: { fontSize: 11, color: colors.textSecondary },
  kotBarNames: { fontSize: 13, fontWeight: font.semi, color: colors.textPrimary, marginTop: 1 },
  kotBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: 18, height: 50, borderRadius: radius.md },
  kotBtnTxt: { fontSize: 15, fontWeight: font.black, color: colors.onPrimary },

  addMoreBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, borderStyle: "dashed", marginBottom: spacing.sm },
  addMoreTxt: { fontSize: 14, fontWeight: font.black, color: colors.primary },

  emptyBox: { alignItems: "center", gap: 8, paddingVertical: 50 },
  emptyTitle: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: "center", paddingHorizontal: 24 },

  secTitle: { fontSize: 12, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4, marginTop: spacing.lg, marginBottom: spacing.sm },
  kotCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  kotNo: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary, flex: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  statusTxt: { fontSize: 10, fontWeight: font.black, letterSpacing: 0.3 },
  kotItem: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  kotItemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4, gap: 8 },

  billCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  billSummaryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  billRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  draftRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  draftPrice: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  draftStepper: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 4 },
  draftStepBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  draftQty: { fontSize: 14, fontWeight: font.black, color: colors.textPrimary, minWidth: 18, textAlign: "center" },
  billName: { flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: font.semi },
  billAmt: { fontSize: 14, color: colors.textPrimary, fontWeight: font.bold, minWidth: 62, textAlign: "right" },
  billDivider: { borderTopWidth: 1, borderTopColor: colors.border, borderStyle: "dashed", marginVertical: 8 },
  billLabel: { fontSize: 13, color: colors.textSecondary },
  billVal: { fontSize: 13, color: colors.textPrimary, fontWeight: font.semi },
  billTotalLabel: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary, marginTop: 4 },
  billTotal: { fontSize: 18, fontWeight: font.black, color: colors.primary, marginTop: 4 },

  segRow: { flexDirection: "row", gap: spacing.sm },
  seg: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  segOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segTxt: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  segTxtOn: { color: colors.onPrimary },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, height: 46, fontSize: 15, color: colors.textPrimary, marginTop: 8 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  input2: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, height: 46, fontSize: 15, color: colors.textPrimary },
  inputReq: { borderColor: colors.warning },
  custSuggestBox: { position: "absolute", top: 54, left: 0, right: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, zIndex: 20, ...shadow.lifted, maxHeight: 220, overflow: "hidden" },
  custSuggestRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  custSuggestName: { fontSize: 14, fontWeight: font.semi, color: colors.textPrimary },
  custSuggestPhone: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  historyBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  historyBtnTxt: { fontSize: 12.5, fontWeight: font.bold, color: colors.primary },
  historyCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  historyDate: { fontSize: 12.5, fontWeight: font.bold, color: colors.textPrimary },
  historyAmt: { fontSize: 14, fontWeight: font.black, color: colors.primary },
  historyMeta: { fontSize: 11.5, color: colors.textSecondary, marginTop: 3 },
  historyItems: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  reqStar: { fontSize: 11, fontWeight: font.bold, color: colors.warning, width: 60, textAlign: "right" },
  taxRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 52, marginTop: spacing.lg },
  taxLabel: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.xl, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error },
  cancelTxt: { fontSize: 14, fontWeight: font.bold, color: colors.error },

  actionBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, ...shadow.lifted },
  actionTotalRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.sm },
  actionTotalLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: font.semi },
  actionTotal: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary },
  actionBtns: { flexDirection: "row", gap: spacing.sm },
  actBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, height: 44, borderRadius: radius.md, paddingHorizontal: 1 },
  actBtnGhost: { borderWidth: 1, borderColor: colors.borderStrong },
  actTxt: { fontSize: 13, fontWeight: font.black, letterSpacing: -0.1 },

  popBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  popCard: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.xl, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  popHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  popTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  popTotalBox: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, alignItems: "center", marginBottom: spacing.sm },
  popTotalLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: font.semi },
  popTotal: { fontSize: 26, fontWeight: font.black, color: colors.primary, marginTop: 2 },
  payLabel: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary, marginTop: 10 },
  popSummary: { marginTop: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
  quickBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, marginTop: spacing.md },
  quickTxt: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end" },
  sheetPanel: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingTop: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, ...shadow.lifted },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  sheetTopRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  splitPill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  splitPillTxt: { fontSize: 12, fontWeight: font.bold, color: colors.primary },
  sheetTotalLabel: { fontSize: 12, color: colors.textSecondary, marginRight: 6 },
  sheetTotalVal: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  sheetTabsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm },
  sheetTab: { flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, marginHorizontal: 2, marginBottom: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent" },
  sheetTabOn: { borderColor: colors.primary, backgroundColor: "#e8f5ec" },
  sheetTabTxt: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  sheetTabTxtOn: { color: colors.primary },
  sheetSummary: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  sheetBtnRow: { flexDirection: "row", gap: 6, marginTop: spacing.sm },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: radius.md, backgroundColor: colors.primary, marginTop: spacing.md },
  confirmTxt: { fontSize: 16, fontWeight: font.black, color: colors.onPrimary },
  itsPaidRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.sm },
  itsPaidToggle: { flexDirection: "row", alignItems: "center", gap: 8 },
  itsPaidLabel: { fontSize: 13, fontWeight: font.bold, color: colors.textPrimary },
  itsPaidInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: 10, height: 36, fontSize: 13, color: colors.textPrimary, minWidth: 100, textAlign: "right" },
});
