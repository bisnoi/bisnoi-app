path = "src/components/AiMenuImportModal.tsx"
with open(path) as f:
    c = f.read()

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

with open(path, "w") as f:
    f.write(c)
print("PATCH 2 (addAll) APPLIED")
