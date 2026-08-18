import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Alert, TextInput, Modal, Switch, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { Card, Empty, Pill, Rating, Button } from "@/src/components/ui";
import { AdminHeader } from "@/src/components/AdminHeader";
import { MenuReviewModal } from "@/src/components/MenuReviewModal";
import { confirmDialog, notify } from "@/src/utils/confirm";
import { TimeInput, time12To24, time24To12, isValidTime12 } from "@/src/components/form";

type Hour = { day: string; open: string; close: string; closed: boolean };
const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" }, { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" }, { key: "fri", label: "Fri" }, { key: "sat", label: "Sat" }, { key: "sun", label: "Sun" },
];

const defaultHours = (): Hour[] => DAYS.map(d => ({ day: d.key, open: "09:00 AM", close: "11:00 PM", closed: false }));

type FilterKey = "all" | "active" | "inactive";
const FILTER_DEFS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
];

export default function AdminRestaurants() {
  const [rests, setRests] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [formModal, setFormModal] = useState<{ open: boolean; editing?: any | null }>({ open: false });
  const [offerModal, setOfferModal] = useState<{ open: boolean; r?: any }>({ open: false });
  const [offerText, setOfferText] = useState("");
  const [menuReview, setMenuReview] = useState<{ open: boolean; r?: any }>({ open: false });
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const [r, ow, pc] = await Promise.all([
        Api.adminRests() as Promise<any[]>,
        Api.adminOwners().catch(() => [] as any[]) as Promise<any[]>,
        Api.adminMenuPendingCounts().catch(() => ({})) as Promise<Record<string, number>>,
      ]);
      setRests(r);
      setOwners(ow || []);
      setPendingCounts(pc || {});
    } catch (e: any) {
      notify("Error", e.message || "Failed to load restaurants");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const ownerNameFor = (ownerId?: string | null) => {
    if (!ownerId) return null;
    const u = owners.find((o) => o.id === ownerId);
    return u ? (u.name || u.phone || "Owner") : null;
  };

  const activatePlaceholder = async (r: any) => {
    const ok = await confirmDialog(
      "Activate Restaurant?",
      `Mark "${r.name}" as Active. It will be visible to customers and the owner can start managing the menu.`,
      "Activate",
    );
    if (ok) await patch(r.id, { status: "active", is_active: true });
  };

  useEffect(() => { load(); }, [load]);

  const patch = async (rid: string, body: any) => {
    setBusy(rid);
    try {
      await Api.adminUpdateRest(rid, body);
      await load();
    } catch (e: any) {
      notify("Error", e.message);
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async (r: any) => {
    const ok = await confirmDialog("Delete Restaurant?", `This will permanently delete "${r.name}". This cannot be undone.`, "Delete", true);
    if (!ok) return;
    setBusy(r.id);
    try { await Api.adminDeleteRest(r.id); await load(); }
    catch (e: any) { notify("Error", e.message); }
    finally { setBusy(null); }
  };

  const counts = {
    all: rests.length,
    active: rests.filter((r) => r.is_active !== false).length,
    inactive: rests.filter((r) => r.is_active === false).length,
  };

  const filtered = rests
    .filter((r) => {
      if (filter === "all") return true;
      if (filter === "active") return r.is_active !== false;
      if (filter === "inactive") return r.is_active === false;
      return true;
    })
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const oname = (ownerNameFor(r.owner_id) || "").toLowerCase();
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.address || "").toLowerCase().includes(q) ||
        (r.city || "").toLowerCase().includes(q) ||
        (r.account_id || "").toLowerCase().includes(q) ||
        oname.includes(q)
      );
    });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader
        title="Restaurants"
        subtitle={`${filtered.length} of ${rests.length} restaurants`}
        right={
          <TouchableOpacity testID="admin-new-restaurant-btn" style={styles.newBtn} onPress={() => setFormModal({ open: true, editing: null })} activeOpacity={0.85}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: font.bold, fontSize: 13 }}>New</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, address, city, account ID or owner"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {FILTER_DEFS.map((f) => (
          <Pill
            key={f.key}
            label={`${f.label} (${counts[f.key] ?? 0})`}
            active={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <Empty icon="restaurant" title="No restaurants" subtitle="Tap “New” to create one" />
        ) : (
          filtered.map((r) => (
            <Card key={r.id} style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={styles.avatar}><Ionicons name="restaurant" size={22} color="#fff" /></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 15, fontWeight: font.bold, color: colors.textPrimary, flex: 1 }} numberOfLines={1}>{r.name}</Text>
                    <Rating value={r.rating || 0} />
                  </View>
                  {r.account_id ? (
                    <View style={styles.acctChip} testID={`rest-acct-${r.id}`}>
                      <Ionicons name="id-card" size={11} color={colors.textSecondary} />
                      <Text style={styles.acctChipText} selectable>{r.account_id}</Text>
                    </View>
                  ) : null}
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                    {(r.cuisines || []).join(", ") || "No cuisines"}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>📍 {r.address || "—"}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    <View style={[styles.statusTag, { backgroundColor: (r.status === "suspended") ? colors.errorSoft : colors.successSoft }]}>
                      <Text style={{ color: (r.status === "suspended") ? colors.error : colors.success, fontSize: 10, fontWeight: font.black, textTransform: "uppercase" }}>
                        {r.status || "active"}
                      </Text>
                    </View>
                    {r.is_promoted && (
                      <View style={[styles.statusTag, { backgroundColor: colors.warningSoft }]}>
                        <Text style={{ color: colors.warning, fontSize: 10, fontWeight: font.black }}>PROMOTED</Text>
                      </View>
                    )}
                    <View style={[styles.statusTag, { backgroundColor: r.pos_enabled === false ? colors.surfaceAlt : colors.primarySoft }]}>
                      <Text style={{ color: r.pos_enabled === false ? colors.textMuted : colors.primary, fontSize: 10, fontWeight: font.black }}>
                        {r.pos_enabled === false ? "POS OFF" : "POS ON"}
                      </Text>
                    </View>
                    {r.owner_id ? (
                      <View style={[styles.statusTag, { backgroundColor: colors.surfaceAlt }]}>
                        <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: font.black }} numberOfLines={1}>
                          OWNER: {(ownerNameFor(r.owner_id) || "—").toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {r.offer_text ? (
                    <Text style={{ marginTop: 6, fontSize: 11, color: colors.primary, fontWeight: font.bold }}>🏷 {r.offer_text}</Text>
                  ) : null}
                </View>
              </View>

              <TouchableOpacity testID={`review-menu-btn-${r.id}`} onPress={() => setMenuReview({ open: true, r })} style={styles.reviewMenuBtn} activeOpacity={0.85}>
                <Ionicons name="fast-food-outline" size={16} color={colors.primary} />
                <Text style={styles.reviewMenuText}>Review Menu</Text>
                {(pendingCounts[r.id] || 0) > 0 ? (
                  <View style={styles.pendBadge}><Text style={styles.pendBadgeText}>{pendingCounts[r.id]} pending</Text></View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: "auto" }} />
              </TouchableOpacity>

              <View style={styles.actionsRow}>
                <ActionBtn icon="create" label="Edit" color={colors.primary} onPress={() => setFormModal({ open: true, editing: r })} disabled={busy === r.id} />
                <ActionBtn
                  icon={r.status === "suspended" ? "play" : "pause"}
                  label={r.status === "suspended" ? "Activate" : "Suspend"}
                  color={r.status === "suspended" ? colors.success : colors.error}
                  onPress={() => patch(r.id, { status: r.status === "suspended" ? "active" : "suspended" })}
                  disabled={busy === r.id}
                />
                <ActionBtn icon="star" label={r.is_promoted ? "Unpromote" : "Promote"} color={colors.warning} onPress={() => patch(r.id, { is_promoted: !r.is_promoted })} disabled={busy === r.id} />
              </View>
              <View style={[styles.actionsRow, { borderTopWidth: 0, paddingTop: 0, marginTop: 8 }]}>
                <ActionBtn icon="pricetag" label="Offer" color={colors.primary} onPress={() => { setOfferText(r.offer_text || ""); setOfferModal({ open: true, r }); }} disabled={busy === r.id} />
                <ActionBtn
                  icon="hardware-chip"
                  label={r.pos_enabled === false ? "POS: Off" : "POS: On"}
                  color={r.pos_enabled === false ? colors.textMuted : colors.success}
                  onPress={() => patch(r.id, { pos_enabled: r.pos_enabled === false })}
                  disabled={busy === r.id}
                />
                <ActionBtn icon="trash" label="Delete" color={colors.error} onPress={() => onDelete(r)} disabled={busy === r.id} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      <RestaurantFormModal
        visible={formModal.open}
        editing={formModal.editing}
        onClose={() => setFormModal({ open: false })}
        onDone={() => { setFormModal({ open: false }); load(); }}
      />

      <MenuReviewModal
        visible={menuReview.open}
        restaurant={menuReview.r ? { id: menuReview.r.id, name: menuReview.r.name } : null}
        onClose={() => setMenuReview({ open: false })}
        onChanged={load}
      />

      {/* Offer modal */}
      <Modal visible={offerModal.open} transparent animationType="fade" onRequestClose={() => setOfferModal({ open: false })}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.mTitle}>Set Offer Text</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: spacing.md }}>{offerModal.r?.name}</Text>
            <TextInput value={offerText} onChangeText={setOfferText} placeholder="e.g. 50% off up to ₹100" placeholderTextColor={colors.textMuted} style={styles.input} />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}><Button title="Cancel" variant="ghost" onPress={() => setOfferModal({ open: false })} full /></View>
              <View style={{ flex: 1 }}>
                <Button title="Save" icon="checkmark" onPress={async () => {
                  if (offerModal.r) await patch(offerModal.r.id, { offer_text: offerText.trim() || null });
                  setOfferModal({ open: false });
                }} full />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ActionBtn({ icon, label, color, onPress, disabled }: { icon: any; label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[styles.actionBtn, { borderColor: color, opacity: disabled ? 0.5 : 1 }]} onPress={onPress} disabled={disabled} activeOpacity={0.85}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: font.bold }}>{label}</Text>
    </TouchableOpacity>
  );
}

