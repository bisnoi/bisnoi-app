path = "src/components/AiMenuImportModal.tsx"
with open(path) as f:
    c = f.read()

# --- 1. Types: add RVariation + RSubcat, extend RItem/RCat ---
old_types = '''type RItem = { _id: string; name: string; price: string; description: string; veg: boolean };
type RCat = { _id: string; name: string; items: RItem[] };

type Picked = { base64: string; mime: string; name: string; isImage: boolean };'''

new_types = '''type RVariation = { _id: string; name: string; price: string };
type RItem = { _id: string; name: string; price: string; description: string; veg: boolean; variations: RVariation[] };
type RSubcat = { _id: string; name: string; items: RItem[] };
type RCat = { _id: string; name: string; items: RItem[]; subcategories: RSubcat[] };

type Picked = { base64: string; mime: string; name: string; isImage: boolean };'''

assert old_types in c, "TYPES ANCHOR NOT FOUND"
c = c.replace(old_types, new_types, 1)

# --- 2. Add mapExtractedItem helper right after uid() ---
old_uid = '''const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;'''

new_uid = '''const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Maps one extracted item (from AI/OCR) into review-screen shape, including size variations. */
const mapExtractedItem = (i: any): RItem => ({
  _id: uid(),
  name: String(i.name || ""),
  price: String(i.price ?? ""),
  description: String(i.description || ""),
  veg: i.veg !== false,
  variations: (i.variations || []).map((v: any) => ({
    _id: uid(),
    name: String(v.name || ""),
    price: String(v.price ?? ""),
  })),
});'''

assert old_uid in c, "UID ANCHOR NOT FOUND"
c = c.replace(old_uid, new_uid, 1)

# --- 3. Extraction mapping: include subcategories + variations ---
old_mapping = '''      const incoming: RCat[] = (res?.categories || []).map((c: any) => ({
        _id: uid(),
        name: String(c.name || "Menu"),
        items: (c.items || []).map((i: any) => ({
          _id: uid(),
          name: String(i.name || ""),
          price: String(i.price ?? ""),
          description: String(i.description || ""),
          veg: i.veg !== false,
        })),
      })).filter((c: RCat) => c.items.length > 0);'''

new_mapping = '''      const incoming: RCat[] = (res?.categories || []).map((c: any) => ({
        _id: uid(),
        name: String(c.name || "Menu"),
        items: (c.items || []).map(mapExtractedItem),
        subcategories: (c.subcategories || [])
          .map((s: any) => ({
            _id: uid(),
            name: String(s.name || ""),
            items: (s.items || []).map(mapExtractedItem),
          }))
          .filter((s: RSubcat) => s.name.length > 0 && s.items.length > 0),
      })).filter((c: RCat) => c.items.length > 0 || c.subcategories.length > 0);'''

assert old_mapping in c, "MAPPING ANCHOR NOT FOUND"
c = c.replace(old_mapping, new_mapping, 1)

# --- 4. Editing helpers: sid-aware item helpers + subcategory + variation helpers ---
old_helpers = '''  // ---- review editing helpers ----
  const totalItems = cats.reduce((n, c) => n + c.items.length, 0);

  const updateCatName = (cid: string, name: string) =>
    setCats((prev) => prev.map((c) => (c._id === cid ? { ...c, name } : c)));
  const removeCat = (cid: string) =>
    setCats((prev) => prev.filter((c) => c._id !== cid));
  const updateItem = (cid: string, iid: string, patch: Partial<RItem>) =>
    setCats((prev) => prev.map((c) => c._id === cid
      ? { ...c, items: c.items.map((it) => (it._id === iid ? { ...it, ...patch } : it)) }
      : c));
  const removeItem = (cid: string, iid: string) =>
    setCats((prev) => prev.map((c) => c._id === cid ? { ...c, items: c.items.filter((it) => it._id !== iid) } : c));
  const addItem = (cid: string) =>
    setCats((prev) => prev.map((c) => c._id === cid
      ? { ...c, items: [...c.items, { _id: uid(), name: "", price: "", description: "", veg: true }] }
      : c));'''

