import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput, Modal, Alert, Switch, Image, Platform, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { Card, Button, Empty, VegDot, Pill } from "@/src/components/ui";
import { BulkImportModal } from "@/src/components/BulkImportModal";
import { AiMenuImportModal } from "@/src/components/AiMenuImportModal";
import { confirmDialog, notify } from "@/src/utils/confirm";
import { compressDataUrl } from "@/src/utils/imageCompress";

type Rest = { id: string; name: string; cuisines: string[]; image?: string };
type Category = { id: string; restaurant_id: string; name: string; is_enabled: boolean };
type Variation = { id?: string; name: string; price: number; is_available?: boolean };
type Item = { id: string; restaurant_id: string; name: string; description?: string; price: number; image?: string; category?: string; category_id?: string | null; veg: boolean; available: boolean; is_available?: boolean; variations?: Variation[]; approval_status?: string; reject_reason?: string | null };

const STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: colors.warningSoft, fg: colors.warning, label: "PENDING APPROVAL" },
  rejected: { bg: colors.errorSoft, fg: colors.error, label: "REJECTED" },
  approved: { bg: colors.successSoft, fg: colors.success, label: "LIVE" },
};

export default function OwnerMenu() {
  const [rests, setRests] = useState<Rest[]>([]);
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [cats, setCats] = useState<Category[]>([]);
  const [activeRest, setActiveRest] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [itemModal, setItemModal] = useState<{ open: boolean; editing?: Item | null }>({ open: false });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [togglingItem, setTogglingItem] = useState<string | null>(null);

  const toggleItemAvail = async (it: Item) => {
    if (togglingItem === it.id) return;
    setTogglingItem(it.id);
    const next = !(it.is_available ?? it.available ?? true);
    setItems((prev) => {
      const map = { ...prev };
      if (map[it.restaurant_id]) {
        map[it.restaurant_id] = map[it.restaurant_id].map((x) =>
          x.id === it.id ? { ...x, available: next, is_available: next } : x
        );
      }
      return map;
    });
    try {
      await Api.ownerToggleItem(it.id, next);
    } catch (e: any) {
      // revert on error
      setItems((prev) => {
        const map = { ...prev };
        if (map[it.restaurant_id]) {
          map[it.restaurant_id] = map[it.restaurant_id].map((x) =>
            x.id === it.id ? { ...x, available: !next, is_available: !next } : x
          );
        }
        return map;
      });
    } finally {
      setTogglingItem(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const [r, allCats, allItems] = await Promise.all([
        Api.ownerRests() as Promise<Rest[]>,
        Api.ownerCategories() as Promise<Category[]>,
        Api.ownerListItems() as Promise<Item[]>,
      ]);
      setRests(r);
      setCats(allCats);
      if (r.length && !activeRest) setActiveRest(r[0].id);
      const map: Record<string, Item[]> = {};
      for (const it of allItems) (map[it.restaurant_id] = map[it.restaurant_id] || []).push(it);
      setItems(map);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeRest]);

  useEffect(() => { load(); }, []);

  const onRefresh = () => { setRefreshing(true); load(); };
  const list = activeRest ? items[activeRest] || [] : [];
  const restCats = activeRest ? cats.filter((c) => c.restaurant_id === activeRest) : [];
  const catName = (id?: string | null) => cats.find((c) => c.id === id)?.name;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.titleBar}>
        <Text style={styles.title}>Menu Management</Text>
        <Text style={styles.sub}>New items go live after admin approval</Text>
      </View>

      {rests.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
          {rests.map((r) => (
            <Pill key={r.id} label={r.name} active={activeRest === r.id} onPress={() => setActiveRest(r.id)} icon="restaurant" />
          ))}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : rests.length === 0 ? (
          <Empty icon="storefront" title="No restaurants assigned" subtitle="The admin will assign restaurants to your account" />
        ) : (
          <>
            <View style={{ marginBottom: spacing.md, gap: 10 }}>
              <Text style={styles.sTitle}>ITEMS ({list.length})</Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Button testID="owner-ai-scan-btn" title="Scan Menu" icon="sparkles" onPress={() => setAiOpen(true)} />
                <Button testID="owner-bulk-btn" title="Import CSV" icon="cloud-upload" variant="secondary" onPress={() => setBulkOpen(true)} />
                <Button testID="owner-add-item-btn" title="Add Item" icon="add" variant="secondary" onPress={() => setItemModal({ open: true, editing: null })} />
              </View>
            </View>
            {list.length === 0 ? (
              <Empty icon="fast-food" title="No items yet" subtitle="Tap “Add Item” to create your first dish" />
            ) : (
              list.map((it) => {
                const st = STATUS[it.approval_status || "approved"] || STATUS.approved;
                return (
                  <Card key={it.id} style={{ marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      {it.image ? (
                        <Image source={{ uri: it.image }} style={styles.thumb} />
                      ) : (
                        <View style={[styles.thumb, styles.thumbEmpty]} testID={`owner-item-noimg-${it.id}`}>
                          <Ionicons name="fast-food-outline" size={26} color={colors.textMuted} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <VegDot veg={it.veg} />
                          <Text style={{ fontWeight: font.bold, fontSize: 15, color: colors.textPrimary, flex: 1 }} numberOfLines={1}>{it.name}</Text>
                        </View>
                        <Text style={styles.catTag}>{catName(it.category_id) || it.category || "Uncategorized"}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                          <Text style={{ color: colors.textPrimary, fontWeight: font.bold, fontSize: 15 }}>₹{it.price}</Text>
                          {(it.variations?.length || 0) > 0 ? (
                            <View style={styles.varChip}><Text style={styles.varChipText}>{it.variations!.length} variants</Text></View>
                          ) : null}
                          <View style={[styles.statusTag, { backgroundColor: st.bg }]}>
                            <Text style={{ color: st.fg, fontSize: 9, fontWeight: font.black, letterSpacing: 0.3 }}>{st.label}</Text>
                          </View>
                        </View>
                        {it.approval_status === "rejected" && it.reject_reason ? (
                          <Text style={styles.rejReason}>Admin: {it.reject_reason}</Text>
                        ) : null}
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons name={it.is_available ?? it.available ? "checkmark-circle" : "close-circle"} size={15} color={(it.is_available ?? it.available) ? colors.success : colors.textMuted} />
                            <Text style={{ fontSize: 12, fontWeight: font.semi, color: (it.is_available ?? it.available) ? colors.success : colors.textMuted }}>
                              {(it.is_available ?? it.available) ? "Available" : "Unavailable"}
                            </Text>
                            {togglingItem === it.id ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <Switch
                                testID={`owner-item-toggle-${it.id}`}
                                value={!!(it.is_available ?? it.available)}
                                onValueChange={() => toggleItemAvail(it)}
                                trackColor={{ true: colors.success, false: colors.borderStrong }}
                                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                              />
                            )}
                          </View>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                          <TouchableOpacity testID={`owner-edit-item-${it.id}`} onPress={() => setItemModal({ open: true, editing: it })} style={styles.iconBtn}>
                            <Ionicons name="create" size={16} color={colors.primary} />
                            <Text style={styles.iconBtnText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            testID={`owner-delete-item-${it.id}`}
                            onPress={async () => {
                              const ok = await confirmDialog("Delete item?", it.name, "Delete", true);
                              if (ok) { await Api.ownerDeleteItem(it.id); load(); }
                            }}
                            style={[styles.iconBtn, { borderColor: colors.error }]}
                          >
                            <Ionicons name="trash" size={16} color={colors.error} />
                            <Text style={[styles.iconBtnText, { color: colors.error }]}>Delete</Text>
                          </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  </Card>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <ItemModal
        visible={itemModal.open}
        editing={itemModal.editing}
        restaurantId={activeRest}
        cats={restCats}
        onClose={() => setItemModal({ open: false })}
        onDone={() => { setItemModal({ open: false }); load(); }}
      />
      <BulkImportModal
        visible={bulkOpen}
        subtitle="Items will be added to your restaurant and submitted for admin approval."
        onClose={() => setBulkOpen(false)}
        onImport={async (items) => { await Api.ownerBulkMenu(items); await load(); }}
      />
      <AiMenuImportModal
        visible={aiOpen}
        restaurantName={activeRest ? rests.find((r) => r.id === activeRest)?.name : null}
        onClose={() => setAiOpen(false)}
        onDone={(count) => {
          setAiOpen(false);
          load();
          notify("Items added", `${count} item${count === 1 ? "" : "s"} added and submitted for admin approval.`);        }}
      />
    </SafeAreaView>
  );
}

function ItemModal({ visible, editing, restaurantId, cats, onClose, onDone }: { visible: boolean; editing?: Item | null; restaurantId: string | null; cats: Category[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("199");
  const [image, setImage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [veg, setVeg] = useState(true);
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permBlocked, setPermBlocked] = useState(false);
  const [pricePolicy, setPricePolicy] = useState<any>(null);

  // variations
  const [vars, setVars] = useState<Variation[]>([]);
  const [initialVars, setInitialVars] = useState<Variation[]>([]);
  const [vName, setVName] = useState("");
  const [vPrice, setVPrice] = useState("");

  useEffect(() => {
    if (!visible) return;
    setPermBlocked(false);
    setImageUrl("");
    setVName(""); setVPrice("");
    // Fetch owner's applicable price policy once per modal open
    Api.ownerPricePolicy().then((p: any) => setPricePolicy(p)).catch(() => setPricePolicy(null));
    if (editing) {
      setName(editing.name); setDescription(editing.description || ""); setPrice(String(editing.price));
      setImage(editing.image || ""); setCategoryId(editing.category_id || null);
      setVeg(editing.veg); setAvailable(editing.is_available ?? editing.available ?? true);
      // load existing variations
      Api.ownerListVariations(editing.id).then((v: any) => {
        const rows = (v || []).map((x: any) => ({ id: x.id, name: x.name, price: x.price, is_available: x.is_available }));
        setVars(rows); setInitialVars(rows);
      }).catch(() => { setVars([]); setInitialVars([]); });
    } else {
      setName(""); setDescription(""); setPrice("199"); setImage("");
      setCategoryId(cats[0]?.id || null); setVeg(true); setAvailable(true);
      setVars([]); setInitialVars([]);
    }
  }, [editing, visible]);

  const pickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        aspect: [4, 3],
        quality: 0.5,
        base64: true,
      });
      if (!res.canceled && res.assets?.[0]?.base64) {
        setImage((await compressDataUrl(`data:image/jpeg;base64,${res.assets[0].base64}`)) as string);
        setPermBlocked(false);
      }
    } catch (e: any) {
      notify("Image error", e?.message || "Could not pick image");
    }
  };

  const addVariationRow = () => {
    if (!vName.trim()) return;
    const p = parseInt(vPrice, 10);
    if (isNaN(p) || p < 0) return;
    setVars((prev) => [...prev, { name: vName.trim(), price: p, is_available: true }]);
    setVName(""); setVPrice("");
  };
  const removeVariationRow = (idx: number) => setVars((prev) => prev.filter((_, i) => i !== idx));

  const reconcileVariations = async (itemId: string) => {
    // delete removed (only those that had an id)
    const keptIds = vars.filter((v) => v.id).map((v) => v.id);
    for (const iv of initialVars) {
      if (iv.id && !keptIds.includes(iv.id)) {
        try { await Api.ownerDeleteVariation(iv.id); } catch {}
      }
    }
    for (const v of vars) {
      if (!v.id) {
        try { await Api.ownerCreateVariation(itemId, { name: v.name, price: v.price, is_available: v.is_available ?? true }); } catch {}
      } else {
        const orig = initialVars.find((o) => o.id === v.id);
        if (orig && (orig.name !== v.name || orig.price !== v.price)) {
          try { await Api.ownerUpdateVariation(v.id, { name: v.name, price: v.price }); } catch {}
        }
      }
    }
  };

  const submit = async () => {
    if (!restaurantId) return notify("Select restaurant", "Choose a restaurant first");
    if (!name.trim()) return notify("Required", "Enter item name");
    setSaving(true);
    try {
      const body = {
        name: name.trim(), description: description.trim(), price: parseInt(price, 10) || 0,
        image: image.trim(), category_id: categoryId, veg, available, is_available: available,
      };
      let itemId = editing?.id;
      if (editing) {
        await Api.ownerUpdateItem(editing.id, body);
      } else {
        const created: any = await Api.ownerAddItem(restaurantId, body);
        itemId = created?.id;
      }
      if (itemId) await reconcileVariations(itemId);
      onDone();
    } catch (e: any) {
      notify("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <View style={styles.mHead}>
          <Text style={styles.mTitle}>{editing ? "Edit Item" : "Add Item"}</Text>
          <TouchableOpacity testID="owner-item-modal-close" onPress={onClose}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          {/* Image uploader */}
          <View>
            <Text style={styles.label}>Item Photo</Text>
            <TouchableOpacity testID="owner-item-image-picker" onPress={pickImage} activeOpacity={0.85} style={styles.imagePicker}>
              {image ? (
                <Image source={{ uri: image }} style={styles.imagePreview} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="cloud-upload-outline" size={28} color={colors.primary} />
                  <Text style={styles.imagePlaceholderText}>Tap to upload photo</Text>
                </View>
              )}
            </TouchableOpacity>
            {image ? (
              <TouchableOpacity testID="owner-item-image-change" onPress={pickImage} style={{ marginTop: 6, alignSelf: "flex-start" }}>
                <Text style={{ color: colors.primary, fontWeight: font.semi, fontSize: 13 }}>Change photo</Text>
              </TouchableOpacity>
            ) : null}
            {permBlocked ? (
              <View style={styles.permBox}>
                <Text style={styles.permText}>Photo access is blocked. Enable it in Settings to upload images.</Text>
                <TouchableOpacity testID="owner-open-settings" onPress={() => Linking.openSettings()} style={styles.permBtn}>
                  <Ionicons name="settings-outline" size={14} color="#fff" />
                  <Text style={styles.permBtnText}>Open Settings</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
              <TextInput
                testID="owner-item-image-url"
                value={imageUrl}
                onChangeText={setImageUrl}
                placeholder="Or paste an image link (https://...)"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={{ flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.textPrimary }}
              />
              <Button testID="owner-item-image-url-apply" title="Use" onPress={() => { if (imageUrl.trim()) setImage(imageUrl.trim()); }} />
            </View>
          </View>

          <Field testID="owner-item-name" label="Name" value={name} onChange={setName} placeholder="e.g. Paneer Tikka" />
          <Field testID="owner-item-desc" label="Description" value={description} onChange={setDescription} multiline />
          <Field testID="owner-item-price" label="Base Price (₹)" value={price} onChange={(t) => setPrice(t.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
          {/* Admin-controlled price policy hint (only when editing an item with a baseline) */}
          {editing && pricePolicy?.policy ? (
            <PricePolicyHint
              baseline={(editing as any).baseline_price || editing.price || 0}
              policy={pricePolicy.policy}
              currentPrice={parseInt(price || "0", 10) || 0}
            />
          ) : null}
          {!pricePolicy?.policy?.allow_owner_price_edit && editing ? (
            <View style={styles.policyLocked}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.error} />
              <Text style={styles.policyLockedTxt}>Price edits are disabled by admin.</Text>
            </View>
          ) : null}

          {/* Category selection */}
          <View>
            <Text style={styles.label}>Category</Text>
            {cats.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>No categories available. Ask the admin to create categories.</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {cats.map((c) => {
                  const on = categoryId === c.id;
                  return (
                    <TouchableOpacity key={c.id} testID={`owner-item-cat-${c.id}`} onPress={() => setCategoryId(c.id)} style={[styles.catPill, on && styles.catPillOn]}>
                      <Text style={[styles.catPillText, on && { color: "#fff" }]}>{c.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Variations */}
          <View style={styles.varSection}>
            <Text style={styles.label}>Variations (optional)</Text>
            <Text style={styles.varHint}>Add sizes like Small / Medium / Large with their own prices.</Text>
            {vars.map((v, idx) => (
              <View key={v.id || `new-${idx}`} style={styles.varRow} testID={`owner-var-row-${idx}`}>
                <Text style={styles.varRowName}>{v.name}</Text>
                <Text style={styles.varRowPrice}>₹{v.price}</Text>
                <TouchableOpacity testID={`owner-var-remove-${idx}`} onPress={() => removeVariationRow(idx)} style={styles.varDel}>
                  <Ionicons name="close" size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 8 }}>
              <TextInput testID="owner-var-name" value={vName} onChangeText={setVName} placeholder="Size e.g. Large" placeholderTextColor={colors.textMuted} style={[styles.input, { flex: 1.4 }]} />
              <TextInput testID="owner-var-price" value={vPrice} onChangeText={(t) => setVPrice(t.replace(/[^0-9]/g, ""))} placeholder="₹ Price" placeholderTextColor={colors.textMuted} keyboardType="number-pad" style={[styles.input, { flex: 1 }]} />
              <TouchableOpacity testID="owner-var-add" onPress={addVariationRow} style={styles.varAddBtn}>
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <VegDot veg={veg} />
              <Text style={{ color: colors.textPrimary, fontWeight: font.semi }}>Vegetarian</Text>
            </View>
            <Switch value={veg} onValueChange={setVeg} trackColor={{ true: colors.vegGreen, false: colors.borderStrong }} />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="checkmark-circle" size={18} color={available ? colors.success : colors.textMuted} />
              <Text style={{ color: colors.textPrimary, fontWeight: font.semi }}>Available</Text>
            </View>
            <Switch value={available} onValueChange={setAvailable} trackColor={{ true: colors.success, false: colors.borderStrong }} />
          </View>

          {!editing ? (
            <View style={styles.approvalNote}>
              <Ionicons name="information-circle" size={16} color={colors.warning} />
              <Text style={styles.approvalNoteText}>This item will be sent to admin for approval before it appears to customers.</Text>
            </View>
          ) : null}

          <Button testID="owner-item-save" title={editing ? "Save Changes" : "Submit for Approval"} icon="checkmark" onPress={submit} loading={saving} full />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, value, onChange, placeholder, multiline, keyboardType, testID }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: any; testID?: string }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[styles.input, multiline && { minHeight: 70, textAlignVertical: "top" }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  titleBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  tabsScroll: { flexGrow: 0, flexShrink: 0 },
  tabsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 8, alignItems: "center" },
  sTitle: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4 },
  catTag: { fontSize: 12, color: colors.primary, fontWeight: font.semi, marginTop: 3 },
  thumb: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  thumbEmpty: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary },
  iconBtnText: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  varChip: { backgroundColor: colors.successSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  varChipText: { fontSize: 10, fontWeight: font.black, color: colors.success },
  statusTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  rejReason: { fontSize: 11, color: colors.error, marginTop: 5, fontStyle: "italic" },

  mHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  mTitle: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary },
  label: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: 14, color: colors.textPrimary },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  catPill: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  catPillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  catPillText: { fontSize: 13, fontWeight: font.semi, color: colors.textSecondary },

  imagePicker: { borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: "dashed", borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface },
  imagePreview: { width: "100%", height: 160 },
  imagePlaceholder: { height: 120, alignItems: "center", justifyContent: "center", gap: 6 },
  imagePlaceholderText: { color: colors.primary, fontWeight: font.semi, fontSize: 13 },
  permBox: { marginTop: 8, backgroundColor: colors.errorSoft, borderRadius: radius.md, padding: spacing.md, gap: 8 },
  permText: { fontSize: 12, color: colors.error, lineHeight: 17 },
  permBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.error, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm },
  permBtnText: { color: "#fff", fontWeight: font.bold, fontSize: 13 },

  varSection: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  varHint: { fontSize: 11, color: colors.textMuted, marginBottom: 8 },
  varRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  varRowName: { flex: 1, fontSize: 14, fontWeight: font.semi, color: colors.textPrimary },
  varRowPrice: { fontSize: 14, fontWeight: font.bold, color: colors.success },
  varDel: { width: 28, height: 28, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error, alignItems: "center", justifyContent: "center" },
  varAddBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },

  approvalNote: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md },
  approvalNoteText: { flex: 1, fontSize: 12, color: colors.warning, lineHeight: 17, fontWeight: font.semi },

  // Price policy hint (shown under Base Price when editing)
  policyHint: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginTop: -4, borderWidth: 1, borderColor: colors.border },
  policyHintTxt: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  policyHintTxtBad: { flex: 1, fontSize: 12, color: colors.error, lineHeight: 17, fontWeight: font.semi },
  policyLocked: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: -4 },
  policyLockedTxt: { fontSize: 12, color: colors.error, fontWeight: font.semi },
});

/** Small hint card that shows the admin-configured allowed price range for the
 *  item being edited (baseline ± hike/drop caps). Turns red when the currently-
 *  typed price falls outside the allowed window so the owner spots it before
 *  clicking Save. */
function PricePolicyHint({ baseline, policy, currentPrice }: { baseline: number; policy: any; currentPrice: number }) {
  const b = Math.max(0, baseline || 0);
  const hikePct = Number(policy?.hike_max_percent ?? 0);
  const dropPct = Number(policy?.drop_max_percent ?? 0);
  const maxP = b > 0 ? b + Math.round(b * hikePct / 100) : 0;
  const minP = b > 0 ? Math.max(0, b - Math.round(b * dropPct / 100)) : 0;
  const outOfRange = b > 0 && (currentPrice > maxP || currentPrice < minP);
  if (b <= 0) return null;
  return (
    <View style={styles.policyHint}>
      <Ionicons name={outOfRange ? "warning" : "shield-checkmark-outline"} size={16} color={outOfRange ? colors.error : colors.success} />
      <Text style={outOfRange ? styles.policyHintTxtBad : styles.policyHintTxt}>
        {outOfRange
          ? `Out of allowed range. Baseline ₹${b}, allowed ₹${minP} - ₹${maxP} (${dropPct}% drop / ${hikePct}% hike caps).`
          : `Baseline ₹${b} · Allowed range ₹${minP} - ₹${maxP} (${dropPct}% drop / ${hikePct}% hike caps set by admin).`}
      </Text>
    </View>
  );
}
