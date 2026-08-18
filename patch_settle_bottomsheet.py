#!/usr/bin/env python3
import shutil, sys

PATH = "frontend/src/components/TableOrderModal.tsx"

OLD = '''        <Modal visible={settleOpen} transparent animationType="fade" onRequestClose={() => setSettleOpen(false)}>
          <View style={styles.popBackdrop}>
            <View style={styles.popCard}>
              <View style={styles.popHead}>
                <Text style={styles.popTitle}>Settle Bill</Text>
                <TouchableOpacity testID="settle-close" onPress={() => setSettleOpen(false)} hitSlop={10}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
              </View>
              <View style={{ padding: spacing.lg }}>
                <View style={styles.popTotalBox}>
                  <Text style={styles.popTotalLabel}>Total payable</Text>
                  <Text style={styles.popTotal}>{inr(grandTotal)}</Text>
                </View>

                <View style={{ flexDirection: "row", marginBottom: spacing.md, flexWrap: "wrap" }}>
                  {[
                    { key: "cash", label: "Cash", icon: "cash-outline" },
                    { key: "card", label: "Card", icon: "card-outline" },
                    { key: "due", label: "Due", icon: "time-outline" },
                    { key: "other", label: "Other", icon: "swap-horizontal-outline" },
                  ].map((m) => (
                    <TouchableOpacity
                      key={m.key}
                      testID={`settle-method-${m.key}`}
                      onPress={() => setSettleMethod(m.key as any)}
                      style={{
                        flexGrow: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 8,
                        marginHorizontal: 2,
                        marginBottom: 4,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: settleMethod === (m.key as any) ? colors.primary : colors.border,
                        backgroundColor: settleMethod === (m.key as any) ? "#e8f5ec" : "transparent",
                      }}
                    >
                      <Ionicons name={m.icon as any} size={15} color={settleMethod === (m.key as any) ? colors.primary : colors.textSecondary} style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 12, fontWeight: "600", color: settleMethod === (m.key as any) ? colors.primary : colors.textSecondary }}>{m.label}</Text>
                      {settleMethod === (m.key as any) ? <Ionicons name="checkmark-circle" size={13} color={colors.primary} style={{ marginLeft: 4 }} /> : null}
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity testID="settle-split-toggle" onPress={() => setSplitMode((v) => !v)} style={{ paddingVertical: 8, paddingHorizontal: 8, justifyContent: "center" }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>{splitMode ? "Single ▲" : "Split ▼"}</Text>
                  </TouchableOpacity>
                </View>

                {splitMode ? (
                  <>
                    <Text style={styles.payLabel}>Cash</Text>
                    <TextInput testID="settle-cash" value={payCash} onChangeText={(t) => setPayCash(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="₹ 0" placeholderTextColor={colors.textMuted} style={styles.input} />
                    <Text style={styles.payLabel}>Online / UPI</Text>
                    <TextInput testID="settle-upi" value={payUpi} onChangeText={(t) => setPayUpi(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="₹ 0" placeholderTextColor={colors.textMuted} style={styles.input} />
                    <Text style={styles.payLabel}>Card</Text>
                    <TextInput testID="settle-card" value={payCard} onChangeText={(t) => setPayCard(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="₹ 0" placeholderTextColor={colors.textMuted} style={styles.input} />
                  </>
                ) : (
                  <>
                    <Text style={styles.payLabel}>Settlement Amount</Text>
                    <TextInput testID="settle-amount" value={settleAmount} onChangeText={(t) => setSettleAmount(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="₹ 0" placeholderTextColor={colors.textMuted} style={styles.input} />
                  </>
                )}

                <TouchableOpacity
                  testID="settle-its-paid"
                  onPress={() => {
                    const next = !itsPaid;
                    setItsPaid(next);
                    if (next && !splitMode) setSettleAmount(String(Math.round(grandTotal)));
                  }}
                  style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm, marginBottom: spacing.md }}
                >
                  <Ionicons name={itsPaid ? "checkbox" : "square-outline"} size={18} color={itsPaid ? colors.primary : colors.textSecondary} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 13, color: colors.textPrimary }}>It's Paid</Text>
                </TouchableOpacity>

                <View style={styles.popSummary}>
                  <View style={styles.billRow}><Text style={styles.billLabel}>Collected</Text><Text style={styles.billVal}>{inr(collected)}</Text></View>
                  {balance > 0 ? (
                    <View style={styles.billRow}><Text style={[styles.billLabel, { color: colors.warning }]}>Balance → auto discount</Text><Text style={[styles.billVal, { color: colors.warning }]}>-{inr(balance)}</Text></View>
                  ) : null}
                  {change > 0 ? (
                    <View style={styles.billRow}><Text style={styles.billLabel}>Change to return</Text><Text style={styles.billVal}>{inr(change)}</Text></View>
                  ) : null}
                  <View style={styles.billDivider} />
                  <View style={styles.billRow}><Text style={styles.billTotalLabel}>Settling at</Text><Text style={styles.billTotal}>{inr(Math.min(grandTotal, collected))}</Text></View>
                </View>

                <TouchableOpacity testID="settle-quick-cash" onPress={() => { setPayCash(String(Math.round(grandTotal))); setPayUpi(""); setPayCard(""); }} style={styles.quickBtn} activeOpacity={0.85}>
                  <Ionicons name="cash" size={15} color={colors.primary} />
                  <Text style={styles.quickTxt}>Full cash</Text>
                </TouchableOpacity>

                <TouchableOpacity testID="settle-confirm" onPress={confirmSettle} disabled={busy === "settle"} style={[styles.confirmBtn, busy === "settle" && { opacity: 0.6 }]} activeOpacity={0.85}>
                  {busy === "settle" ? <ActivityIndicator color={colors.onPrimary} /> : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color={colors.onPrimary} />
                      <Text style={styles.confirmTxt}>Settle & Save</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: spacing.md, gap: 8 }}>
                  <TouchableOpacity
                    testID="settle-row-save"
                    onPress={onSave}
                    disabled={busy !== ""}
                    style={{ flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textPrimary }}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="settle-row-save-print"
                    onPress={async () => { await confirmSettle(); if (Platform.OS === "web") window.print(); }}
                    disabled={busy !== ""}
                    style={{ flexGrow: 1, backgroundColor: colors.dark, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>Save & Print</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="settle-row-save-ebill"
                    onPress={onEbill}
                    disabled={busy !== ""}
                    style={{ flexGrow: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>Save & eBill</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="settle-row-cancel"
                    onPress={() => setSettleOpen(false)}
                    style={{ flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textPrimary }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>'''