new_helpers = '''  // ---- review editing helpers ----
  const totalItems = cats.reduce(
    (n, c) => n + c.items.length + c.subcategories.reduce((sn, s) => sn + s.items.length, 0),
    0,
  );

  const mapItemInCats = (prev: RCat[], cid: string, sid: string | null, iid: string, fn: (it: RItem) => RItem): RCat[] =>
    prev.map((c) => {
      if (c._id !== cid) return c;
      if (sid === null) {
        return { ...c, items: c.items.map((it) => (it._id === iid ? fn(it) : it)) };
      }
      return {
        ...c,
        subcategories: c.subcategories.map((s) => (s._id === sid
          ? { ...s, items: s.items.map((it) => (it._id === iid ? fn(it) : it)) }
          : s)),
      };
    });

  const updateCatName = (cid: string, name: string) =>
    setCats((prev) => prev.map((c) => (c._id === cid ? { ...c, name } : c)));
  const removeCat = (cid: string) =>
    setCats((prev) => prev.filter((c) => c._id !== cid));

  const addSubcat = (cid: string) =>
    setCats((prev) => prev.map((c) => (c._id === cid
      ? { ...c, subcategories: [...c.subcategories, { _id: uid(), name: "", items: [] }] }
      : c)));
  const updateSubcatName = (cid: string, sid: string, name: string) =>
    setCats((prev) => prev.map((c) => (c._id === cid
      ? { ...c, subcategories: c.subcategories.map((s) => (s._id === sid ? { ...s, name } : s)) }
      : c)));
  const removeSubcat = (cid: string, sid: string) =>
    setCats((prev) => prev.map((c) => (c._id === cid
      ? { ...c, subcategories: c.subcategories.filter((s) => s._id !== sid) }
      : c)));

  const updateItem = (cid: string, sid: string | null, iid: string, patch: Partial<RItem>) =>
    setCats((prev) => mapItemInCats(prev, cid, sid, iid, (it) => ({ ...it, ...patch })));
  const removeItem = (cid: string, sid: string | null, iid: string) =>
    setCats((prev) => prev.map((c) => {
      if (c._id !== cid) return c;
      if (sid === null) return { ...c, items: c.items.filter((it) => it._id !== iid) };
      return { ...c, subcategories: c.subcategories.map((s) => (s._id === sid ? { ...s, items: s.items.filter((it) => it._id !== iid) } : s)) };
    }));
  const addItem = (cid: string, sid: string | null) =>
    setCats((prev) => prev.map((c) => {
      if (c._id !== cid) return c;
      const blank: RItem = { _id: uid(), name: "", price: "", description: "", veg: true, variations: [] };
      if (sid === null) return { ...c, items: [...c.items, blank] };
      return { ...c, subcategories: c.subcategories.map((s) => (s._id === sid ? { ...s, items: [...s.items, blank] } : s)) };
    }));

  const addVariation = (cid: string, sid: string | null, iid: string) =>
    setCats((prev) => mapItemInCats(prev, cid, sid, iid, (it) => ({
      ...it, variations: [...it.variations, { _id: uid(), name: "", price: "" }],
    })));
  const updateVariation = (cid: string, sid: string | null, iid: string, vid: string, patch: Partial<RVariation>) =>
    setCats((prev) => mapItemInCats(prev, cid, sid, iid, (it) => ({
      ...it, variations: it.variations.map((v) => (v._id === vid ? { ...v, ...patch } : v)),
    })));
  const removeVariation = (cid: string, sid: string | null, iid: string, vid: string) =>
    setCats((prev) => mapItemInCats(prev, cid, sid, iid, (it) => ({
      ...it, variations: it.variations.filter((v) => v._id !== vid),
    })));'''

assert old_helpers in c, "HELPERS ANCHOR NOT FOUND"
c = c.replace(old_helpers, new_helpers, 1)

