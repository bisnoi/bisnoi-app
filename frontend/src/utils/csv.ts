// Minimal CSV parser for bulk menu import.
// Supports quoted fields, commas inside quotes, and escaped double-quotes ("").
export type CsvRow = Record<string, string>;

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") pushField();
      else if (c === "\n") { pushField(); pushRow(); }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  // last field/row
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }

  // filter completely empty rows
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (clean.length === 0) return [];
  const headers = clean[0].map((h) => h.trim().toLowerCase());
  return clean.slice(1).map((r) => {
    const obj: CsvRow = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
    return obj;
  });
}

const truthy = (v?: string) => {
  const s = (v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "veg" || s === "y";
};

export type ParsedMenuItem = {
  name: string;
  price: number;
  description: string;
  category: string;
  veg: boolean;
  image: string;
  prep_time: number;
};

// Map CSV rows -> menu item payloads. Accepts flexible header names.
export function rowsToMenuItems(rows: CsvRow[]): { items: ParsedMenuItem[]; errors: string[] } {
  const items: ParsedMenuItem[] = [];
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const name = r["name"] || r["item"] || r["title"] || "";
    const priceRaw = r["price"] || r["amount"] || r["cost"] || "";
    const price = parseInt(String(priceRaw).replace(/[^0-9]/g, ""), 10);
    if (!name) { errors.push(`Row ${i + 2}: missing name`); return; }
    if (!price || isNaN(price)) { errors.push(`Row ${i + 2}: invalid price for "${name}"`); return; }
    items.push({
      name,
      price,
      description: r["description"] || r["desc"] || "",
      category: r["category"] || r["cat"] || "",
      veg: r["veg"] !== undefined || r["is_veg"] !== undefined ? truthy(r["veg"] ?? r["is_veg"]) : true,
      image: r["image"] || r["image_url"] || r["img"] || r["photo"] || "",
      prep_time: parseInt(r["prep_time"] || r["prep"] || "15", 10) || 15,
    });
  });
  return { items, errors };
}

export const CSV_SAMPLE =
  "name,price,category,veg,description,image\n" +
  "Paneer Tikka,220,Starters,true,Smoky cottage cheese,https://images.unsplash.com/photo-1596797038530-2c107229654b?w=400\n" +
  "Veg Dum Biryani,260,Main Course,true,Hyderabadi veg dum biryani,\n" +
  "Gulab Jamun,90,Desserts,true,Two pieces,";

// Blank-ish template the owner can download, fill and re-upload.
// Header row + 2 example rows so the expected format is obvious.
export const CSV_TEMPLATE =
  "name,price,category,veg,description,image\n" +
  "Masala Dosa,120,South Indian,true,Crispy dosa with potato masala,\n" +
  "Paneer Butter Masala,320,Main Course,true,Creamy tomato gravy,\n";

// Trigger a client-side download of a CSV file (web only).
export function downloadCsv(filename: string, content: string) {
  if (typeof document === "undefined") return;
  try {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // no-op
  }
}
