import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput,
  ActivityIndicator, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCart } from "@/src/cart";
import { useAuth } from "@/src/auth";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Button, Empty } from "@/src/components/ui";
import { notify } from "@/src/utils/confirm";
import { offerDiscount, offerLabel, type Offer } from "@/src/utils/offers";
import { computeBill, normalizeCharges, DEFAULT_CHARGES, type Charges } from "@/src/utils/charges";
import { openRazorpayCheckout } from "@/src/utils/razorpay";
import { OfferSuggestSheet, OfferCelebration } from "@/src/components/OfferPopups";
import PaymentSheet, { type PaySelection, type CheckoutSettings } from "@/src/components/PaymentSheet";
import AddressSheet, { type SavedAddress } from "@/src/components/AddressSheet";

type Suggest =
  | { kind: "coupon"; coupon: any; discount: number; code: string }
  | { kind: "offer"; offer: Offer; discount: number; code: string };

type MenuItem = { id: string; name: string; price: number; image: string; veg?: boolean; available?: boolean };
type RestInfo = { id: string; name: string; cuisines?: string[]; delivery_time?: number };

const DEFAULT_CHECKOUT: CheckoutSettings = {
  cancellation_policy_enabled: true,
  cancellation_policy_text: "A 100% cancellation charge will apply. This helps us compensate the restaurant partner for food preparation.",
  cod_enabled: true, online_enabled: true, cards_enabled: true,
  upi_enabled: true, wallets_enabled: true, paylater_enabled: true,
};