# --- 5. addAll: use the new structured endpoint ---
old_addall = '''  const addAll = async () => {
    // Build clean payload, skip blank-name items / empty categories
    const clean = cats
      .map((c) => ({
        name: c.name.trim() || "Menu",
        items: c.items
          .map((i) => ({ ...i, name: i.name.trim(), price: parseInt(i.price || "0", 10) || 0 }))
          .filter((i) => i.name.length > 0),
      }))
      .filter((c) => c.items.length > 0);
    const count = clean.reduce((n, c) => n + c.items.length, 0);
    if (count === 0) { setError("Add at least one item with a name."); return; }
    setSaving(true);
    setError(null);
    try {
      // 1) Ensure categories exist (create missing ones by name)
      let existing: any[] = [];
      try { existing = (await Api.ownerCategories()) as any[]; } catch { existing = []; }
      const existingByName: Record<string, boolean> = {};
      existing.forEach((c) => { existingByName[String(c.name || "").trim().toLowerCase()] = true; });
      for (const c of clean) {
        const key = c.name.toLowerCase();
        if (!existingByName[key]) {
          try { await Api.ownerCreateCategory({ name: c.name }); existingByName[key] = true; } catch { /* non-fatal */ }
        }
      }
      // 2) Bulk-add all items (backend links category by name, marks pending approval)
      const payload = clean.flatMap((c) =>
        c.items.map((i) => ({
          name: i.name,
          description: i.description,
          price: i.price,
          category: c.name,
          veg: i.veg,
          available: true,
          is_available: true,
        })),
      );
      const res: any = await Api.ownerBulkMenu(payload);
      const created = res?.created ?? payload.length;
      if (!mounted.current) return;
      onDone(created);
    } catch (e: any) {
      if (!mounted.current) return;
      setError(e?.message || "Could not add items. Please try again.");
    } finally {
      if (mounted.current) setSaving(false);
    }
  };'''

new_addall = '''  const addAll = async () => {
    // Build clean payload, skip blank-name items / empty categories / subcategories
    const cleanItem = (i: RItem) => ({
      name: i.name.trim(),
      price: parseInt(i.price || "0", 10) || 0,
      description: i.description,
      veg: i.veg,
      variations: i.variations
        .map((v) => ({ name: v.name.trim(), price: parseInt(v.price || "0", 10) || 0 }))
        .filter((v) => v.name.length > 0),
    });
    const clean = cats
      .map((c) => ({
        name: c.name.trim() || "Menu",
        items: c.items.map(cleanItem).filter((i) => i.name.length > 0),
        subcategories: c.subcategories
          .map((s) => ({
            name: s.name.trim(),
            items: s.items.map(cleanItem).filter((i) => i.name.length > 0),
          }))
          .filter((s) => s.name.length > 0 && s.items.length > 0),
      }))
      .filter((c) => c.items.length > 0 || c.subcategories.length > 0);
    const count = clean.reduce(
      (n, c) => n + c.items.length + c.subcategories.reduce((sn, s) => sn + s.items.length, 0),
      0,
    );
    if (count === 0) { setError("Add at least one item with a name."); return; }
    setSaving(true);
    setError(null);
    try {
      const res: any = await Api.ownerImportStructuredMenu({ categories: clean });
      const created = res?.created ?? count;
      if (!mounted.current) return;
      onDone(created);
    } catch (e: any) {
      if (!mounted.current) return;
      setError(e?.message || "Could not add items. Please try again.");
    } finally {
      if (mounted.current) setSaving(false);
    }
  };'''

assert old_addall in c, "ADDALL ANCHOR NOT FOUND"
c = c.replace(old_addall, new_addall, 1)