NEW = '''        <Modal visible={settleOpen} transparent animationType="slide" onRequestClose={() => setSettleOpen(false)}>
          <View style={styles.sheetBackdrop}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSettleOpen(false)} />
            <View style={styles.sheetPanel}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetTopRow}>
                <TouchableOpacity testID="settle-split-toggle" onPress={() => setSplitMode((v) => !v)} style={styles.splitPill}>
                  <Text style={styles.splitPillTxt}>{splitMode ? "Single" : "Split"}</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <Text style={styles.sheetTotalLabel}>Total</Text>
                <Text style={styles.sheetTotalVal}>{inr(grandTotal)}</Text>
              </View>

              <View style={styles.sheetTabsRow}>
                {[
                  { key: "cash", label: "Cash", icon: "cash-outline" },
                  { key: "card", label: "Card", icon: "card-outline" },
                  { key: "due", label: "Due", icon: "time-outline" },
                  { key: "other", label: "Other", icon: "swap-horizontal-outline" },
                ].map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    testID={`settle-method-${m.key}`}
                    onPress={() => setSettleMethod(m.key as any)}
                    style={[styles.sheetTab, settleMethod === (m.key as any) ? styles.sheetTabOn : null]}
                  >
                    <Ionicons name={m.icon as any} size={15} color={settleMethod === (m.key as any) ? colors.primary : colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={[styles.sheetTabTxt, settleMethod === (m.key as any) ? styles.sheetTabTxtOn : null]}>{m.label}</Text>
                    {settleMethod === (m.key as any) ? <Ionicons name="checkmark-circle" size={13} color={colors.primary} style={{ marginLeft: 4 }} /> : null}
                  </TouchableOpacity>
                ))}
              </View>

              {splitMode ? (
                <>
                  <Text style={styles.payLabel}>Cash</Text>
                  <TextInput testID="settle-cash" value={payCash} onChangeText={(t) => setPayCash(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="₹ 0" placeholderTextColor={colors.textMuted} style={styles.input} />
                  <Text style={styles.payLabel}>Online / UPI</Text>
                  <TextInput testID="settle-upi" value={payUpi} onChangeText={(t) => setPayUpi(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="₹ 0" placeholderTextColor={colors.textMuted} style={styles.input} />
                  <Text style={styles.payLabel}>Card</Text>
                  <TextInput testID="settle-card" value={payCard} onChangeText={(t) => setPayCard(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="₹ 0" placeholderTextColor={colors.textMuted} style={styles.input} />
                </>
              ) : (
                <>
                  <Text style={styles.payLabel}>Settlement Amount</Text>
                  <TextInput testID="settle-amount" value={settleAmount} onChangeText={(t) => setSettleAmount(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="₹ 0" placeholderTextColor={colors.textMuted} style={styles.input} />
                </>
              )}

              <TouchableOpacity
                testID="settle-its-paid"
                onPress={() => {
                  const next = !itsPaid;
                  setItsPaid(next);
                  if (next && !splitMode) setSettleAmount(String(Math.round(grandTotal)));
                }}
                style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm, marginBottom: spacing.sm }}
              >
                <Ionicons name={itsPaid ? "checkbox" : "square-outline"} size={18} color={itsPaid ? colors.primary : colors.textSecondary} style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 13, color: colors.textPrimary }}>It's Paid</Text>
              </TouchableOpacity>

              {(balance > 0 || change > 0) ? (
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
                <ActionBtn testID="settle-row-save" icon="save-outline" label="Save" onPress={onSave} loading={busy === "save"} variant="ghost" disabled={busy !== ""} />
                <ActionBtn testID="settle-row-save-print" icon="print-outline" label="Save & Print" onPress={async () => { await confirmSettle(); if (Platform.OS === "web") window.print(); }} loading={busy === "settle"} variant="dark" disabled={busy !== ""} />
                <ActionBtn testID="settle-row-save-ebill" icon="logo-whatsapp" label="Save & eBill" onPress={onEbill} loading={busy === "ebill"} variant="primary" disabled={busy !== ""} />
                <ActionBtn testID="settle-row-cancel" icon="close" label="Cancel" onPress={() => setSettleOpen(false)} variant="ghost" />
              </View>
            </View>
          </View>
        </Modal>'''

