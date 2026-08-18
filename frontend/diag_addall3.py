path = "src/components/AiMenuImportModal.tsx"
src = open(path, encoding="utf-8").read()

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

print("old_addall length:", len(old_addall))
idx = src.find("  const addAll = async () => {")
print("found at index:", idx)
if idx == -1:
    print("NOT FOUND AT ALL")
else:
    live = src[idx:idx+len(old_addall)]
    print("live slice length:", len(live))
    print("EQUAL:", live == old_addall)
    if live != old_addall:
        n = min(len(old_addall), len(live))
        diff_found = False
        for i in range(n):
            if old_addall[i] != live[i]:
                print(f"First diff at char {i}: expected {old_addall[i]!r}, got {live[i]!r}")
                print("context expected:", repr(old_addall[max(0,i-40):i+40]))
                print("context live    :", repr(live[max(0,i-40):i+40]))
                diff_found = True
                break
        if not diff_found:
            print("No char diff in common prefix; length mismatch only.")
            print("old tail:", repr(old_addall[n-40:n]))
            print("live tail:", repr(live[n-40:n] if len(live) >= n else live))