# --- 6. Review JSX: sid-aware item calls + variations UI + subcategories UI ---
old_jsx = '''              {cats.map((c) => (
                <View key={c._id} style={styles.catCard} testID={`ai-cat-${c._id}`}>
                  <View style={styles.catHeader}>
                    <Ionicons name="pricetag" size={15} color={colors.primary} />
                    <TextInput
                      testID={`ai-cat-name-${c._id}`}
                      value={c.name}
                      onChangeText={(t) => updateCatName(c._id, t)}
                      placeholder="Category name"
                      placeholderTextColor={colors.textMuted}
                      style={styles.catNameInput}
                    />
                    <TouchableOpacity testID={`ai-cat-remove-${c._id}`} onPress={() => removeCat(c._id)} hitSlop={8} style={styles.catRemove}>
                      <Ionicons name="trash" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>

                  {c.items.map((it) => (
                    <View key={it._id} style={styles.itemRow} testID={`ai-item-${it._id}`}>
                      <TouchableOpacity onPress={() => updateItem(c._id, it._id, { veg: !it.veg })} hitSlop={6} testID={`ai-item-veg-${it._id}`}>
                        <VegDot veg={it.veg} />
                      </TouchableOpacity>
                      <View style={{ flex: 1, gap: 6 }}>
                        <TextInput
                          testID={`ai-item-name-${it._id}`}
                          value={it.name}
                          onChangeText={(t) => updateItem(c._id, it._id, { name: t })}
                          placeholder="Item name"
                          placeholderTextColor={colors.textMuted}
                          style={styles.itemName}
                        />
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={styles.priceWrap}>
                            <Text style={styles.rupee}>₹</Text>
                            <TextInput
                              testID={`ai-item-price-${it._id}`}
                              value={it.price}
                              onChangeText={(t) => updateItem(c._id, it._id, { price: t.replace(/[^0-9]/g, "") })}
                              keyboardType="number-pad"
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              style={styles.priceInput}
                            />
                          </View>
                          <Text style={styles.vegLabel}>{it.veg ? "Veg" : "Non-veg"}</Text>
                        </View>
                      </View>
                      <TouchableOpacity testID={`ai-item-remove-${it._id}`} onPress={() => removeItem(c._id, it._id)} hitSlop={8} style={styles.itemRemove}>
                        <Ionicons name="close" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity testID={`ai-cat-additem-${c._id}`} onPress={() => addItem(c._id)} style={styles.addItemBtn}>
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <Text style={styles.addItemText}>Add item</Text>
                  </TouchableOpacity>
                </View>
              ))}'''