export default function CartCheckout() {
  const router = useRouter();
  const { items, restaurantId, restaurantName, subtotal, add, increment, decrement, clear } = useCart();
  const { user } = useAuth();

  // restaurant info + menu suggestions + offers (one fetch)
  const [rest, setRest] = useState<RestInfo | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoaded, setOffersLoaded] = useState(false);

  // coupons / discounts
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponsLoaded, setCouponsLoaded] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState<any | null>(null);
  const [appliedOffer, setAppliedOffer] = useState<Offer | null>(null);
  const [couponsOpen, setCouponsOpen] = useState(false);

  // popups
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [suggestVisible, setSuggestVisible] = useState(false);
  const [celebrate, setCelebrate] = useState<{ code: string; amount: number } | null>(null);
  const suggestShownFor = useRef<string | null>(null);

  // address
  const [savedAddrs, setSavedAddrs] = useState<SavedAddress[]>([]);
  const [selAddrId, setSelAddrId] = useState<string | null>(null);
  const [addrSheetOpen, setAddrSheetOpen] = useState(false);

  // checkout
  const [note, setNote] = useState("");
  const [charges, setCharges] = useState<Charges>(DEFAULT_CHARGES);
  const [quote, setQuote] = useState<any>(null);
  const [settings, setSettings] = useState<CheckoutSettings>(DEFAULT_CHECKOUT);
  const [payEnabled, setPayEnabled] = useState(true);
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [paySel, setPaySel] = useState<PaySelection | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [codStatus, setCodStatus] = useState<{ cod_available: boolean; reason: string | null } | null>(null);

  useEffect(() => {
    Api.coupons().then((c) => setCoupons(c as any[])).catch(() => {}).finally(() => setCouponsLoaded(true));
    Api.getCharges().then((r: any) => setCharges(normalizeCharges(r))).catch(() => {});
    Api.paymentSettings().then((r: any) => setPayEnabled(!!r?.enabled)).catch(() => setPayEnabled(false));
    Api.checkoutSettings().then((r: any) => setSettings({ ...DEFAULT_CHECKOUT, ...r })).catch(() => {});
    Api.myPaymentOptions()
      .then((r: any) => setCodStatus({ cod_available: !!r?.cod_available, reason: r?.reason || null }))
      .catch(() => setCodStatus({ cod_available: true, reason: null }));
    Api.myAddresses().then((list: any) => {
      const arr: SavedAddress[] = Array.isArray(list) ? list : [];
      setSavedAddrs(arr);
      const def = arr.find((a) => a.is_default) || arr[0];
      if (def) setSelAddrId((prev) => prev || def.id);
    }).catch(() => {});
  }, []);

  // one fetch: restaurant info + menu + offers
  useEffect(() => {
    if (!restaurantId) { setRest(null); setMenu([]); setOffers([]); setOffersLoaded(true); return; }
    setOffersLoaded(false);
    Api.restaurant(restaurantId)
      .then((r: any) => {
        setRest(r?.restaurant || null);
        setMenu((r?.menu as MenuItem[]) || []);
        setOffers((r?.offers as Offer[]) || []);
      })
      .catch(() => { setOffers([]); })
      .finally(() => setOffersLoaded(true));
  }, [restaurantId]);

  // default payment selection
  useEffect(() => {
    if (paySel) return;
    // If COD is auto-blocked, force online default
    const codEnabledFinal = settings.cod_enabled && (codStatus?.cod_available !== false);
    if (settings.online_enabled && payEnabled) {
      setPaySel({ kind: "online", label: "Pay Online", sub: "UPI / Cards / Wallets", icon: "card" });
    } else if (codEnabledFinal) {
      setPaySel({ kind: "cod", label: "Cash on Delivery", sub: "Pay when your food arrives", icon: "cash" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, payEnabled, codStatus]);

  // If COD becomes unavailable but user had it selected, switch to online
  useEffect(() => {
    if (!paySel) return;
    if (paySel.kind === "cod" && codStatus && codStatus.cod_available === false) {
      if (settings.online_enabled && payEnabled) {
        setPaySel({ kind: "online", label: "Pay Online", sub: "UPI / Cards / Wallets", icon: "card" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codStatus, paySel]);

  // auto-suggest best saving (Zomato-style popup, once per restaurant cart)
  useEffect(() => {
    if (!couponsLoaded || !offersLoaded) return;
    if (!restaurantId || items.length === 0 || subtotal <= 0) return;
    if (applied || appliedOffer) return;
    if (suggestShownFor.current === restaurantId) return;
    if (offers.length === 0 && coupons.length === 0) return;

    let best: Suggest | null = null;
    for (const o of offers) {
      const d = offerDiscount(o, subtotal);
      if (d > 0 && (!best || d > best.discount)) {
        best = { kind: "offer", offer: o, discount: d, code: (o.code || offerLabel(o)).toUpperCase() };
      }
    }
    for (const c of coupons) {
      if (subtotal >= (c.min_order || 0)) {
        const d = Math.min(c.max_discount, Math.floor((subtotal * c.discount_pct) / 100));
        if (d > 0 && (!best || d > best.discount)) {
          best = { kind: "coupon", coupon: c, discount: d, code: c.code };
        }
      }
    }
    if (best) {
      suggestShownFor.current = restaurantId;
      setSuggest(best);
      // No cleanup on purpose: clearing this timer on dep-changes caused the popup
      // to never appear when coupons & offers resolved milliseconds apart.
      setTimeout(() => setSuggestVisible(true), 650);
    }
  }, [couponsLoaded, offersLoaded, offers, coupons, subtotal, restaurantId, items.length, applied, appliedOffer]);

  const applyCoupon = (code: string, silent = false) => {
    const c = coupons.find((x) => x.code.toLowerCase() === code.toLowerCase());
    if (!c) {
      if (!silent) notify("Invalid coupon", "Try WELCOME50, ZOMATO20 or FREESHIP");
      return;
    }
    if (subtotal < c.min_order) {
      if (!silent) notify("Min order not met", `Min order \u20B9${c.min_order} required`);
      return;
    }
    setAppliedOffer(null);
    setApplied(c);
    setCoupon(c.code);
    const d = Math.min(c.max_discount, Math.floor(subtotal * c.discount_pct / 100));
    setCelebrate({ code: c.code, amount: d });
  };

  const applyOffer = (o: Offer) => {
    const d = offerDiscount(o, subtotal);
    if (d <= 0) {
      notify("Not applicable", o.min_order ? `Add items worth \u20B9${o.min_order} to use this offer.` : "This offer cannot be applied right now.");
      return;
    }
    setApplied(null);
    setCoupon("");
    setAppliedOffer(o);
    setCelebrate({ code: (o.code || offerLabel(o)).toUpperCase(), amount: d });
  };

  const applyFromSuggest = () => {
    if (!suggest) return;
    setSuggestVisible(false);
    if (suggest.kind === "coupon") {
      setAppliedOffer(null);
      setApplied(suggest.coupon);
      setCoupon(suggest.coupon.code);
    } else {
      setApplied(null);
      setCoupon("");
      setAppliedOffer(suggest.offer);
    }
    setTimeout(() => setCelebrate({ code: suggest.code, amount: suggest.discount }), 320);
  };

  // ---- bill ----
  const couponDiscount = applied ? Math.min(applied.max_discount, Math.floor(subtotal * applied.discount_pct / 100)) : 0;
  const offerDisc = appliedOffer ? offerDiscount(appliedOffer, subtotal) : 0;
  const discount = appliedOffer ? offerDisc : couponDiscount;
  const discountLabel = appliedOffer ? `Offer (${offerLabel(appliedOffer)})` : applied ? `Coupon (${applied.code})` : "Discount";

  const selAddr = useMemo(() => savedAddrs.find((a) => a.id === selAddrId) || null, [savedAddrs, selAddrId]);
  const effAddress = useMemo(() => {
    if (selAddr) {
      return { label: selAddr.label, line1: selAddr.line1, city: selAddr.city || "", lat: selAddr.lat ?? null, lng: selAddr.lng ?? null };
    }
    return null;
  }, [selAddr]);

  // server-authoritative quote
  useEffect(() => {
    if (!restaurantId || items.length === 0) { setQuote(null); return; }
    const body = {
      restaurant_id: restaurantId,
      items: items.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })),
      address: effAddress || { label: "Home", line1: "TBD", city: "", lat: null, lng: null },
      offer_id: appliedOffer?.id || undefined,
      coupon_code: appliedOffer ? undefined : (applied?.code || undefined),
    };
    let alive = true;
    Api.orderQuote(body).then((q: any) => { if (alive) setQuote(q); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, effAddress?.lat, effAddress?.lng, subtotal, applied, appliedOffer]);

  const localBill = computeBill(subtotal, discount, charges);
  const deliveryFee = quote ? quote.delivery_fee : localBill.delivery_fee;
  const packingCharge = quote ? quote.packing_charge : localBill.packing_charge;
  const gstAmount = quote ? quote.gst_amount : localBill.gst_amount;
  const gstPercent = quote ? quote.gst_percent : localBill.gst_percent;
  const total = quote ? quote.total : localBill.total;
  const distanceKm = quote?.distance_km;
  const perKm = (quote?.delivery_mode || charges.delivery_mode) === "per_km";
  const origTotal = total + discount;

  // menu suggestions: available items not already in cart
  const suggestions = useMemo(() => {
    const inCart = new Set(items.map((i) => i.menu_item_id));
    return menu.filter((m) => m.available !== false && !inCart.has(m.id)).slice(0, 10);
  }, [menu, items]);

  const vegById = useMemo(() => {
    const map = new Map<string, boolean | undefined>();
    menu.forEach((m) => map.set(m.id, m.veg));
    return map;
  }, [menu]);

  const addSuggestion = async (m: MenuItem) => {
    if (!rest) return;
    await add({ menu_item_id: m.id, name: m.name, price: m.price, image: m.image, restaurant_id: rest.id, restaurant_name: rest.name || restaurantName || "" });
  };

  // ---- place order ----
  const buildOrderBody = () => ({
    restaurant_id: restaurantId!,
    items: items.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })),
    address: effAddress!,
    payment_method: paySel?.kind === "cod" ? "cod" : "razorpay",
    offer_id: appliedOffer?.id || undefined,
    coupon_code: appliedOffer ? undefined : (applied?.code || undefined),
    note: [note.trim(), paySel && paySel.kind === "online" ? `Pay via: ${paySel.label}` : ""].filter(Boolean).join(" | ") || undefined,
  });

  const finishToOrder = async (orderId: string) => {
    await clear();
    router.replace({ pathname: `/order/${orderId}`, params: { fresh: "1" } } as any);
  };

  const handlePlace = async () => {
    setError("");
    if (!user) {
      router.push({ pathname: "/login", params: { next: "/customer/cart" } } as any);
      return;
    }
    if (!effAddress) { setAddrSheetOpen(true); setError("Please select or add a delivery address"); return; }
    if (effAddress.lat == null || effAddress.lng == null) { setAddrSheetOpen(true); setError("Please set your address location on the map to continue"); return; }
    if (!restaurantId) { setError("Your cart is empty. Please add items again."); return; }
    if (!paySel) { setError("Please select a payment method"); return; }
    setPlacing(true);
    try {
      if (paySel.kind === "cod") {
        const order: any = await Api.createOrder(buildOrderBody());
        await finishToOrder(order.id);
        return;
      }
      let orderId = pendingOrderId;
      if (!orderId) {
        const order: any = await Api.createOrder(buildOrderBody());
        orderId = order.id;
        setPendingOrderId(orderId);
      }
      const pay: any = await Api.createPayment({ purpose: "customer_order", order_id: orderId! });
      await openRazorpayCheckout({
        keyId: pay.key_id,
        orderId: pay.razorpay_order_id,
        amount: pay.amount,
        name: "Bisnoi",
        description: `Order at ${restaurantName || "restaurant"}`,
        prefill: { name: user?.name || pay?.prefill?.name || "", contact: user?.phone || pay?.prefill?.contact || "" },
        themeColor: colors.primary,
        onSuccess: async (resp) => {
          try {
            await Api.verifyPayment({
              payment_id: pay.payment_id,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            await finishToOrder(orderId!);
          } catch (e: any) {
            setError(e?.message || "Payment verification failed. Please contact support.");
            setPlacing(false);
          }
        },
        onDismiss: () => {
          setError("Payment cancelled. Tap \u201CPlace Order\u201D to retry.");
          setPlacing(false);
        },
        onError: (e: any) => {
          setError((e?.description || e?.message) || "Payment failed. Please try again.");
          setPlacing(false);
        },
      });
    } catch (e: any) {
      setError(e?.message || "Could not place order. Please try again.");
      setPlacing(false);
    }
  };

  // ---------- EMPTY ----------
  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.emptyHeader}><Text style={styles.emptyHeaderTitle}>Cart</Text></View>
        <Empty icon="bag-handle-outline" title="Your cart is empty" subtitle="Add items from a restaurant to get started" />
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Button title="Browse restaurants" onPress={() => router.push("/customer" as any)} full />
        </View>
      </SafeAreaView>
    );
  }

  const eta = rest?.delivery_time || 30;
  const cuisines = (rest?.cuisines || []).join(" | ");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* ---------- Zomato-style header ---------- */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (restaurantId ? router.push(`/restaurant/${restaurantId}` as any) : router.push("/customer" as any))}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID="cart-back"
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {restaurantName}{cuisines ? ` - ${cuisines}` : ""}
          </Text>
          <TouchableOpacity
            style={styles.headerAddrRow}
            activeOpacity={0.7}
            onPress={() => setAddrSheetOpen(true)}
            testID="header-address-btn"
          >
            <Text style={styles.headerEta}>{eta}-{eta + 5} mins to {selAddr ? selAddr.label : "?"}</Text>
            <Text style={styles.headerAddr} numberOfLines={1}>
              {"  |  "}{selAddr ? selAddr.line1 : "Select delivery address"}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => { clear(); setApplied(null); setAppliedOffer(null); setCoupon(""); }} style={styles.backBtn} testID="cart-clear">
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </TouchableOpacity>
      </View>

      {/* You-saved strip */}
      {discount > 0 && (
        <View style={styles.savedStrip} testID="cart-saved-strip">
          <Text style={{ fontSize: 15 }}>{"\uD83E\uDD73"}</Text>
          <Text style={styles.savedStripTxt}>You saved {`\u20B9${discount}`} on this order</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 190 }} showsVerticalScrollIndicator={false}>
        {/* ---------- items ---------- */}
        <View style={styles.cardBox}>
          {items.map((it, idx) => {
            const veg = vegById.get(it.menu_item_id);
            return (
              <View key={it.menu_item_id} style={[styles.itemRow, idx > 0 && styles.itemRowDivider]}>
                <View style={[styles.vegBox, { borderColor: veg === false ? "#B22" : "#0A8A3A" }]}>
                  <View style={[styles.vegDot, { backgroundColor: veg === false ? "#B22" : "#0A8A3A" }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.iName} numberOfLines={2}>{it.name}</Text>
                  <Text style={styles.iUnit}>{`\u20B9${it.price}`} each</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <View style={styles.qtyBox}>
                    <TouchableOpacity onPress={() => decrement(it.menu_item_id)} style={styles.qBtn} testID={`dec-${it.menu_item_id}`}>
                      <Ionicons name="remove" size={15} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.qty}>{it.quantity}</Text>
                    <TouchableOpacity onPress={() => increment(it.menu_item_id)} style={styles.qBtn} testID={`inc-${it.menu_item_id}`}>
                      <Ionicons name="add" size={15} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.iPrice}>{`\u20B9${it.price * it.quantity}`}</Text>
                </View>
              </View>
            );
          })}

          {/* add more + note */}
          <View style={styles.addMoreRow}>
            <TouchableOpacity
              style={styles.addMoreBtn}
              activeOpacity={0.85}
              onPress={() => restaurantId && router.push(`/restaurant/${restaurantId}` as any)}
              testID="add-more-items"
            >
              <Ionicons name="add" size={16} color={colors.success} />
              <Text style={styles.addMoreTxt}>Add more items</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.noteRow}>
            <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note for the restaurant"
              placeholderTextColor={colors.textMuted}
              style={styles.noteInput}
              testID="order-note"
            />
          </View>
        </View>

        {/* ---------- complete your meal with ---------- */}
        {suggestions.length > 0 && (
          <View style={[styles.cardBox, { marginTop: spacing.md }]} testID="complete-meal">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
              <View style={styles.cmIcon}><Ionicons name="grid-outline" size={14} color={colors.textPrimary} /></View>
              <Text style={styles.cmTitle}>Complete your meal with</Text>
            </View>
            <FlatList
              data={suggestions}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item: m }) => (
                <View style={styles.cmCard}>
                  <View>
                    <Image source={{ uri: m.image }} style={styles.cmImg} />
                    <TouchableOpacity style={styles.cmAdd} onPress={() => addSuggestion(m)} activeOpacity={0.85} testID={`cm-add-${m.id}`}>
                      <Ionicons name="add" size={16} color={colors.success} />
                    </TouchableOpacity>
                    <View style={[styles.vegBox, styles.cmVeg, { borderColor: m.veg === false ? "#B22" : "#0A8A3A" }]}>
                      <View style={[styles.vegDot, { backgroundColor: m.veg === false ? "#B22" : "#0A8A3A" }]} />
                    </View>
                  </View>
                  <Text style={styles.cmName} numberOfLines={2}>{m.name}</Text>
                  <Text style={styles.cmPrice}>{`\u20B9${m.price}`}</Text>
                </View>
              )}
            />
          </View>
        )}

        {/* ---------- coupons strip ---------- */}
        <TouchableOpacity
          style={styles.couponStrip}
          activeOpacity={0.85}
          onPress={() => setCouponsOpen((s) => !s)}
          testID="coupons-strip"
        >
          <View style={styles.pctBadge}><Text style={{ color: "#fff", fontWeight: font.black, fontSize: 13 }}>%</Text></View>
          <Text style={styles.couponStripTxt}>
            {applied || appliedOffer ? `${applied ? applied.code : (appliedOffer!.code || offerLabel(appliedOffer!)).toUpperCase()} applied \u2014 \u20B9${discount} off` : "Save extra by applying coupons on every order"}
          </Text>
          <Ionicons name={couponsOpen ? "chevron-up" : "chevron-down"} size={16} color="#3B5BDB" />
        </TouchableOpacity>

        {couponsOpen && (
          <View style={[styles.cardBox, { marginTop: spacing.sm }]}>
            {offers.length > 0 && (
              <>
                <Text style={styles.secLabel}>OFFERS ON THIS RESTAURANT</Text>
                <View style={{ marginTop: spacing.sm, gap: 8, marginBottom: spacing.md }}>
                  {offers.map((o) => {
                    const d = offerDiscount(o, subtotal);
                    const isApplied = appliedOffer?.id === o.id;
                    const eligible = d > 0;
                    return (
                      <TouchableOpacity
                        key={o.id}
                        testID={`cart-offer-${o.id}`}
                        onPress={() => (isApplied ? setAppliedOffer(null) : applyOffer(o))}
                        activeOpacity={0.85}
                        style={[styles.offerRow, isApplied && { borderColor: colors.primary, backgroundColor: colors.primarySoft, borderStyle: "solid" }]}
                      >
                        <Ionicons name="pricetag" size={16} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: font.black, color: colors.textPrimary, fontSize: 13 }}>{offerLabel(o)}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>
                            {o.title}{o.min_order ? ` \u2022 Min \u20B9${o.min_order}` : ""}{!eligible && o.min_order ? " \u2014 add more to unlock" : ""}
                          </Text>
                        </View>
                        {isApplied ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                            <Text style={{ color: colors.success, fontWeight: font.bold, fontSize: 12 }}>Applied</Text>
                          </View>
                        ) : (
                          <Text style={{ color: eligible ? colors.primary : colors.textMuted, fontWeight: font.bold, fontSize: 12 }}>{eligible ? "APPLY" : "\u2014"}</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={styles.secLabel}>APPLY COUPON</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
              <TextInput
                value={coupon}
                onChangeText={(t) => { setCoupon(t.toUpperCase()); setApplied(null); }}
                placeholder="Enter code"
                placeholderTextColor={colors.textMuted}
                style={styles.couponInput}
                autoCapitalize="characters"
                testID="coupon-input"
              />
              <TouchableOpacity onPress={() => applyCoupon(coupon)} style={styles.applyBtn} testID="coupon-apply">
                <Text style={{ color: colors.primary, fontWeight: font.bold }}>APPLY</Text>
              </TouchableOpacity>
            </View>
            {applied && (
              <View style={styles.appliedRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={{ color: colors.success, fontWeight: font.semi, flex: 1 }}>
                  {applied.code} applied {"\u2014"} {`\u20B9${discount}`} off
                </Text>
                <TouchableOpacity onPress={() => { setApplied(null); setCoupon(""); }}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
            <View style={{ marginTop: spacing.md, gap: 6 }}>
              {coupons.map((c) => (
                <TouchableOpacity key={c.code} onPress={() => applyCoupon(c.code)} style={styles.couponChip} testID={`coupon-${c.code}`}>
                  <Ionicons name="pricetag" size={14} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: font.bold, color: colors.textPrimary, fontSize: 13 }}>{c.code}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{c.description} {"\u2022"} Min {`\u20B9${c.min_order}`}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ---------- delivery address summary ---------- */}
        <TouchableOpacity style={styles.addrSummary} activeOpacity={0.85} onPress={() => setAddrSheetOpen(true)} testID="addr-summary">
          <Ionicons name={selAddr ? (selAddr.label === "Work" ? "briefcase" : "home") : "location"} size={18} color={selAddr ? colors.success : colors.error} />
          <View style={{ flex: 1 }}>
            <Text style={styles.addrSummaryTitle}>{selAddr ? `Delivering to ${selAddr.label}` : "Select delivery address"}</Text>
            <Text style={styles.addrSummaryLine} numberOfLines={1}>
              {selAddr ? `${selAddr.line1}${selAddr.city ? `, ${selAddr.city}` : ""}` : "Tap to choose or add an address"}
            </Text>
          </View>
          <Text style={styles.changeTxt}>{selAddr ? "Change" : "Select"}</Text>
        </TouchableOpacity>

        {/* contact */}
        <View style={styles.contactRow}>
          <Ionicons name="call-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.contactTxt}>{user?.name || "Guest"}, +91-{user?.phone || "----------"}</Text>
        </View>

        {/* ---------- total bill ---------- */}
        <TouchableOpacity style={styles.billCard} activeOpacity={0.85} onPress={() => setBillOpen((s) => !s)} testID="total-bill-row">
          <Ionicons name="receipt-outline" size={20} color={colors.textPrimary} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={styles.billLabel}>Total Bill</Text>
              {discount > 0 && <Text style={styles.billStrike}>{`\u20B9${origTotal}`}</Text>}
              <Text style={styles.billTotal}>{`\u20B9${total}`}</Text>
              {discount > 0 && <View style={styles.savedPill}><Text style={styles.savedPillTxt}>You saved {`\u20B9${discount}`}</Text></View>}
            </View>
            <Text style={styles.billSub}>Incl. taxes and charges</Text>
          </View>
          <Ionicons name={billOpen ? "chevron-up" : "chevron-forward"} size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        {billOpen && (
          <View style={[styles.cardBox, { marginTop: spacing.sm }]}>
            <Row label="Item total" value={`\u20B9${subtotal}`} />
            {discount > 0 && <Row label={discountLabel} value={`- \u20B9${discount}`} color={colors.success} />}
            <Row
              label={perKm && distanceKm != null ? `Delivery fee (${distanceKm} km)` : "Delivery fee"}
              value={deliveryFee === 0 ? "FREE" : `\u20B9${deliveryFee}`}
            />
            {packingCharge > 0 && <Row label="Packing charge" value={`\u20B9${packingCharge}`} />}
            {gstAmount > 0 && <Row label={`GST (${gstPercent}%)`} value={`\u20B9${gstAmount}`} />}
            <View style={styles.divider} />
            <Row label="To pay" value={`\u20B9${total}`} bold />
          </View>
        )}

        {/* cancellation policy (admin-operated) */}
        {settings.cancellation_policy_enabled && !!settings.cancellation_policy_text && (
          <View style={{ marginTop: spacing.xl }} testID="cancellation-policy">
            <Text style={styles.policyTitle}>C A N C E L L A T I O N   P O L I C Y</Text>
            <Text style={styles.policyText}>{settings.cancellation_policy_text}</Text>
          </View>
        )}

        {/* COD-blocked banner */}
        {codStatus && codStatus.cod_available === false ? (
          <View style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.errorSoft, borderWidth: 1, borderColor: colors.error, flexDirection: "row", gap: 8, alignItems: "flex-start" }} testID="cod-blocked-banner">
            <Ionicons name="information-circle" size={18} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.error, fontWeight: "800", fontSize: 13 }}>Cash on Delivery unavailable</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{codStatus.reason || "COD is not available for your account. Please use prepaid."}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* ---------- bottom bar: PAY USING + Place Order ---------- */}
      <View style={styles.bar}>
        {error ? (
          <View style={styles.errorBanner} testID="checkout-error">
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {!user ? (
          <TouchableOpacity
            testID="login-to-continue-btn"
            style={styles.loginToContinueBtn}
            activeOpacity={0.9}
            onPress={() => router.push({ pathname: "/login", params: { next: "/customer/cart" } } as any)}
          >
            <Text style={styles.loginToContinueTxt}>Login to Continue</Text>
          </TouchableOpacity>
        ) : (
        <View style={styles.barRow}>
          <TouchableOpacity style={styles.payUsing} activeOpacity={0.8} onPress={() => setPaySheetOpen(true)} testID="pay-using-btn">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name={(paySel?.icon as any) || "card"} size={13} color={colors.textSecondary} />
              <Text style={styles.payUsingCaps}>PAY USING</Text>
              <Ionicons name="caret-up" size={11} color={colors.textSecondary} />
            </View>
            <Text style={styles.payUsingLabel} numberOfLines={1}>{paySel?.label || "Select method"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.placeBtn} onPress={handlePlace} disabled={placing} activeOpacity={0.9} testID="place-order-btn">
            {placing ? <ActivityIndicator color="#fff" /> : (
              <>
                <View>
                  <Text style={styles.placeTotal}>{`\u20B9${total}`}</Text>
                  <Text style={styles.placeTotalSub}>TOTAL</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ color: "#fff", fontWeight: font.black, fontSize: 16 }}>Place Order</Text>
                  <Ionicons name="caret-forward" size={14} color="#fff" />
                </View>
              </>
            )}
          </TouchableOpacity>
        </View>
        )}
      </View>

      {/* ---------- sheets & popups ---------- */}
      <AddressSheet
        visible={addrSheetOpen}
        onClose={() => setAddrSheetOpen(false)}
        addresses={savedAddrs}
        selectedId={selAddrId}
        onSelect={(a) => { setSelAddrId(a.id); setError(""); }}
        onAdded={(a) => { setSavedAddrs((p) => [...p, a]); setSelAddrId(a.id); setError(""); setAddrSheetOpen(false); }}
      />

      <PaymentSheet
        visible={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        settings={settings}
        gatewayEnabled={payEnabled}
        selected={paySel}
        onSelect={setPaySel}
        codAvailable={codStatus?.cod_available !== false}
        codReason={codStatus?.reason || null}
      />

      <OfferSuggestSheet
        visible={suggestVisible && !!suggest}
        saveAmount={suggest?.discount || 0}
        code={suggest?.code || ""}
        onApply={applyFromSuggest}
        onClose={() => setSuggestVisible(false)}
      />

      <OfferCelebration
        visible={!!celebrate}
        code={celebrate?.code || ""}
        saveAmount={celebrate?.amount || 0}
        onClose={() => setCelebrate(null)}
      />
    </SafeAreaView>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: bold ? font.bold : font.reg }}>{label}</Text>
      <Text style={{ color: color || colors.textPrimary, fontSize: bold ? 16 : 14, fontWeight: bold ? font.black : font.semi }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  emptyHeader: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  emptyHeaderTitle: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary },

  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceAlt,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary },
  headerAddrRow: { flexDirection: "row", alignItems: "center", marginTop: 2, maxWidth: "100%" },
  headerEta: { fontSize: 12.5, fontWeight: font.black, color: colors.textPrimary },
  headerAddr: { fontSize: 12.5, color: colors.textSecondary, flexShrink: 1 },

  savedStrip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#E7EEFF", paddingHorizontal: spacing.lg, paddingVertical: 9 },
  savedStripTxt: { color: "#3B5BDB", fontWeight: font.black, fontSize: 13.5 },

  cardBox: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },

  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  itemRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  vegBox: { width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  vegDot: { width: 7, height: 7, borderRadius: 4 },
  iName: { fontSize: 14, fontWeight: font.semi, color: colors.textPrimary },
  iUnit: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  iPrice: { fontSize: 13, fontWeight: font.bold, color: colors.textPrimary },
  qtyBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.primarySoft },
  qBtn: { paddingHorizontal: 9, paddingVertical: 5 },
  qty: { paddingHorizontal: 6, fontWeight: font.black, color: colors.primary, minWidth: 22, textAlign: "center", fontSize: 13 },

  addMoreRow: { flexDirection: "row", marginTop: spacing.sm },
  addMoreBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  addMoreTxt: { color: colors.success, fontWeight: font.black, fontSize: 13 },
  noteRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, backgroundColor: colors.surface,
  },
  noteInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: colors.textPrimary },

  cmIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  cmTitle: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary },
  cmCard: { width: 120 },
  cmImg: { width: 120, height: 90, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  cmAdd: {
    position: "absolute", right: 6, bottom: 6, width: 28, height: 28, borderRadius: 8,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", ...shadow.card,
  },
  cmVeg: { position: "absolute", left: 6, top: 6, backgroundColor: "#fff" },
  cmName: { fontSize: 12, fontWeight: font.semi, color: colors.textPrimary, marginTop: 6 },
  cmPrice: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  couponStrip: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.md,
    backgroundColor: "#EDF2FF", borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: "#D6E0FF",
  },
  pctBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#4A72F5", alignItems: "center", justifyContent: "center" },
  couponStripTxt: { flex: 1, color: "#3B5BDB", fontWeight: font.black, fontSize: 13.5 },
  secLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.5 },
  couponInput: { flex: 1, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  applyBtn: { paddingHorizontal: 16, justifyContent: "center", borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  appliedRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm, padding: 10, borderRadius: radius.md, backgroundColor: colors.successSoft },
  couponChip: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  offerRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },

  addrSummary: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.md,
    padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadow.card,
  },
  addrSummaryTitle: { fontSize: 13.5, fontWeight: font.black, color: colors.textPrimary },
  addrSummaryLine: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  changeTxt: { color: colors.primary, fontWeight: font.black, fontSize: 13 },

  contactRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  contactTxt: { fontSize: 13.5, fontWeight: font.bold, color: colors.textPrimary },

  billCard: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.md,
    padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  billLabel: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  billStrike: { fontSize: 13, color: colors.textMuted, textDecorationLine: "line-through" },
  billTotal: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary },
  billSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  savedPill: { backgroundColor: "#E7EEFF", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  savedPillTxt: { color: "#3B5BDB", fontSize: 10, fontWeight: font.black },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

  policyTitle: { fontSize: 12, fontWeight: font.black, color: colors.textMuted, letterSpacing: 1 },
  policyText: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 18 },

  bar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm, ...shadow.lifted },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  payUsing: { width: 118 },
  payUsingCaps: { fontSize: 10, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.4 },
  payUsingLabel: { fontSize: 13, fontWeight: font.bold, color: colors.textPrimary, marginTop: 2 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.errorSoft },
  errorText: { flex: 1, color: colors.error, fontSize: 13, fontWeight: font.semi },
  placeBtn: {
    flex: 1, backgroundColor: colors.primary, paddingVertical: 11, paddingHorizontal: 16,
    borderRadius: radius.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  placeTotal: { color: "#fff", fontWeight: font.black, fontSize: 16 },
  placeTotalSub: { color: "rgba(255,255,255,0.85)", fontSize: 9, fontWeight: font.black, letterSpacing: 0.5 },
  loginToContinueBtn: {
    backgroundColor: "#EF4444",
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  loginToContinueTxt: { color: "#fff", fontWeight: font.black, fontSize: 16, letterSpacing: 0.3 },
});