function RestaurantFormModal({ visible, editing, onClose, onDone }: { visible: boolean; editing?: any | null; onClose: () => void; onDone: () => void }) {
  const isEdit = !!editing;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [cuisines, setCuisines] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("30");
  const [priceForTwo, setPriceForTwo] = useState("400");
  const [deliveryRadius, setDeliveryRadius] = useState("5");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Bengaluru");
  const [pincode, setPincode] = useState("");
  const [lat, setLat] = useState("0");
  const [lng, setLng] = useState("0");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [fssai, setFssai] = useState("");
  const [gst, setGst] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAcc, setBankAcc] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  // Admin-managed account contacts
  const [kapName, setKapName] = useState("");
  const [kapPhone, setKapPhone] = useState("");
  const [kapEmail, setKapEmail] = useState("");
  const [kapNotes, setKapNotes] = useState("");
  const [mgrName, setMgrName] = useState("");
  const [mgrPhone, setMgrPhone] = useState("");
  const [mgrEmail, setMgrEmail] = useState("");
  const [mgrNotes, setMgrNotes] = useState("");
  const [hours, setHours] = useState<Hour[]>(defaultHours());
  const [isPromoted, setIsPromoted] = useState(false);
  const [offerTextField, setOfferTextField] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [posEnabled, setPosEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name || "");
      setDescription(editing.description || "");
      setImage(editing.image || "");
      setCuisines((editing.cuisines || []).join(", "));
      setDeliveryTime(String(editing.delivery_time ?? 30));
      setPriceForTwo(String(editing.price_for_two ?? 400));
      setDeliveryRadius(String(editing.delivery_radius_km ?? 5));
      setAddress(editing.address || "");
      setCity(editing.city || "Bengaluru");
      setPincode(editing.pincode || "");
      setLat(String(editing.lat ?? 0));
      setLng(String(editing.lng ?? 0));
      setContactPhone(editing.contact_phone || "");
      setContactEmail(editing.contact_email || "");
      setFssai(editing.fssai_license || "");
      setGst(editing.gst_number || "");
      setBankName(editing.bank_account_name || "");
      setBankAcc(editing.bank_account_number || "");
      setBankIfsc(editing.bank_ifsc || "");
      // KAP + Manager (admin-managed)
      const kap = editing.key_account_person || {};
      setKapName(kap.name || ""); setKapPhone(kap.phone || ""); setKapEmail(kap.email || ""); setKapNotes(kap.notes || "");
      const mgr = editing.manager || {};
      setMgrName(mgr.name || ""); setMgrPhone(mgr.phone || ""); setMgrEmail(mgr.email || ""); setMgrNotes(mgr.notes || "");
      const ohRaw = (editing.operating_hours && editing.operating_hours.length === 7) ? editing.operating_hours : defaultHours();
      // Server stores 24-hour; UI edits in 12-hour with AM/PM.
      const oh: Hour[] = ohRaw.map((h: Hour) => ({
        day: h.day,
        open: /AM|PM/i.test(h.open || "") ? h.open : (time24To12(h.open || "") || "09:00 AM"),
        close: /AM|PM/i.test(h.close || "") ? h.close : (time24To12(h.close || "") || "11:00 PM"),
        closed: !!h.closed,
      }));
      setHours(oh);
      setIsPromoted(!!editing.is_promoted);
      setOfferTextField(editing.offer_text || "");
      setIsActive(editing.is_active !== false);
      setPosEnabled(editing.pos_enabled !== false);
    } else {
      setName(""); setDescription(""); setImage(""); setCuisines("");
      setDeliveryTime("30"); setPriceForTwo("400"); setDeliveryRadius("5");
      setAddress(""); setCity("Bengaluru"); setPincode("");
      setLat("0"); setLng("0");
      setContactPhone(""); setContactEmail(""); setFssai(""); setGst("");
      setBankName(""); setBankAcc(""); setBankIfsc("");
      setKapName(""); setKapPhone(""); setKapEmail(""); setKapNotes("");
      setMgrName(""); setMgrPhone(""); setMgrEmail(""); setMgrNotes("");
      setHours(defaultHours()); setIsPromoted(false); setOfferTextField(""); setIsActive(true); setPosEnabled(true);
    }
  }, [visible, editing]);

  const setHourField = (idx: number, patchObj: Partial<Hour>) => {
    setHours(prev => prev.map((h, i) => i === idx ? { ...h, ...patchObj } : h));
  };

  const submit = async () => {
    if (!name.trim()) return notify("Required", "Restaurant name is required");
    if (!address.trim()) return notify("Required", "Address is required");
    const body: any = {
      name: name.trim(),
      description: description.trim() || null,
      image: image.trim(),
      cuisines: cuisines.split(",").map(s => s.trim()).filter(Boolean),
      delivery_time: parseInt(deliveryTime) || 30,
      price_for_two: parseInt(priceForTwo) || 400,
      delivery_radius_km: parseFloat(deliveryRadius) || 5,
      address: address.trim(),
      city: city.trim() || "Bengaluru",
      pincode: pincode.trim() || null,
      lat: parseFloat(lat) || 0,
      lng: parseFloat(lng) || 0,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
      fssai_license: fssai.trim() || null,
      gst_number: gst.trim() || null,
      bank_account_name: bankName.trim() || null,
      bank_account_number: bankAcc.trim() || null,
      bank_ifsc: bankIfsc.trim() || null,
      // Admin-managed contact roles
      key_account_person: {
        name: kapName.trim() || null,
        phone: kapPhone.trim() || null,
        email: kapEmail.trim() || null,
        notes: kapNotes.trim() || null,
      },
      manager: {
        name: mgrName.trim() || null,
        phone: mgrPhone.trim() || null,
        email: mgrEmail.trim() || null,
        notes: mgrNotes.trim() || null,
      },
      // Convert UI's 12-hour "hh:mm AM/PM" back to 24-hour "HH:MM" for storage.
      operating_hours: hours.map((h) => ({
        day: h.day,
        open: !h.closed && isValidTime12(h.open) ? time12To24(h.open) : h.open,
        close: !h.closed && isValidTime12(h.close) ? time12To24(h.close) : h.close,
        closed: h.closed,
      })),
      is_promoted: isPromoted,
      offer_text: offerTextField.trim() || null,
      pos_enabled: posEnabled,
    };
    if (isEdit) {
      body.is_active = isActive;
    }
    setSaving(true);
    try {
      if (isEdit) await Api.adminUpdateRest(editing.id, body);
      else await Api.adminCreateRest(body);
      onDone();
    } catch (e: any) {
      notify("Error", e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <View style={styles.mHead}>
          <Text style={styles.mTitleLg}>{isEdit ? "Edit Restaurant" : "New Restaurant"}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            <Section title="Basics" icon="information-circle" />
            <Field label="Name *" value={name} onChange={setName} placeholder="e.g. Spice Junction" />
            <Field label="Description" value={description} onChange={setDescription} placeholder="Short tagline" multiline />
            <Field label="Image URL" value={image} onChange={setImage} placeholder="https://..." />
            <Field label="Cuisines (comma separated)" value={cuisines} onChange={setCuisines} placeholder="North Indian, Chinese" />

            <Section title="Pricing & Delivery" icon="bicycle" />
            <Row>
              <Field flex label="Delivery time (min)" value={deliveryTime} onChange={setDeliveryTime} keyboardType="numeric" />
              <Field flex label="Price for two (₹)" value={priceForTwo} onChange={setPriceForTwo} keyboardType="numeric" />
            </Row>
            <Field label="Delivery radius (km)" value={deliveryRadius} onChange={setDeliveryRadius} keyboardType="numeric" />

            <Section title="Location" icon="location" />
            <Field label="Address *" value={address} onChange={setAddress} placeholder="Street, Area" multiline />
            <Row>
              <Field flex label="City" value={city} onChange={setCity} />
              <Field flex label="Pincode" value={pincode} onChange={setPincode} keyboardType="numeric" />
            </Row>
            <Row>
              <Field flex label="Latitude" value={lat} onChange={setLat} keyboardType="numeric" />
              <Field flex label="Longitude" value={lng} onChange={setLng} keyboardType="numeric" />
            </Row>

            <Section title="Contact" icon="call" />
            <Field label="Contact phone" value={contactPhone} onChange={setContactPhone} keyboardType="phone-pad" />
            <Field label="Contact email" value={contactEmail} onChange={setContactEmail} keyboardType="email-address" />

            <Section title="Key Account Person" icon="ribbon" />
            <Text style={styles.formHelp}>Admin-managed. This is the internal person you (the ops/success team) speak to for anything about this restaurant. Owners cannot see or edit it.</Text>
            <Field label="Name" value={kapName} onChange={setKapName} placeholder="e.g. Priya Sharma" />
            <Row>
              <Field flex label="Phone" value={kapPhone} onChange={setKapPhone} keyboardType="phone-pad" placeholder="+91…" />
              <Field flex label="Email" value={kapEmail} onChange={setKapEmail} keyboardType="email-address" placeholder="priya@brand.com" />
            </Row>
            <Field label="Notes" value={kapNotes} onChange={setKapNotes} placeholder="Best time to reach, WhatsApp handle, escalation path…" multiline />

            <Section title="Restaurant Manager" icon="briefcase" />
            <Text style={styles.formHelp}>On-ground manager at the outlet. Also admin-managed; the owner sees this as read-only info.</Text>
            <Field label="Name" value={mgrName} onChange={setMgrName} placeholder="e.g. Amit Kumar" />
            <Row>
              <Field flex label="Phone" value={mgrPhone} onChange={setMgrPhone} keyboardType="phone-pad" placeholder="+91…" />
              <Field flex label="Email" value={mgrEmail} onChange={setMgrEmail} keyboardType="email-address" placeholder="amit@outlet.com" />
            </Row>
            <Field label="Notes" value={mgrNotes} onChange={setMgrNotes} placeholder="Shifts, day-off, alt contact…" multiline />

            <Section title="Documents" icon="document-text" />
            <Field label="FSSAI License" value={fssai} onChange={setFssai} placeholder="14-digit number" />
            <Field label="GST Number" value={gst} onChange={setGst} placeholder="22AAAAA0000A1Z5" />

            <Section title="Bank Details" icon="card" />
            <Field label="Account holder name" value={bankName} onChange={setBankName} />
            <Row>
              <Field flex label="Account number" value={bankAcc} onChange={setBankAcc} keyboardType="numeric" />
              <Field flex label="IFSC code" value={bankIfsc} onChange={setBankIfsc} autoCap="characters" />
            </Row>

            <Section title="Operating Hours" icon="time" />
            {DAYS.map((d, i) => (
              <View key={d.key} style={styles.hourRow}>
                <Text style={styles.hourDay}>{d.label}</Text>
                <View style={{ flex: 1, opacity: hours[i].closed ? 0.4 : 1 }}>
                  {!hours[i].closed ? (
                    <>
                      <TimeInput
                        testID={`admin-hour-open-${d.key}`}
                        value={hours[i].open}
                        onChangeText={(v) => setHourField(i, { open: v })}
                      />
                      <TimeInput
                        testID={`admin-hour-close-${d.key}`}
                        value={hours[i].close}
                        onChangeText={(v) => setHourField(i, { close: v })}
                      />
                    </>
                  ) : (
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: "italic", paddingVertical: 8 }}>
                      Closed all day
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>Closed</Text>
                  <Switch value={hours[i].closed} onValueChange={(v) => setHourField(i, { closed: v })} />
                </View>
              </View>
            ))}

            <Section title="Status & Promotion" icon="megaphone" />
            <View style={styles.toggleRow}>
              <Text style={styles.lbl}>Promoted (featured)</Text>
              <Switch value={isPromoted} onValueChange={setIsPromoted} />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lbl}>POS &amp; Dine-in enabled</Text>
                <Text style={styles.posHint}>Owner consent to use the Bisnoi POS / dine-in system</Text>
              </View>
              <Switch value={posEnabled} onValueChange={setPosEnabled} />
            </View>
            <Field label="Offer text" value={offerTextField} onChange={setOfferTextField} placeholder="e.g. 50% off up to ₹100" />
            {isEdit && (
              <View style={styles.toggleRow}>
                <Text style={styles.lbl}>Active</Text>
                <Switch value={isActive} onValueChange={setIsActive} />
              </View>
            )}

            <View style={{ height: spacing.lg }} />
            <Button title={isEdit ? "Save Changes" : "Create Restaurant"} icon="checkmark" onPress={submit} loading={saving} full />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Section({ title, icon }: { title: string; icon: any }) {
  return (
    <View style={styles.section}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function Row({ children }: { children: any }) {
  return <View style={{ flexDirection: "row", gap: spacing.sm }}>{children}</View>;
}

function Field({
  label, value, onChange, placeholder, keyboardType, multiline, flex, autoCap,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  keyboardType?: any; multiline?: boolean; flex?: boolean; autoCap?: any;
}) {
  return (
    <View style={[{ marginBottom: spacing.sm }, flex && { flex: 1 }]}>
      <Text style={styles.lbl}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { minHeight: 60, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCap || "sentences"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  titleBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 8, alignItems: "center" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  avatar: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  statusTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  acctChip: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4,
    marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  acctChipText: { fontSize: 10, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6, fontVariant: ["tabular-nums"] } as any,
  formHelp: { fontSize: 11, color: colors.textMuted, marginBottom: 8, lineHeight: 15 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  reviewMenuBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  reviewMenuText: { fontSize: 14, fontWeight: font.bold, color: colors.primary },
  pendBadge: { backgroundColor: colors.warningSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pendBadgeText: { fontSize: 10, fontWeight: font.black, color: colors.warning },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1.5 },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  mTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary, marginBottom: 4 },
  mTitleLg: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary },
  mHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: 14, color: colors.textPrimary },
  lbl: { fontSize: 12, color: colors.textSecondary, marginBottom: 4, fontWeight: font.bold },
  section: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, marginBottom: spacing.sm, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 14, fontWeight: font.black, color: colors.textPrimary, textTransform: "uppercase", letterSpacing: 0.5 },
  hourRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  hourDay: { width: 42, fontSize: 13, fontWeight: font.bold, color: colors.textPrimary, marginTop: 12 },
  hourInput: { flex: 1, paddingVertical: 8, fontSize: 13, textAlign: "center" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  posHint: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: font.semi, maxWidth: 260 },
});