new_jsx = '''              {cats.map((c) => (
                <View key={c._id} style={styles.catCard} testID={`ai-cat-${c._id}`}>
                  <View style={styles.catHeader}>
                    <Ionicons name="pricetag" size={15} color={colors.primary} />
                    <TextInput
                      testID={`ai-cat-name-${c._id}`}
                      value={c.name}
                      onChangeText={(t) => updateCatName(c._id, t)}
                      placeholder="Category name"
                      placeholderTextColor={colors.textMuted}
                      style={styles.catNameInput}
                    />
                    <TouchableOpacity testID={`ai-cat-remove-${c._id}`} onPress={() => removeCat(c._id)} hitSlop={8} style={styles.catRemove}>
                      <Ionicons name="trash" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>

                  {c.items.map((it) => (
                    <View key={it._id} style={styles.itemRow} testID={`ai-item-${it._id}`}>
                      <TouchableOpacity onPress={() => updateItem(c._id, null, it._id, { veg: !it.veg })} hitSlop={6} testID={`ai-item-veg-${it._id}`}>
                        <VegDot veg={it.veg} />
                      </TouchableOpacity>
                      <View style={{ flex: 1, gap: 6 }}>
                        <TextInput
                          testID={`ai-item-name-${it._id}`}
                          value={it.name}
                          onChangeText={(t) => updateItem(c._id, null, it._id, { name: t })}
                          placeholder="Item name"
                          placeholderTextColor={colors.textMuted}
                          style={styles.itemName}
                        />
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={styles.priceWrap}>
                            <Text style={styles.rupee}>₹</Text>
                            <TextInput
                              testID={`ai-item-price-${it._id}`}
                              value={it.price}
                              onChangeText={(t) => updateItem(c._id, null, it._id, { price: t.replace(/[^0-9]/g, "") })}
                              keyboardType="number-pad"
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              style={styles.priceInput}
                            />
                          </View>
                          <Text style={styles.vegLabel}>{it.veg ? "Veg" : "Non-veg"}</Text>
                        </View>
                        {it.variations.map((v) => (
                          <View key={v._id} style={styles.varRow} testID={`ai-var-${v._id}`}>
                            <TextInput
                              testID={`ai-var-name-${v._id}`}
                              value={v.name}
                              onChangeText={(t) => updateVariation(c._id, null, it._id, v._id, { name: t })}
                              placeholder="Size (e.g. Small)"
                              placeholderTextColor={colors.textMuted}
                              style={styles.varNameInput}
                            />
                            <View style={styles.priceWrap}>
                              <Text style={styles.rupee}>₹</Text>
                              <TextInput
                                testID={`ai-var-price-${v._id}`}
                                value={v.price}
                                onChangeText={(t) => updateVariation(c._id, null, it._id, v._id, { price: t.replace(/[^0-9]/g, "") })}
                                keyboardType="number-pad"
                                placeholder="0"
                                placeholderTextColor={colors.textMuted}
                                style={styles.priceInput}
                              />
                            </View>
                            <TouchableOpacity testID={`ai-var-remove-${v._id}`} onPress={() => removeVariation(c._id, null, it._id, v._id)} hitSlop={8}>
                              <Ionicons name="close" size={16} color={colors.error} />
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity testID={`ai-item-addvar-${it._id}`} onPress={() => addVariation(c._id, null, it._id)} style={styles.addVarBtn}>
                          <Ionicons name="add" size={13} color={colors.primary} />
                          <Text style={styles.addVarText}>Add size/variation</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity testID={`ai-item-remove-${it._id}`} onPress={() => removeItem(c._id, null, it._id)} hitSlop={8} style={styles.itemRemove}>
                        <Ionicons name="close" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity testID={`ai-cat-additem-${c._id}`} onPress={() => addItem(c._id, null)} style={styles.addItemBtn}>
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <Text style={styles.addItemText}>Add item</Text>
                  </TouchableOpacity>

                  {c.subcategories.map((s) => (
                    <View key={s._id} style={styles.subCard} testID={`ai-subcat-${s._id}`}>
                      <View style={styles.subHeader}>
                        <Ionicons name="folder-outline" size={13} color={colors.textSecondary} />
                        <TextInput
                          testID={`ai-subcat-name-${s._id}`}
                          value={s.name}
                          onChangeText={(t) => updateSubcatName(c._id, s._id, t)}
                          placeholder="Sub-category name (e.g. Single Topping)"
                          placeholderTextColor={colors.textMuted}
                          style={styles.subNameInput}
                        />
                        <TouchableOpacity testID={`ai-subcat-remove-${s._id}`} onPress={() => removeSubcat(c._id, s._id)} hitSlop={8}>
                          <Ionicons name="trash" size={14} color={colors.error} />
                        </TouchableOpacity>
                      </View>

                      {s.items.map((it) => (
                        <View key={it._id} style={styles.itemRow} testID={`ai-item-${it._id}`}>
                          <TouchableOpacity onPress={() => updateItem(c._id, s._id, it._id, { veg: !it.veg })} hitSlop={6} testID={`ai-item-veg-${it._id}`}>
                            <VegDot veg={it.veg} />
                          </TouchableOpacity>
                          <View style={{ flex: 1, gap: 6 }}>
                            <TextInput
                              testID={`ai-item-name-${it._id}`}
                              value={it.name}
                              onChangeText={(t) => updateItem(c._id, s._id, it._id, { name: t })}
                              placeholder="Item name"
                              placeholderTextColor={colors.textMuted}
                              style={styles.itemName}
                            />
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <View style={styles.priceWrap}>
                                <Text style={styles.rupee}>₹</Text>
                                <TextInput
                                  testID={`ai-item-price-${it._id}`}
                                  value={it.price}
                                  onChangeText={(t) => updateItem(c._id, s._id, it._id, { price: t.replace(/[^0-9]/g, "") })}
                                  keyboardType="number-pad"
                                  placeholder="0"
                                  placeholderTextColor={colors.textMuted}
                                  style={styles.priceInput}
                                />
                              </View>
                              <Text style={styles.vegLabel}>{it.veg ? "Veg" : "Non-veg"}</Text>
                            </View>
                            {it.variations.map((v) => (
                              <View key={v._id} style={styles.varRow} testID={`ai-var-${v._id}`}>
                                <TextInput
                                  testID={`ai-var-name-${v._id}`}
                                  value={v.name}
                                  onChangeText={(t) => updateVariation(c._id, s._id, it._id, v._id, { name: t })}
                                  placeholder="Size (e.g. Small)"
                                  placeholderTextColor={colors.textMuted}
                                  style={styles.varNameInput}
                                />
                                <View style={styles.priceWrap}>
                                  <Text style={styles.rupee}>₹</Text>
                                  <TextInput
                                    testID={`ai-var-price-${v._id}`}
                                    value={v.price}
                                    onChangeText={(t) => updateVariation(c._id, s._id, it._id, v._id, { price: t.replace(/[^0-9]/g, "") })}
                                    keyboardType="number-pad"
                                    placeholder="0"
                                    placeholderTextColor={colors.textMuted}
                                    style={styles.priceInput}
                                  />
                                </View>
                                <TouchableOpacity testID={`ai-var-remove-${v._id}`} onPress={() => removeVariation(c._id, s._id, it._id, v._id)} hitSlop={8}>
                                  <Ionicons name="close" size={16} color={colors.error} />
                                </TouchableOpacity>
                              </View>
                            ))}
                            <TouchableOpacity testID={`ai-item-addvar-${it._id}`} onPress={() => addVariation(c._id, s._id, it._id)} style={styles.addVarBtn}>
                              <Ionicons name="add" size={13} color={colors.primary} />
                              <Text style={styles.addVarText}>Add size/variation</Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity testID={`ai-item-remove-${it._id}`} onPress={() => removeItem(c._id, s._id, it._id)} hitSlop={8} style={styles.itemRemove}>
                            <Ionicons name="close" size={18} color={colors.error} />
                          </TouchableOpacity>
                        </View>
                      ))}

                      <TouchableOpacity testID={`ai-subcat-additem-${s._id}`} onPress={() => addItem(c._id, s._id)} style={styles.addItemBtn}>
                        <Ionicons name="add" size={16} color={colors.primary} />
                        <Text style={styles.addItemText}>Add item</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity testID={`ai-cat-addsubcat-${c._id}`} onPress={() => addSubcat(c._id)} style={styles.addSubcatBtn}>
                    <Ionicons name="add-circle-outline" size={15} color={colors.textSecondary} />
                    <Text style={styles.addSubcatText}>Add sub-category</Text>
                  </TouchableOpacity>
                </View>
              ))}'''

assert old_jsx in c, "JSX ANCHOR NOT FOUND"
c = c.replace(old_jsx, new_jsx, 1)

# --- 7. Styles: add variation + subcategory styles ---
old_styles = '''  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
});'''

new_styles = '''  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },

  varRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  varNameInput: { flex: 1, fontSize: 12.5, fontWeight: font.semi, color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  addVarBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, alignSelf: "flex-start" },
  addVarText: { fontSize: 11.5, fontWeight: font.bold, color: colors.primary },

  subCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", padding: spacing.sm, marginTop: spacing.sm },
  subHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  subNameInput: { flex: 1, fontSize: 13, fontWeight: font.bold, color: colors.textPrimary, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 },

  addSubcatBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: radius.md, marginTop: 6 },
  addSubcatText: { fontSize: 12.5, fontWeight: font.bold, color: colors.textSecondary },
});'''

assert old_styles in c, "STYLES ANCHOR NOT FOUND"
c = c.replace(old_styles, new_styles, 1)

with open(path, "w") as f:
    f.write(c)
print("ALL 7 FRONTEND PATCHES APPLIED SUCCESSFULLY")
