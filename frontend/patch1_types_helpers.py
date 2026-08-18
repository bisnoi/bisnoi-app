path = "src/components/AiMenuImportModal.tsx"
with open(path) as f:
    c = f.read()

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

old_uid = '''const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;'''

new_uid = '''const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

with open(path, "w") as f:
    f.write(c)
print("PATCH 1 (types/uid/mapping/helpers) APPLIED")
