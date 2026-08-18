import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Api } from "@/src/api";
import { Screen, ScreenHeader } from "@/src/components/ScreenHeader";
import { colors, spacing, radius, font, shadow } from "@/src/theme";

const inr = (n: number) => "\u20B9" + (Number(n) || 0).toFixed(2);

export default function AdminMarketing() {
  const [settings, setSettings] = useState<any>(null);
  const [wallets, setWallets]   = useState<any[]>([]);
  const [usage, setUsage]       = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError]       = useState("");

  // local form
  const [rate, setRate]         = useState("0.85");
  const [currency, setCurrency] = useState("INR");
  const [tmpl, setTmpl]         = useState("");
  const [tmplLang, setTmplLang] = useState("en");
  const [enabled, setEnabled]   = useState(true);

  // credit modal
  const [creditRow, setCreditRow] = useState<any>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditErr, setCreditErr]   = useState("");

  // Template library
  const [templates, setTemplates] = useState<any[]>([]);
  const [tplFilter, setTplFilter] = useState<"pending_approval" | "approved" | "rejected" | "all">("pending_approval");
  const [tplRejectId, setTplRejectId] = useState<string | null>(null);
  const [tplRejectReason, setTplRejectReason] = useState("");
  const [tplCreateOpen, setTplCreateOpen] = useState(false);
  const [tplNewKind, setTplNewKind] = useState<"marketing" | "loyalty" | "return_customer" | "custom">("marketing");
  const [tplNewName, setTplNewName] = useState("");
  const [tplNewBody, setTplNewBody] = useState("");
  const [tplBusy, setTplBusy] = useState<string | null>(null);
  const [tplErr, setTplErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, w, u, t] = await Promise.all([
        Api.adminMarketingSettings().catch(() => null),
        Api.adminMarketingWallets().catch(() => ({ wallets: [] })),
        Api.adminMarketingUsage().catch(() => null),
        Api.adminListTemplates().catch(() => ({ templates: [] })),
      ]);
      if (s) {
        setSettings(s);
        setRate(String(s.per_message_rate ?? 0.85));
        setCurrency(s.currency || "INR");
        setTmpl(s.marketing_template || "");
        setTmplLang(s.marketing_template_lang || "en");
        setEnabled(!!s.enabled);
      }
      setWallets(((w as any)?.wallets) || []);
      setUsage(u);
      setTemplates(((t as any)?.templates) || []);
    } catch (e: any) {
      setError(e?.message || "Could not load marketing");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveSettings = async () => {
    setSavingSettings(true); setSavedTick(false); setError("");
    try {
      const body = {
        per_message_rate: Number(rate) || 0,
        currency: (currency || "INR").trim(),
        marketing_template: tmpl.trim(),
        marketing_template_lang: (tmplLang || "en").trim(),
        enabled,
      };
      const s: any = await Api.adminUpdateMarketingSettings(body);
      setSettings(s);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2500);
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSavingSettings(false);
    }
  };

  const openCredit = (row: any) => {
    setCreditRow(row); setCreditAmount(""); setCreditNote(""); setCreditErr("");
  };
  const doCredit = async () => {
    if (!creditRow) return;
    const amt = Number(creditAmount);
    if (!amt || Math.abs(amt) < 1) { setCreditErr("Enter a non-zero amount (+ credit, − debit)"); return; }
    setCreditBusy(true); setCreditErr("");
    try {
      await Api.adminCreditMarketingWallet(creditRow.restaurant_id, {
        amount: amt, note: creditNote || undefined,
      });
      setCreditRow(null);
      await load();
    } catch (e: any) {
      setCreditErr(e?.message || "Credit failed");
    } finally {
      setCreditBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Marketing" subtitle="WhatsApp campaigns, rate & wallets" />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          {/* Usage summary */}
          {usage ? (
            <View style={styles.statsRow} testID="admin-marketing-usage">
              <Stat icon="megaphone" color={colors.primary} label="Campaigns" value={String(usage.total_campaigns || 0)} />
              <Stat icon="send" color="#0EA5E9" label="Messages sent" value={String(usage.total_messages_sent || 0)} />
              <Stat icon="cash" color={colors.success} label="Revenue" value={inr(usage.total_revenue || 0)} />
              <Stat icon="wallet" color="#8B5CF6" label="Wallet float" value={inr(usage.wallet_balance_total || 0)} />
            </View>
          ) : null}

          {/* Settings */}
          <Text style={styles.secTitle}>PLATFORM SETTINGS</Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Marketing enabled</Text>
                <Text style={styles.hint}>Turn off to pause all campaigns platform-wide</Text>
              </View>
              <Switch
                testID="admin-marketing-enabled"
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ true: colors.primary }}
              />
            </View>

            <Text style={styles.label}>Per-message rate (INR)</Text>
            <TextInput
              testID="admin-marketing-rate"
              value={rate} onChangeText={setRate}
              placeholder="e.g. 0.85" keyboardType="numeric" style={styles.input}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.hint}>Charged per successfully-sent WhatsApp message. Set 0 for free.</Text>

            <Text style={styles.label}>Currency</Text>
            <TextInput
              testID="admin-marketing-currency"
              value={currency} onChangeText={setCurrency}
              placeholder="INR" style={styles.input} autoCapitalize="characters"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.label}>WhatsApp template name</Text>
            <TextInput
              testID="admin-marketing-template"
              value={tmpl} onChangeText={setTmpl}
              placeholder="e.g. bisnoi_marketing" style={styles.input}
              autoCapitalize="none" autoCorrect={false}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.hint}>Approved MARKETING template with a single body param (message text).</Text>

            <Text style={styles.label}>Template language</Text>
            <TextInput
              testID="admin-marketing-template-lang"
              value={tmplLang} onChangeText={setTmplLang}
              placeholder="en" style={styles.input} autoCapitalize="none"
              placeholderTextColor={colors.textMuted}
            />

            {settings && !settings.whatsapp_configured ? (
              <View style={styles.warnBox}>
                <Ionicons name="alert-circle" size={16} color={colors.warning} />
                <Text style={styles.warnTxt}>WhatsApp API not fully configured — configure it in the WhatsApp settings page first.</Text>
              </View>
            ) : null}

            {error ? <Text style={styles.err}>{error}</Text> : null}
            {savedTick ? (
              <View style={styles.okBox}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={styles.okTxt}>Settings saved.</Text>
              </View>
            ) : null}

            <TouchableOpacity
              testID="admin-marketing-save"
              activeOpacity={0.9} disabled={savingSettings}
              onPress={saveSettings}
              style={[styles.saveBtn, savingSettings && { opacity: 0.6 }]}
            >
              {savingSettings ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name="save" size={18} color={colors.onPrimary} />
                  <Text style={styles.saveTxt}>Save Settings</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Template library */}
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.sm }}>
            <Text style={[styles.secTitle, { marginTop: 0, marginBottom: 0, flex: 1 }]}>MARKETING TEMPLATE LIBRARY</Text>
            <TouchableOpacity
              testID="admin-tpl-create-open"
              onPress={() => { setTplNewKind("marketing"); setTplNewName(""); setTplNewBody(""); setTplErr(""); setTplCreateOpen(true); }}
              activeOpacity={0.9}
              style={styles.tplNewBtn}
            >
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={styles.tplNewTxt}>New template</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tplFilterRow}>
            {(["pending_approval","approved","rejected","all"] as const).map((k) => {
              const on = tplFilter === k;
              const count = k === "all" ? templates.length : templates.filter((t) => t.status === k).length;
              return (
                <TouchableOpacity
                  key={k}
                  testID={`admin-tpl-filter-${k}`}
                  onPress={() => setTplFilter(k)}
                  activeOpacity={0.85}
                  style={[styles.tplFilterChip, on && styles.tplFilterChipActive]}
                >
                  <Text style={[styles.tplFilterTxt, on && { color: colors.onPrimary }]}>{prettyStatus(k)} ({count})</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {(() => {
            const rows = templates.filter((t) => tplFilter === "all" || t.status === tplFilter);
            if (rows.length === 0) return (
              <View style={styles.emptyBox}>
                <Ionicons name="document-text-outline" size={22} color={colors.textMuted} />
                <Text style={styles.emptyTxt}>No templates in this bucket.</Text>
              </View>
            );
            return rows.map((t: any) => (
              <View key={t.id} style={styles.tplRow} testID={`admin-tpl-${t.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <View style={[styles.tplTag, tplKindBg(t.kind)]}>
                    <Text style={styles.tplTagTxt}>{prettyKind(t.kind).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.tplName} numberOfLines={1}>{t.name}</Text>
                  <View style={[styles.statusPill, statusBg(t.status)]}><Text style={styles.statusTxt}>{prettyStatus(t.status)}</Text></View>
                  {t.is_platform ? (
                    <View style={styles.platformTag}><Text style={styles.platformTagTxt}>PLATFORM</Text></View>
                  ) : (
                    <Text style={styles.tplMeta} numberOfLines={1}>{t.restaurant_name || "—"} • {t.owner_name || ""}</Text>
                  )}
                </View>
                <Text style={styles.tplBody}>{t.body}</Text>
                {t.status === "rejected" && t.reject_reason ? (
                  <Text style={styles.rejectReason}>Reason: {t.reject_reason}</Text>
                ) : null}
                <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {t.status === "pending_approval" ? (
                    <>
                      <TouchableOpacity
                        testID={`admin-tpl-approve-${t.id}`}
                        disabled={tplBusy === t.id}
                        onPress={async () => {
                          setTplBusy(t.id);
                          try { await Api.adminPatchTemplate(t.id, { status: "approved" }); await load(); }
                          catch (e: any) { setTplErr(e?.message || "Approve failed"); }
                          finally { setTplBusy(null); }
                        }}
                        style={[styles.tplActionBtn, { backgroundColor: colors.success }]}
                        activeOpacity={0.9}
                      >
                        <Ionicons name="checkmark" size={13} color={colors.onPrimary} />
                        <Text style={styles.tplActionTxt}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`admin-tpl-reject-open-${t.id}`}
                        onPress={() => { setTplRejectId(t.id); setTplRejectReason(""); }}
                        style={[styles.tplActionBtn, { backgroundColor: colors.error }]}
                        activeOpacity={0.9}
                      >
                        <Ionicons name="close" size={13} color={colors.onPrimary} />
                        <Text style={styles.tplActionTxt}>Reject</Text>
                      </TouchableOpacity>
                    </>
                  ) : t.status === "rejected" || t.status === "draft" ? (
                    <TouchableOpacity
                      testID={`admin-tpl-approve-${t.id}`}
                      disabled={tplBusy === t.id}
                      onPress={async () => {
                        setTplBusy(t.id);
                        try { await Api.adminPatchTemplate(t.id, { status: "approved" }); await load(); }
                        catch (e: any) { setTplErr(e?.message || "Approve failed"); }
                        finally { setTplBusy(null); }
                      }}
                      style={[styles.tplActionBtn, { backgroundColor: colors.success }]}
                      activeOpacity={0.9}
                    >
                      <Ionicons name="checkmark" size={13} color={colors.onPrimary} />
                      <Text style={styles.tplActionTxt}>Approve</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    testID={`admin-tpl-delete-${t.id}`}
                    disabled={tplBusy === t.id}
                    onPress={async () => {
                      setTplBusy(t.id);
                      try { await Api.adminDeleteTemplate(t.id); await load(); }
                      catch (e: any) { setTplErr(e?.message || "Delete failed"); }
                      finally { setTplBusy(null); }
                    }}
                    style={[styles.tplActionBtn, { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }]}
                    activeOpacity={0.9}
                  >
                    <Ionicons name="trash" size={12} color={colors.error} />
                    <Text style={[styles.tplActionTxt, { color: colors.error }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ));
          })()}
          {tplErr ? <Text style={styles.err}>{tplErr}</Text> : null}

          {/* Wallets */}
          <Text style={styles.secTitle}>RESTAURANT WALLETS</Text>
          {wallets.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="wallet-outline" size={22} color={colors.textMuted} />
              <Text style={styles.emptyTxt}>No wallets yet. They are created the first time an owner opens Marketing.</Text>
            </View>
          ) : wallets.map((w: any) => (
            <View key={w.restaurant_id} style={styles.wCard} testID={`admin-wallet-${w.restaurant_id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.wTitle} numberOfLines={1}>{w.restaurant_name}</Text>
                <Text style={styles.wSub}>{w.owner_name || "—"} • {w.owner_phone || "no phone"}</Text>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
                  <Text style={styles.wStat}>Credited <Text style={styles.wStatV}>{inr(w.total_credited)}</Text></Text>
                  <Text style={styles.wStat}>Spent <Text style={styles.wStatV}>{inr(w.total_spent)}</Text></Text>
                  <Text style={styles.wStat}>Sent <Text style={styles.wStatV}>{w.messages_sent}</Text></Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={styles.wBal}>{inr(w.balance)}</Text>
                <TouchableOpacity
                  testID={`admin-wallet-credit-${w.restaurant_id}`}
                  onPress={() => openCredit(w)}
                  style={styles.creditBtn}
                >
                  <Ionicons name="add-circle" size={14} color={colors.primary} />
                  <Text style={styles.creditTxt}>Adjust</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Recent campaigns */}
          {usage?.recent_campaigns?.length ? (
            <>
              <Text style={styles.secTitle}>RECENT CAMPAIGNS</Text>
              {usage.recent_campaigns.slice(0, 30).map((c: any) => (
                <View key={c.id} style={styles.campCard} testID={`admin-campaign-${c.id}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Text style={styles.campMsg} numberOfLines={2}>{c.message}</Text>
                    <Text style={styles.campCost}>{inr(c.cost || 0)}</Text>
                  </View>
                  <Text style={styles.campMeta}>
                    {c.restaurant_name || "—"} • Sent {c.sent}/{c.recipients} • {fmtWhen(c.created_at)}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}

      {/* Create new platform template modal */}
      <Modal visible={tplCreateOpen} transparent animationType="fade" onRequestClose={() => setTplCreateOpen(false)}>
        <View style={styles.mBg}>
          <View style={styles.mCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="document-text" size={20} color={colors.primary} />
              <Text style={styles.mTitle}>New platform template</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity testID="admin-tpl-create-close" onPress={() => setTplCreateOpen(false)}><Ionicons name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={styles.mHint}>
              Platform templates are auto-approved and visible to every restaurant owner. Use them for reusable marketing / loyalty / return-customer scripts.
            </Text>

            <Text style={styles.label}>Category</Text>
            <View style={styles.tplFilterRow}>
              {(["marketing","loyalty","return_customer","custom"] as const).map((k) => {
                const on = tplNewKind === k;
                return (
                  <TouchableOpacity
                    key={k}
                    testID={`admin-tpl-new-kind-${k}`}
                    onPress={() => setTplNewKind(k)}
                    activeOpacity={0.85}
                    style={[styles.tplFilterChip, on && styles.tplFilterChipActive]}
                  >
                    <Text style={[styles.tplFilterTxt, on && { color: colors.onPrimary }]}>{prettyKind(k)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Template name</Text>
            <TextInput
              testID="admin-tpl-new-name"
              value={tplNewName} onChangeText={setTplNewName}
              placeholder="e.g. Anniversary Special"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Message body</Text>
            <TextInput
              testID="admin-tpl-new-body"
              value={tplNewBody} onChangeText={setTplNewBody}
              placeholder={"Hi {name}! Celebrate with us at {restaurant}..."}
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
            />
            <Text style={styles.hint}>Tip: use {"{name}"} and {"{restaurant}"} placeholders for personalisation.</Text>

            {tplErr ? <Text style={styles.err}>{tplErr}</Text> : null}

            <TouchableOpacity
              testID="admin-tpl-create-submit"
              disabled={tplBusy === "__create__"}
              onPress={async () => {
                setTplErr("");
                if (tplNewName.trim().length < 2) { setTplErr("Template name is too short"); return; }
                if (tplNewBody.trim().length < 5) { setTplErr("Template body is too short"); return; }
                setTplBusy("__create__");
                try {
                  await Api.adminCreateTemplate({
                    kind: tplNewKind, name: tplNewName.trim(), body: tplNewBody.trim(),
                  });
                  setTplCreateOpen(false);
                  await load();
                } catch (e: any) {
                  setTplErr(e?.message || "Create failed");
                } finally {
                  setTplBusy(null);
                }
              }}
              style={[styles.saveBtn, { marginTop: spacing.md }, tplBusy === "__create__" && { opacity: 0.6 }]}
              activeOpacity={0.9}
            >
              {tplBusy === "__create__" ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
                  <Text style={styles.saveTxt}>Create & Publish</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reject-with-reason modal */}
      <Modal visible={!!tplRejectId} transparent animationType="fade" onRequestClose={() => setTplRejectId(null)}>
        <View style={styles.mBg}>
          <View style={styles.mCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="close-circle" size={20} color={colors.error} />
              <Text style={styles.mTitle}>Reject template</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity testID="admin-tpl-reject-close" onPress={() => setTplRejectId(null)}><Ionicons name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={styles.mHint}>
              Share a short reason so the owner can fix and resubmit. The owner will get a notification.
            </Text>
            <Text style={styles.label}>Reason</Text>
            <TextInput
              testID="admin-tpl-reject-reason"
              value={tplRejectReason} onChangeText={setTplRejectReason}
              placeholder="e.g. Contains promotional guarantees — please rephrase."
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
            />
            {tplErr ? <Text style={styles.err}>{tplErr}</Text> : null}
            <TouchableOpacity
              testID="admin-tpl-reject-submit"
              disabled={tplBusy === tplRejectId}
              onPress={async () => {
                if (!tplRejectId) return;
                setTplErr("");
                setTplBusy(tplRejectId);
                try {
                  await Api.adminPatchTemplate(tplRejectId, {
                    status: "rejected",
                    reject_reason: tplRejectReason.trim() || "Not approved",
                  });
                  setTplRejectId(null);
                  setTplRejectReason("");
                  await load();
                } catch (e: any) {
                  setTplErr(e?.message || "Reject failed");
                } finally {
                  setTplBusy(null);
                }
              }}
              style={[styles.saveBtn, { marginTop: spacing.md, backgroundColor: colors.error }, tplBusy === tplRejectId && { opacity: 0.6 }]}
              activeOpacity={0.9}
            >
              {tplBusy === tplRejectId ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name="close" size={18} color={colors.onPrimary} />
                  <Text style={styles.saveTxt}>Reject Template</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Credit modal */}
      <Modal visible={!!creditRow} transparent animationType="fade" onRequestClose={() => setCreditRow(null)}>
        <View style={styles.mBg}>
          <View style={styles.mCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="wallet" size={20} color={colors.primary} />
              <Text style={styles.mTitle}>Adjust wallet</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setCreditRow(null)}><Ionicons name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={styles.mHint}>
              {creditRow?.restaurant_name} • Current balance {inr(creditRow?.balance || 0)}. Positive amount credits, negative debits.
            </Text>
            <Text style={styles.label}>Amount (INR)</Text>
            <TextInput
              testID="admin-credit-amount"
              value={creditAmount} onChangeText={setCreditAmount}
              placeholder="e.g. 500 or -100"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              style={styles.input}
            />
            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              testID="admin-credit-note"
              value={creditNote} onChangeText={setCreditNote}
              placeholder="Reason / reference"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            {creditErr ? <Text style={styles.err}>{creditErr}</Text> : null}
            <TouchableOpacity
              testID="admin-credit-submit"
              disabled={creditBusy}
              onPress={doCredit}
              style={[styles.saveBtn, { marginTop: spacing.md }, creditBusy && { opacity: 0.6 }]}
              activeOpacity={0.9}
            >
              {creditBusy ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
                  <Text style={styles.saveTxt}>Apply Adjustment</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Stat({ icon, color, label, value }: { icon: any; color: string; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIc, { backgroundColor: color + "22" }]}><Ionicons name={icon} size={16} color={color} /></View>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}
function fmtWhen(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function prettyKind(k: string) {
  if (k === "marketing") return "Marketing";
  if (k === "loyalty") return "Loyalty";
  if (k === "return_customer") return "Return Customer";
  if (k === "custom") return "Custom";
  if (k === "all") return "All";
  return k;
}
function prettyStatus(s: string) {
  if (s === "pending_approval") return "PENDING";
  if (s === "approved") return "APPROVED";
  if (s === "rejected") return "REJECTED";
  if (s === "draft") return "DRAFT";
  if (s === "all") return "ALL";
  return String(s || "").toUpperCase();
}
function tplKindBg(k: string) {
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

const styles = StyleSheet.create({
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: { flexGrow: 1, minWidth: 120, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  statIc: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary, marginTop: 8 },
  statLbl: { fontSize: 11, color: colors.textSecondary, fontWeight: font.semi, marginTop: 2 },

  secTitle: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4, marginTop: spacing.xl, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  label: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: 6, letterSpacing: 0.3 },
  hint: { fontSize: 11.5, color: colors.textSecondary, marginTop: 4 },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: colors.textPrimary },

  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },

  warnBox: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  warnTxt: { flex: 1, fontSize: 12, color: colors.warning, fontWeight: font.semi, lineHeight: 17 },
  err: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.sm },
  okBox: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.successSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  okTxt: { color: colors.success, fontSize: 13, fontWeight: font.semi },

  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: radius.lg, height: 52, marginTop: spacing.lg, ...shadow.lifted },
  saveTxt: { fontSize: 16, fontWeight: font.black, color: colors.onPrimary },

  emptyBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  emptyTxt: { flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: font.semi },

  wCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  wTitle: { fontSize: 14.5, fontWeight: font.black, color: colors.textPrimary },
  wSub: { fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
  wStat: { fontSize: 11, color: colors.textSecondary },
  wStatV: { color: colors.textPrimary, fontWeight: font.bold },
  wBal: { fontSize: 17, fontWeight: font.black, color: colors.primary },
  creditBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 5 },
  creditTxt: { fontSize: 12, fontWeight: font.black, color: colors.primary },

  campCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  campMsg: { flex: 1, fontSize: 14, fontWeight: font.semi, color: colors.textPrimary, marginRight: 8 },
  campCost: { fontSize: 14, fontWeight: font.black, color: colors.primary },
  campMeta: { fontSize: 11.5, color: colors.textSecondary, marginTop: 6 },

  mBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: spacing.lg },
  mCard: { width: "100%", maxWidth: 460, backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.lifted },
  mTitle: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  mHint: { fontSize: 12, color: colors.textSecondary, marginTop: 6, marginBottom: spacing.md },

  // Template library ---------------------------------------------------------
  tplNewBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 6 },
  tplNewTxt: { fontSize: 12, fontWeight: font.black, color: colors.primary },

  tplFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.sm },
  tplFilterChip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6 },
  tplFilterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tplFilterTxt: { fontSize: 12, fontWeight: font.bold, color: colors.textPrimary, letterSpacing: 0.3 },

  tplRow: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  tplTag: { borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  tplTagTxt: { fontSize: 9, fontWeight: font.black, letterSpacing: 0.4, color: colors.textPrimary },
  tplName: { flex: 1, fontSize: 13.5, fontWeight: font.black, color: colors.textPrimary },
  tplBody: { fontSize: 12.5, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  tplMeta: { fontSize: 10.5, color: colors.textSecondary, fontWeight: font.semi, marginLeft: 4 },
  tplActionBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  tplActionTxt: { fontSize: 11.5, fontWeight: font.black, color: colors.onPrimary },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  statusTxt: { fontSize: 9.5, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4 },
  platformTag: { borderRadius: radius.pill, backgroundColor: colors.successSoft, paddingHorizontal: 5, paddingVertical: 1 },
  platformTagTxt: { fontSize: 8.5, fontWeight: font.black, color: colors.success, letterSpacing: 0.3 },
  rejectReason: { fontSize: 11.5, color: colors.error, fontWeight: font.semi, marginTop: 6 },
});
