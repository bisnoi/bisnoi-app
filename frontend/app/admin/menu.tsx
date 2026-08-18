import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, TextInput, Modal, Switch, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useSmartBack } from "@/src/utils/nav";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { Card, Button, Empty, VegDot } from "@/src/components/ui";
import { VariationsEditor } from "@/src/components/VariationsEditor";
import { BulkImportModal } from "@/src/components/BulkImportModal";

type Rest = { id: string; name: string; image?: string };
type Category = { id: string; restaurant_id: string; name: string; sort_order: number; is_enabled: boolean };
type Item = {
  id: string; restaurant_id: string; name: string; description?: string; price: number;
  image?: string; category?: string; category_id?: string | null; veg: boolean;
  is_available?: boolean; available?: boolean; variations?: any[]; approval_status?: string;
};


const ITEM_STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: colors.warningSoft, fg: colors.warning, label: "PENDING" },
  rejected: { bg: colors.errorSoft, fg: colors.error, label: "REJECTED" },
  approved: { bg: colors.successSoft, fg: colors.success, label: "LIVE" },
};

export default function AdminMenu() {
  const router = useRouter();
  const goBack = useSmartBack();
  const [rests, setRests] = useState<Rest[]>([]);
  const [activeRest, setActiveRest] = useState<string | null>(null);
  const [tab, setTab] = useState<"categories" | "items">("categories");
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [catModal, setCatModal] = useState<{ open: boolean; editing?: Category | null }>({ open: false });
  const [itemModal, setItemModal] = useState<{ open: boolean; editing?: Item | null }>({ open: false });
  const [varItem, setVarItem] = useState<Item | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const loadRests = useCallback(async () => {
    try {
      const r = (await Api.adminRests()) as Rest[];
      setRests(r);
      if (r.length && !activeRest) setActiveRest(r[0].id);
    } catch (e) { /* noop */ }
  }, [activeRest]);

  const loadData = useCallback(async () => {
    if (!activeRest) { setLoading(false); return; }
    try {
      const [c, i] = await Promise.all([
        Api.adminCategories(activeRest) as Promise<Category[]>,
        Api.adminMenu(activeRest) as Promise<Item[]>,
      ]);
      c.sort((a, b) => a.sort_order - b.sort_order);
      setCats(c);
      setItems(i);
    } catch (e) { /* noop */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeRest]);

  useEffect(() => { loadRests(); }, []);
  useEffect(() => { setLoading(true); loadData(); }, [activeRest]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const itemCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of items) if (it.category_id) m[it.category_id] = (m[it.category_id] || 0) + 1;
    return m;
  }, [items]);

  const deleteCat = async (c: Category) => {
    setCats((p) => p.filter((x) => x.id !== c.id));
    try { await Api.adminDeleteCategory(c.id); loadData(); } catch { loadData(); }
  };
  const deleteItem = async (it: Item) => {
    setItems((p) => p.filter((x) => x.id !== it.id));
    try { await Api.adminDeleteItem(it.id); loadData(); } catch { loadData(); }
  };
  const approveItem = async (it: Item) => { try { await Api.adminApproveItem(it.id); } finally { loadData(); } };
  const rejectItem = async (it: Item) => { try { await Api.adminRejectItem(it.id, ""); } finally { loadData(); } };

  const catName = (id?: string | null) => cats.find((c) => c.id === id)?.name;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Sticky header */}
      <View style={styles.header}>
        <View style={styles.headTop}>
          <TouchableOpacity testID="admin-menu-back" onPress={goBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Menu & Catalog</Text>
            <Text style={styles.sub}>Manage categories, items & variations</Text>
          </View>
        </View>

        {rests.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.restRow}>
            {rests.map((r) => {
              const on = activeRest === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  testID={`admin-rest-pill-${r.id}`}
                  onPress={() => setActiveRest(r.id)}
                  style={[styles.restPill, on && styles.restPillOn]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.restPillText, on && { color: "#fff" }]} numberOfLines={1}>{r.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.segment}>
          {(["categories", "items"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              testID={`admin-menu-tab-${t}`}
              onPress={() => setTab(t)}
              style={[styles.segBtn, tab === t && styles.segBtnOn]}
            >
              <Text style={[styles.segText, tab === t && { color: "#fff" }]}>
                {t === "categories" ? `Categories (${cats.length})` : `Items (${items.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : rests.length === 0 ? (
          <Empty icon="storefront" title="No restaurants" subtitle="Create a restaurant first from the Restaurants tab" />
        ) : tab === "categories" ? (
          <>
            <Button testID="admin-add-category-btn" title="New Category" icon="add" onPress={() => setCatModal({ open: true, editing: null })} full />
            <View style={{ height: spacing.md }} />
            {cats.length === 0 ? (
              <Empty icon="albums" title="No categories" subtitle="Tap “New Category” to create one" />
            ) : (
              cats.map((c) => (
                <Card key={c.id} style={{ marginBottom: spacing.sm }} >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <View style={styles.catIcon}><Ionicons name="albums" size={18} color={colors.primary} /></View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.itemName, !c.is_enabled && { color: colors.textMuted, textDecorationLine: "line-through" }]} numberOfLines={1}>{c.name}</Text>
                        {!c.is_enabled ? <View style={styles.hiddenChip}><Text style={styles.hiddenChipText}>HIDDEN</Text></View> : null}
                      </View>
                      <Text style={styles.meta}>{itemCounts[c.id] || 0} items</Text>
                    </View>
                    <TouchableOpacity testID={`admin-edit-category-${c.id}`} onPress={() => setCatModal({ open: true, editing: c })} style={styles.iconBtn}>
                      <Ionicons name="create" size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity testID={`admin-delete-category-${c.id}`} onPress={() => deleteCat(c)} style={[styles.iconBtn, { borderColor: colors.error }]}>
                      <Ionicons name="trash" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </Card>
              ))
            )}
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button testID="admin-add-item-btn" title="New Item" icon="add" onPress={() => setItemModal({ open: true, editing: null })} full />
              </View>
              <View style={{ flex: 1 }}>
                <Button testID="admin-bulk-btn" title="Import CSV" icon="cloud-upload" variant="secondary" onPress={() => setBulkOpen(true)} full />
              </View>
            </View>
            <View style={{ height: spacing.md }} />
            {items.length === 0 ? (
              <Empty icon="fast-food" title="No items" subtitle="Tap “New Item” to add a dish" />
            ) : (
              items.map((it) => (
                <Card key={it.id} style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    {it.image ? (
                      <Image source={{ uri: it.image }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbEmpty]} testID={`admin-item-noimg-${it.id}`}>
                        <Ionicons name="fast-food-outline" size={26} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <VegDot veg={it.veg} />
                        <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                      </View>
                      <Text style={styles.catTag}>{catName(it.category_id) || it.category || "Uncategorized"}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <Text style={styles.price}>₹{it.price}</Text>
                          {(it.variations?.length || 0) > 0 ? (
                            <View style={styles.varChip}><Text style={styles.varChipText}>{it.variations!.length} variants</Text></View>
                          ) : null}
                          {(() => { const s = ITEM_STATUS[it.approval_status || "approved"] || ITEM_STATUS.approved; return (
                            <View style={[styles.statusTag, { backgroundColor: s.bg }]}><Text style={{ color: s.fg, fontSize: 9, fontWeight: font.black }}>{s.label}</Text></View>
                          ); })()}
                        </View>
                      </View>
                      {(it.approval_status && it.approval_status !== "approved") ? (
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                          <TouchableOpacity testID={`admin-approve-item-${it.id}`} onPress={() => approveItem(it)} style={styles.approveBtn}>
                            <Ionicons name="checkmark-circle" size={14} color="#fff" />
                            <Text style={styles.approveBtnText}>Approve</Text>
                          </TouchableOpacity>
                          {it.approval_status !== "rejected" ? (
                            <TouchableOpacity testID={`admin-reject-item-${it.id}`} onPress={() => rejectItem(it)} style={styles.rejectBtn}>
                              <Ionicons name="close-circle" size={14} color={colors.error} />
                              <Text style={styles.rejectBtnText}>Reject</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                        <TouchableOpacity testID={`admin-item-variations-${it.id}`} onPress={() => setVarItem(it)} style={styles.varBtn}>
                          <Ionicons name="pricetags" size={14} color={colors.primary} />
                          <Text style={styles.varBtnText}>Variations</Text>
                        </TouchableOpacity>
                        <TouchableOpacity testID={`admin-edit-item-${it.id}`} onPress={() => setItemModal({ open: true, editing: it })} style={styles.iconBtn}>
                          <Ionicons name="create" size={16} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity testID={`admin-delete-item-${it.id}`} onPress={() => deleteItem(it)} style={[styles.iconBtn, { borderColor: colors.error }]}>
                          <Ionicons name="trash" size={16} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>

      <CategoryModal
        visible={catModal.open}
        editing={catModal.editing}
        restaurantId={activeRest}
        onClose={() => setCatModal({ open: false })}
        onDone={() => { setCatModal({ open: false }); loadData(); }}
      />
      <ItemModal
        visible={itemModal.open}
        editing={itemModal.editing}
        restaurantId={activeRest}
        cats={cats}
        onClose={() => setItemModal({ open: false })}
        onDone={() => { setItemModal({ open: false }); loadData(); }}
      />
      <VariationsEditor
        visible={!!varItem}
        itemName={varItem?.name || ""}
        api={varItem ? {
          list: () => Api.adminListVariations(varItem.id),
          create: (b) => Api.adminCreateVariation(varItem.id, b),
          update: (vid, b) => Api.adminUpdateVariation(vid, b),
          remove: (vid) => Api.adminDeleteVariation(vid),
        } : null}
        onClose={() => { setVarItem(null); loadData(); }}
      />
      <BulkImportModal
        visible={bulkOpen}
        subtitle="Items will be added to the selected restaurant and auto-approved."
        onClose={() => setBulkOpen(false)}
        onImport={async (items) => { if (!activeRest) throw new Error("Select a restaurant first"); await Api.adminBulkMenu(activeRest, items); await loadData(); }}
      />
    </SafeAreaView>
  );
}

function CategoryModal({ visible, editing, restaurantId, onClose, onDone }: {
  visible: boolean; editing?: Category | null; restaurantId: string | null; onClose: () => void; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setName(editing?.name || "");
      setEnabled(editing ? editing.is_enabled : true);
      setError("");
    }
  }, [editing, visible]);

  const submit = async () => {
    if (!restaurantId) return setError("Select a restaurant first");
    if (!name.trim()) return setError("Enter a category name");
    setSaving(true);
    try {
      if (editing) await Api.adminUpdateCategory(editing.id, { name: name.trim(), is_enabled: enabled });
      else await Api.adminCreateCategory(restaurantId, { name: name.trim(), is_enabled: enabled });
      onDone();
    } catch (e: any) { setError(e?.message || "Could not save"); } finally { setSaving(false); }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <View style={styles.mHead}>
          <Text style={styles.mTitle}>{editing ? "Edit Category" : "New Category"}</Text>
          <TouchableOpacity testID="category-modal-close" onPress={onClose}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <View>
            <Text style={styles.label}>Category Name</Text>
            <TextInput
              testID="category-name-input"
              value={name}
              onChangeText={(t) => { setName(t); setError(""); }}
              placeholder="e.g. Starters, Main Course"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoFocus
            />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <Ionicons name={enabled ? "eye" : "eye-off"} size={18} color={enabled ? colors.success : colors.textMuted} />
              <Text style={{ color: colors.textPrimary, fontWeight: font.semi }}>Visible to customers</Text>
            </View>
            <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: colors.success, false: colors.borderStrong }} />
          </View>
          {error ? <Text style={{ color: colors.error, fontSize: 13 }} testID="category-error">{error}</Text> : null}
          <Button testID="category-save-btn" title={editing ? "Save Changes" : "Create Category"} icon="checkmark" onPress={submit} loading={saving} full />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ItemModal({ visible, editing, restaurantId, cats, onClose, onDone }: {
  visible: boolean; editing?: Item | null; restaurantId: string | null; cats: Category[]; onClose: () => void; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("199");
  const [image, setImage] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [veg, setVeg] = useState(true);
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name); setDescription(editing.description || ""); setPrice(String(editing.price));
      setImage(editing.image || ""); setCategoryId(editing.category_id || null);
      setVeg(editing.veg); setAvailable(editing.is_available ?? editing.available ?? true);
    } else {
      setName(""); setDescription(""); setPrice("199"); setImage("");
      setCategoryId(cats[0]?.id || null); setVeg(true); setAvailable(true);
    }
    setError("");
  }, [editing, visible]);

  const submit = async () => {
    if (!restaurantId) return setError("Select a restaurant first");
    if (!name.trim()) return setError("Enter an item name");
    setSaving(true);
    try {
      const body = {
        name: name.trim(), description: description.trim(), price: parseInt(price, 10) || 0,
        image: image.trim(), category_id: categoryId, veg,
        is_available: available, available,
      };
      if (editing) await Api.adminUpdateItem(editing.id, body);
      else await Api.adminCreateItem(restaurantId, body);
      onDone();
    } catch (e: any) { setError(e?.message || "Could not save"); } finally { setSaving(false); }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <View style={styles.mHead}>
          <Text style={styles.mTitle}>{editing ? "Edit Item" : "New Item"}</Text>
          <TouchableOpacity testID="item-modal-close" onPress={onClose}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Field testID="item-name-input" label="Name" value={name} onChange={(t) => { setName(t); setError(""); }} placeholder="e.g. Paneer Tikka" />
          <Field testID="item-desc-input" label="Description" value={description} onChange={setDescription} multiline />
          <Field testID="item-price-input" label="Base Price (₹)" value={price} onChange={(t) => setPrice(t.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
          <Field testID="item-image-input" label="Image URL" value={image} onChange={setImage} placeholder="https://..." />

          <View>
            <Text style={styles.label}>Category</Text>
            {cats.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>No categories yet — create one in the Categories tab.</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {cats.map((c) => {
                  const on = categoryId === c.id;
                  return (
                    <TouchableOpacity key={c.id} testID={`item-cat-${c.id}`} onPress={() => setCategoryId(c.id)} style={[styles.catPill, on && styles.catPillOn]}>
                      <Text style={[styles.catPillText, on && { color: "#fff" }]}>{c.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <VegDot veg={veg} /><Text style={{ color: colors.textPrimary, fontWeight: font.semi }}>Vegetarian</Text>
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
          {error ? <Text style={{ color: colors.error, fontSize: 13 }} testID="item-error">{error}</Text> : null}
          <Button testID="item-save-btn" title={editing ? "Save Changes" : "Create Item"} icon="checkmark" onPress={submit} loading={saving} full />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, value, onChange, placeholder, multiline, keyboardType, testID }: {
  label: string; value: string; onChange: (s: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: any; testID?: string;
}) {
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
  header: { backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm },
  headTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  backBtn: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  restRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 8, alignItems: "center" },
  restPill: { flexShrink: 0, maxWidth: 180, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 14, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  restPillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  restPillText: { fontSize: 13, fontWeight: font.semi, color: colors.textSecondary },

  segment: { flexDirection: "row", marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: "center" },
  segBtnOn: { backgroundColor: colors.primary },
  segText: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },

  catIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  itemName: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary, flexShrink: 1 },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  catTag: { fontSize: 12, color: colors.primary, fontWeight: font.semi, marginTop: 3 },
  price: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary },

  thumb: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  thumbEmpty: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  iconBtn: { width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, alignItems: "center", justifyContent: "center" },
  varBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary },
  varBtnText: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  varChip: { backgroundColor: colors.successSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  varChipText: { fontSize: 10, fontWeight: font.black, color: colors.success },
  statusTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  approveBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, height: 34, borderRadius: radius.sm, backgroundColor: colors.success },
  approveBtnText: { fontSize: 13, fontWeight: font.bold, color: "#fff" },
  rejectBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, height: 34, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.error },
  rejectBtnText: { fontSize: 13, fontWeight: font.bold, color: colors.error },

  hiddenChip: { backgroundColor: colors.warningSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  hiddenChipText: { fontSize: 9, fontWeight: font.black, color: colors.warning, letterSpacing: 0.4 },

  mHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  mTitle: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary },
  label: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: 14, color: colors.textPrimary },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  catPill: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  catPillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  catPillText: { fontSize: 13, fontWeight: font.semi, color: colors.textSecondary },
});
