path = "src/components/AiMenuImportModal.tsx"
with open(path) as f:
    c = f.read()

with open("addall_live.txt") as f:
    old_addall = f.read()

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
print("PATCH 2 (addAll) APPLIED, new length:", len(c))
