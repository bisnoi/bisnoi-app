import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Platform, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Screen, ScreenHeader } from "@/src/components/ScreenHeader";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { openRazorpayCheckout } from "@/src/utils/razorpay";

const inr = (n: number) => "\u20B9" + (Number(n) || 0).toFixed(2);

type SegKey = "all" | "delivery" | "dinein";
const SEGS: { key: SegKey; label: string; icon: any }[] = [
  { key: "all",      label: "All",       icon: "people" },
  { key: "delivery", label: "Delivery",  icon: "bicycle" },
  { key: "dinein",   label: "Dine-in",   icon: "restaurant" },
];

const TOPUP_PRESETS = [200, 500, 1000, 2500];

export default function OwnerMarketing() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [wallet, setWallet]     = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [segment, setSegment]     = useState<SegKey>("all");
  const [search, setSearch]       = useState("");
  const [message, setMessage]     = useState("");
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [error, setError]         = useState("");

  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState<string>("500");
  const [toppingUp, setToppingUp] = useState(false);
  const [topupErr, setTopupErr]   = useState("");

  // Template library
  const [templates, setTemplates] = useState<any[]>([]);
  const [tplKind, setTplKind]     = useState<"marketing" | "loyalty" | "return_customer" | "all">("all");
  const [tplId, setTplId]         = useState<string | null>(null);
  const [tplSubmitOpen, setTplSubmitOpen] = useState(false);
  const [tplName, setTplName]     = useState("");
  const [tplBody, setTplBody]     = useState("");
  const [tplNewKind, setTplNewKind] = useState<"marketing" | "loyalty" | "return_customer" | "custom">("marketing");
  const [tplBusy, setTplBusy]     = useState(false);
  const [tplErr, setTplErr]       = useState("");
  const [tplOk, setTplOk]         = useState("");

  const load = useCallback(async () => {
    try {
      const [ov, w, camps, tpls] = await Promise.all([
        Api.marketingOverview().catch(() => null),
        Api.marketingWallet().catch(() => null),
        Api.marketingCampaigns().catch(() => ({ campaigns: [] })),
        Api.marketingTemplates().catch(() => ({ templates: [] })),
      ]);
      setOverview(ov);
      setWallet(w);
      setCampaigns(((camps as any)?.campaigns) || []);
      setTemplates(((tpls as any)?.templates) || []);
    } catch (e: any) {
      setError(e?.message || "Could not load marketing");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomers = useCallback(async (seg: SegKey, q: string) => {
    try {
      const r: any = await Api.marketingCustomers({ segment: seg, q: q || undefined });
      setCustomers(r?.customers || []);
    } catch {
      setCustomers([]);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    loadCustomers(segment, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]));

  const onSegment = (k: SegKey) => {
    setSegment(k);
    loadCustomers(k, search);
  };
  const onSearchSubmit = () => loadCustomers(segment, search);

  const restId: string | undefined = overview?.restaurant?.id;
  const rate: number = Number(overview?.rate ?? wallet?.rate ?? 0);
  const balance: number = Number(wallet?.balance ?? overview?.wallet?.balance ?? 0);
  const configured: boolean = !!overview?.whatsapp_configured;
  const canAfford = rate > 0 ? Math.floor(balance / rate) : customers.length;
  const willSend = Math.min(customers.length, canAfford);
  const estCost = willSend * rate;

  const startTopup = async () => {
    setTopupErr("");
    const amt = Math.round(Number(topupAmount) || 0);
    if (!restId) { setTopupErr("Restaurant not loaded"); return; }
    if (amt < 10) { setTopupErr("Minimum \u20B910"); return; }
    if (Platform.OS !== "web") {
      Alert.alert("Web only", "Wallet top-up runs on the web app. Please open bisnoi.com on your browser.");
      return;
    }
    setToppingUp(true);
    try {
      const pay: any = await Api.createPayment({
        purpose: "wallet_topup", restaurant_id: restId, amount: amt,
      });
      await openRazorpayCheckout({
        keyId: pay.key_id,
        orderId: pay.razorpay_order_id,
        amount: pay.amount,
        name: "Bisnoi Marketing",
        description: `Wallet top-up • ${inr(amt)}`,
        prefill: { name: user?.name || "", contact: user?.phone || "" },
        themeColor: colors.primary,
        onSuccess: async (resp) => {
          try {
            await Api.verifyPayment({
              payment_id: pay.payment_id,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            setToppingUp(false);
            setTopupOpen(false);
            await load();
          } catch (e: any) {
            setToppingUp(false);
            setTopupErr(e?.message || "Verification failed");
          }
        },
        onDismiss: () => { setToppingUp(false); setTopupErr("Payment cancelled"); },
        onError: (e: any) => { setToppingUp(false); setTopupErr((e?.description || e?.message) || "Payment failed"); },
      });
    } catch (e: any) {
      setToppingUp(false);
      setTopupErr(e?.message || "Could not start payment");
    }
  };

  const sendCampaign = async () => {
    setError(""); setSendResult(null);
    const msg = message.trim();
    if (msg.length < 3) { setError("Message is too short"); return; }
    if (customers.length === 0) { setError("No recipients"); return; }
    setSending(true);
    try {
      const r: any = await Api.marketingSendCampaign({ message: msg, segment });
      setSendResult(r);
      setMessage("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Marketing" subtitle="WhatsApp campaigns to your customers" />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          {/* Wallet hero */}
          <View style={styles.hero} testID="marketing-wallet-hero">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="wallet" size={18} color={colors.onPrimary} />
              <Text style={styles.heroLbl}>MARKETING WALLET</Text>
            </View>
            <Text style={styles.heroAmt} testID="marketing-wallet-balance">{inr(balance)}</Text>
            <Text style={styles.heroSub}>Rate: {inr(rate)} / message • {wallet?.messages_sent || 0} sent lifetime</Text>
            <TouchableOpacity testID="marketing-topup-btn" onPress={() => setTopupOpen(true)} style={styles.topupBtn} activeOpacity={0.9}>
              <Ionicons name="add-circle" size={18} color={colors.primary} />
              <Text style={styles.topupTxt}>Top up wallet</Text>
            </TouchableOpacity>
          </View>

          {/* WhatsApp status banner */}
          {!configured ? (
            <View style={styles.warnBox} testID="marketing-not-configured">
              <Ionicons name="alert-circle" size={18} color={colors.warning} />
              <Text style={styles.warnTxt}>
                WhatsApp template not fully configured yet. Campaigns will fall back to a manual wa.me link per contact. Contact admin to enable direct sending.
              </Text>
            </View>
          ) : null}

          {/* Template library */}
          <Text style={styles.secTitle}>PRE-APPROVED TEMPLATES</Text>
          <View style={styles.card}>
            <View style={styles.tplKindRow}>
              {(["all","marketing","loyalty","return_customer"] as const).map((k) => {
                const active = tplKind === k;
                return (
                  <TouchableOpacity
                    key={k}
                    testID={`tpl-kind-${k}`}
                    onPress={() => setTplKind(k)}
                    activeOpacity={0.85}
                    style={[styles.tplKindChip, active && styles.tplKindChipActive]}
                  >
                    <Text style={[styles.tplKindTxt, active && { color: colors.onPrimary }]}>{prettyKind(k)}</Text>
                  </TouchableOpacity>
                );
              })}
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                testID="tpl-submit-open"
                onPress={() => { setTplName(""); setTplBody(""); setTplNewKind("marketing"); setTplErr(""); setTplOk(""); setTplSubmitOpen(true); }}
                style={styles.tplNewBtn}
                activeOpacity={0.9}
              >
                <Ionicons name="add" size={14} color={colors.primary} />
                <Text style={styles.tplNewTxt}>Submit new</Text>
              </TouchableOpacity>
            </View>

            {(() => {
              const visible = templates.filter((t) => t.status === "approved" && (tplKind === "all" || t.kind === tplKind));
              if (visible.length === 0) return (
                <Text style={styles.hint}>No approved templates yet in this category.</Text>
              );
              return visible.map((t) => {
                const on = tplId === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    testID={`tpl-select-${t.id}`}
                    onPress={() => { setTplId(t.id); setMessage(t.body); }}
                    activeOpacity={0.85}
                    style={[styles.tplCard, on && styles.tplCardOn]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <View style={[styles.tplTag, tplTagBg(t.kind)]}>
                        <Text style={styles.tplTagTxt}>{prettyKind(t.kind).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.tplName} numberOfLines={1}>{t.name}</Text>
                      {t.is_platform ? (
                        <View style={styles.platformTag}><Ionicons name="checkmark-circle" size={10} color={colors.success} /><Text style={styles.platformTagTxt}>PLATFORM</Text></View>
                      ) : (
                        <View style={styles.ownTag}><Text style={styles.ownTagTxt}>YOURS</Text></View>
                      )}
                      {on ? <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={{ marginLeft: 4 }} /> : null}
                    </View>
                    <Text style={styles.tplBody} numberOfLines={2}>{t.body}</Text>
                  </TouchableOpacity>
                );
              });
            })()}

            {/* Owner's own pending/rejected submissions */}
            {(() => {
              const pending = templates.filter((t) => !t.is_platform && t.status !== "approved");
              if (pending.length === 0) return null;
              return (
                <>
                  <Text style={[styles.label, { marginTop: spacing.md }]}>YOUR PENDING SUBMISSIONS</Text>
                  {pending.map((t) => (
                    <View key={t.id} style={styles.pendingRow} testID={`tpl-pending-${t.id}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tplName} numberOfLines={1}>{t.name}</Text>
                        <Text style={styles.tplBody} numberOfLines={2}>{t.body}</Text>
                        {t.status === "rejected" && t.reject_reason ? (
                          <Text style={styles.rejectReason}>Reason: {t.reject_reason}</Text>
                        ) : null}
                      </View>
                      <View style={[styles.statusPill, statusBg(t.status)]}>
                        <Text style={styles.statusTxt}>{prettyStatus(t.status)}</Text>
                      </View>
                    </View>
                  ))}
                </>
              );
            })()}
          </View>

          {/* Compose */}
          <Text style={styles.secTitle}>COMPOSE CAMPAIGN</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Audience segment</Text>
            <View style={styles.segRow}>
              {SEGS.map((s) => {
                const active = segment === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    testID={`marketing-seg-${s.key}`}
                    activeOpacity={0.85}
                    onPress={() => onSegment(s.key)}
                    style={[styles.segChip, active && styles.segChipActive]}
                  >
                    <Ionicons name={s.icon} size={14} color={active ? colors.onPrimary : colors.textPrimary} />
                    <Text style={[styles.segTxt, active && { color: colors.onPrimary }]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TextInput
                testID="marketing-customer-search"
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={onSearchSubmit}
                placeholder="Search by name or phone"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { flex: 1 }]}
              />
              <TouchableOpacity onPress={onSearchSubmit} style={styles.searchBtn}>
                <Ionicons name="search" size={18} color={colors.onPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Message (WhatsApp)</Text>
            <TextInput
              testID="marketing-message-input"
              value={message}
              onChangeText={setMessage}
              placeholder="Special offer today! Enjoy 20% off on all thalis..."
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
            />
            <Text style={styles.hint}>Body of your marketing template. Keep it short and clear.</Text>

            {/* Recipient summary */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryVal}>{customers.length}</Text>
                <Text style={styles.summaryLbl}>Recipients</Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryVal}>{willSend}</Text>
                <Text style={styles.summaryLbl}>Will send</Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={[styles.summaryVal, { color: colors.primary }]}>{inr(estCost)}</Text>
                <Text style={styles.summaryLbl}>Est. cost</Text>
              </View>
            </View>
            {rate > 0 && customers.length > canAfford ? (
              <Text style={styles.warnLine}>Only {canAfford} messages fit your balance. Top up to send all.</Text>
            ) : null}

            {error ? <Text style={styles.err}>{error}</Text> : null}
            {sendResult ? (
              <View style={styles.okBox} testID="marketing-send-result">
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.okTxt}>
                  Sent {sendResult.sent} / {sendResult.recipients} • Cost {inr(sendResult.cost || 0)} • Balance {inr(sendResult.balance || 0)}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              testID="marketing-send-btn"
              disabled={sending || customers.length === 0 || message.trim().length < 3}
              onPress={sendCampaign}
              activeOpacity={0.9}
              style={[styles.sendBtn, (sending || customers.length === 0 || message.trim().length < 3) && { opacity: 0.55 }]}
            >
              {sending ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name="paper-plane" size={18} color={colors.onPrimary} />
                  <Text style={styles.sendTxt}>Send Campaign</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Campaign history */}
          <Text style={styles.secTitle}>RECENT CAMPAIGNS</Text>
          {campaigns.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="megaphone-outline" size={22} color={colors.textMuted} />
              <Text style={styles.emptyTxt}>No campaigns yet. Send your first one above.</Text>
            </View>
          ) : campaigns.map((c) => (
            <View key={c.id} style={styles.campCard} testID={`marketing-campaign-${c.id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={styles.campMsg} numberOfLines={2}>{c.message}</Text>
                <Text style={styles.campCost}>{inr(c.cost || 0)}</Text>
              </View>
              <View style={styles.campMetaRow}>
                <View style={styles.pill}><Text style={styles.pillTxt}>{c.segment || "custom"}</Text></View>
                <Text style={styles.campMeta}>Sent {c.sent}/{c.recipients} • {fmtWhen(c.created_at)}</Text>
              </View>
            </View>
          ))}

          {/* Ledger */}
          {wallet?.transactions?.length ? (
            <>
              <Text style={styles.secTitle}>WALLET LEDGER</Text>
              {wallet.transactions.slice(0, 20).map((t: any) => (
                <View key={t.id} style={styles.txnRow}>
                  <View style={[styles.txnIc, { backgroundColor: (t.kind === "credit" ? colors.success : colors.error) + "22" }]}>
                    <Ionicons name={t.kind === "credit" ? "add" : "remove"} size={14} color={t.kind === "credit" ? colors.success : colors.error} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txnTitle}>{prettyReason(t.reason)}</Text>
                    <Text style={styles.txnMeta}>{fmtWhen(t.created_at)}</Text>
                  </View>
                  <Text style={[styles.txnAmt, { color: t.kind === "credit" ? colors.success : colors.error }]}>
                    {t.kind === "credit" ? "+" : "-"}{inr(t.amount)}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}

      {/* Top-up modal */}
      <Modal visible={topupOpen} transparent animationType="fade" onRequestClose={() => setTopupOpen(false)}>
        <View style={styles.mBg}>
          <View style={styles.mCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="wallet" size={20} color={colors.primary} />
              <Text style={styles.mTitle}>Top up wallet</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setTopupOpen(false)}><Ionicons name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={styles.mHint}>UPI / cards accepted via Razorpay. Balance is added immediately after payment.</Text>
            <View style={styles.presetRow}>
              {TOPUP_PRESETS.map((v) => (
                <TouchableOpacity
                  key={v}
                  testID={`marketing-topup-preset-${v}`}
                  onPress={() => setTopupAmount(String(v))}
                  style={[styles.preset, String(v) === topupAmount && styles.presetActive]}
                >
                  <Text style={[styles.presetTxt, String(v) === topupAmount && { color: colors.onPrimary }]}>{inr(v)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Amount (INR)</Text>
            <TextInput
              testID="marketing-topup-amount"
              value={topupAmount}
              onChangeText={setTopupAmount}
              placeholder="e.g. 500"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={styles.input}
            />
            {topupErr ? <Text style={styles.err}>{topupErr}</Text> : null}
            <TouchableOpacity
              testID="marketing-topup-pay"
              disabled={toppingUp}
              onPress={startTopup}
              style={[styles.sendBtn, { marginTop: spacing.md }, toppingUp && { opacity: 0.6 }]}
              activeOpacity={0.9}
            >
              {toppingUp ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name="card" size={18} color={colors.onPrimary} />
                  <Text style={styles.sendTxt}>Pay & Add Balance</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Submit new template modal */}
      <Modal visible={tplSubmitOpen} transparent animationType="fade" onRequestClose={() => setTplSubmitOpen(false)}>
        <View style={styles.mBg}>
          <View style={styles.mCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="document-text" size={20} color={colors.primary} />
              <Text style={styles.mTitle}>Submit new template</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setTplSubmitOpen(false)}><Ionicons name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={styles.mHint}>
              Draft a reusable message. It will be sent to admin for approval — once approved it becomes selectable here and stays in your library for future campaigns.
            </Text>

            <Text style={styles.label}>Category</Text>
            <View style={styles.tplKindRow}>
              {(["marketing","loyalty","return_customer","custom"] as const).map((k) => {
                const on = tplNewKind === k;
                return (
                  <TouchableOpacity
                    key={k}
                    testID={`tpl-new-kind-${k}`}
                    onPress={() => setTplNewKind(k)}
                    activeOpacity={0.85}
                    style={[styles.tplKindChip, on && styles.tplKindChipActive]}
                  >
                    <Text style={[styles.tplKindTxt, on && { color: colors.onPrimary }]}>{prettyKind(k)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Template name</Text>
            <TextInput
              testID="tpl-new-name"
              value={tplName} onChangeText={setTplName}
              placeholder="e.g. Anniversary special"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Message body</Text>
            <TextInput
              testID="tpl-new-body"
              value={tplBody} onChangeText={setTplBody}
              placeholder={"Hi {name}! Celebrate with us at {restaurant}..."}
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
            />
            <Text style={styles.hint}>Tip: keep it short. Use {"{name}"} for the customer's name and {"{restaurant}"} for your restaurant name.</Text>

            {tplErr ? <Text style={styles.err}>{tplErr}</Text> : null}
            {tplOk  ? <View style={styles.okBox}><Ionicons name="checkmark-circle" size={16} color={colors.success} /><Text style={styles.okTxt}>{tplOk}</Text></View> : null}

            <TouchableOpacity
              testID="tpl-submit"
              disabled={tplBusy}
              onPress={async () => {
                setTplErr(""); setTplOk("");
                if (tplName.trim().length < 2) { setTplErr("Template name is too short"); return; }
                if (tplBody.trim().length < 5) { setTplErr("Template body is too short"); return; }
                setTplBusy(true);
                try {
                  await Api.marketingSubmitTemplate({
                    kind: tplNewKind, name: tplName.trim(), body: tplBody.trim(),
                    submit_for_approval: true,
                  });
                  setTplOk("Submitted — waiting for admin approval.");
                  setTplName(""); setTplBody("");
                  await load();
                  setTimeout(() => setTplSubmitOpen(false), 1200);
                } catch (e: any) {
                  setTplErr(e?.message || "Submission failed");
                } finally {
                  setTplBusy(false);
                }
              }}
              style={[styles.sendBtn, { marginTop: spacing.md }, tplBusy && { opacity: 0.6 }]}
              activeOpacity={0.9}
            >
              {tplBusy ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name="paper-plane" size={18} color={colors.onPrimary} />
                  <Text style={styles.sendTxt}>Submit for approval</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function prettyKind(k: string) {
  if (k === "marketing") return "Marketing";
  if (k === "loyalty") return "Loyalty";
  if (k === "return_customer") return "Return Customer";
  if (k === "custom") return "Custom";
  if (k === "all") return "All";
  return k;
}
function tplTagBg(k: string) {
  if (k === "marketing") return { backgroundColor: "#0EA5E922" };
  if (k === "loyalty") return { backgroundColor: "#8B5CF622" };
  if (k === "return_customer") return { backgroundColor: "#F59E0B22" };
  return { backgroundColor: colors.surfaceAlt };
}
function statusBg(s: string) {
  if (s === "approved") return { backgroundColor: colors.successSoft };
  if (s === "pending_approval") return { backgroundColor: colors.warningSoft };
  if (s === "rejected") return { backgroundColor: "#FEE2E2" };
  if (s === "draft") return { backgroundColor: colors.surfaceAlt };
  return { backgroundColor: colors.surfaceAlt };
}
function prettyStatus(s: string) {
  if (s === "pending_approval") return "PENDING";
  if (s === "approved") return "APPROVED";
  if (s === "rejected") return "REJECTED";
  if (s === "draft") return "DRAFT";
  return String(s || "").toUpperCase();
}

function fmtWhen(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function prettyReason(r?: string) {
  switch (r) {
    case "topup_razorpay": return "Wallet top-up (Razorpay)";
    case "topup_admin":    return "Admin credit";
    case "admin_adjust":   return "Admin adjustment";
    case "campaign":       return "WhatsApp campaign";
    default: return r || "Transaction";
  }
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.xl, ...shadow.lifted },
  heroLbl: { fontSize: 11, fontWeight: font.black, color: colors.onPrimary, opacity: 0.85, letterSpacing: 0.6 },
  heroAmt: { fontSize: 36, fontWeight: font.black, color: colors.onPrimary, marginTop: 6 },
  heroSub: { fontSize: 12, color: colors.onPrimary, opacity: 0.9, marginTop: 2 },
  topupBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.onPrimary, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, marginTop: spacing.md, alignSelf: "flex-start" },
  topupTxt: { fontSize: 14, fontWeight: font.black, color: colors.primary },

  warnBox: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  warnTxt: { flex: 1, fontSize: 12.5, color: colors.warning, fontWeight: font.semi, lineHeight: 18 },

  secTitle: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4, marginTop: spacing.xl, marginBottom: spacing.sm },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  label: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: 6, letterSpacing: 0.3 },
  hint: { fontSize: 11.5, color: colors.textSecondary, marginTop: 4 },

  segRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  segChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 7 },
  segChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segTxt: { fontSize: 13, fontWeight: font.bold, color: colors.textPrimary },

  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: colors.textPrimary, marginTop: 4 },
  searchBtn: { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, marginTop: 4 },

  summaryRow: { flexDirection: "row", gap: 8, marginTop: spacing.md },
  summaryBox: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  summaryVal: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  summaryLbl: { fontSize: 11, color: colors.textSecondary, fontWeight: font.semi, marginTop: 2 },
  warnLine: { fontSize: 12, color: colors.warning, fontWeight: font.semi, marginTop: 6 },

  err: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.sm },
  okBox: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.successSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  okTxt: { flex: 1, fontSize: 12.5, color: colors.success, fontWeight: font.semi },

  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: radius.lg, height: 52, marginTop: spacing.lg, ...shadow.lifted },
  sendTxt: { fontSize: 16, fontWeight: font.black, color: colors.onPrimary },

  emptyBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  emptyTxt: { flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: font.semi },

  campCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  campMsg: { flex: 1, fontSize: 14, fontWeight: font.semi, color: colors.textPrimary, marginRight: 8 },
  campCost: { fontSize: 14, fontWeight: font.black, color: colors.primary },
  campMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  campMeta: { fontSize: 11.5, color: colors.textSecondary },
  pill: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillTxt: { fontSize: 10.5, fontWeight: font.black, color: colors.primary, textTransform: "uppercase" },

  txnRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: 6 },
  txnIc: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  txnTitle: { fontSize: 13, fontWeight: font.bold, color: colors.textPrimary },
  txnMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  txnAmt: { fontSize: 14, fontWeight: font.black },

  mBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: spacing.lg },
  mCard: { width: "100%", maxWidth: 460, backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.lifted },
  mTitle: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  mHint: { fontSize: 12, color: colors.textSecondary, marginTop: 6, marginBottom: spacing.md },
  presetRow: { flexDirection: "row", gap: 6, marginBottom: spacing.sm },
  preset: { flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingVertical: 10, alignItems: "center" },
  presetActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetTxt: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary },

  // Marketing template library
  tplKindRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: spacing.sm },
  tplKindChip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6 },
  tplKindChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tplKindTxt: { fontSize: 12, fontWeight: font.bold, color: colors.textPrimary },
  tplNewBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 6 },
  tplNewTxt: { fontSize: 12, fontWeight: font.black, color: colors.primary },
  tplCard: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, padding: spacing.sm, marginBottom: 6 },
  tplCardOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tplTag: { borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  tplTagTxt: { fontSize: 9, fontWeight: font.black, letterSpacing: 0.4, color: colors.textPrimary },
  tplName: { flex: 1, fontSize: 13, fontWeight: font.black, color: colors.textPrimary },
  tplBody: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  platformTag: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radius.pill, backgroundColor: colors.successSoft, paddingHorizontal: 5, paddingVertical: 1 },
  platformTagTxt: { fontSize: 8.5, fontWeight: font.black, color: colors.success, letterSpacing: 0.3 },
  ownTag: { borderRadius: radius.pill, backgroundColor: "#0EA5E922", paddingHorizontal: 5, paddingVertical: 1 },
  ownTagTxt: { fontSize: 8.5, fontWeight: font.black, color: "#0EA5E9", letterSpacing: 0.3 },
  pendingRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: 6, backgroundColor: colors.surfaceAlt },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  statusTxt: { fontSize: 9.5, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4 },
  rejectReason: { fontSize: 11, color: colors.error, fontWeight: font.semi, marginTop: 4 },
});