STYLE_OLD = '''  quickTxt: { fontSize: 13, fontWeight: font.bold, color: colors.primary },'''
STYLE_NEW = '''  quickTxt: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end" },
  sheetPanel: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingTop: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, ...shadow.lifted },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  sheetTopRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  splitPill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  splitPillTxt: { fontSize: 12, fontWeight: font.bold, color: colors.primary },
  sheetTotalLabel: { fontSize: 12, color: colors.textSecondary, marginRight: 6 },
  sheetTotalVal: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  sheetTabsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.md },
  sheetTab: { flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, marginHorizontal: 2, marginBottom: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent" },
  sheetTabOn: { borderColor: colors.primary, backgroundColor: "#e8f5ec" },
  sheetTabTxt: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  sheetTabTxtOn: { color: colors.primary },
  sheetSummary: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  sheetBtnRow: { flexDirection: "row", gap: 8, marginTop: spacing.sm },'''

with open(PATH, "r", encoding="utf-8") as f:
    src = f.read()

n1 = src.count(OLD)
n2 = src.count(STYLE_OLD)
if n1 != 1:
    print(f"[ABORT] JSX block: expected 1 match, found {n1}")
    sys.exit(1)
if n2 != 1:
    print(f"[ABORT] style anchor: expected 1 match, found {n2}")
    sys.exit(1)

shutil.copy(PATH, PATH + ".before_bottomsheet")
src = src.replace(OLD, NEW, 1)
src = src.replace(STYLE_OLD, STYLE_NEW, 1)
with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)
print(f"[OK] Patched {PATH}. Backup at {PATH}.before_bottomsheet")
