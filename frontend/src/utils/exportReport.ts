import { Platform } from "react-native";

export type Col = { key: string; label: string };

function downloadBlob(content: string, filename: string, mime: string): boolean {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function csvEscape(v: any): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function htmlEscape(v: any): string {
  const s = v == null ? "" : String(v);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Download a CSV file. Returns false on native (not supported). */
export function exportCSV(
  filename: string,
  cols: Col[],
  rows: any[],
  summaryPairs: [string, string][] = [],
): boolean {
  const lines: string[] = [];
  if (summaryPairs.length) {
    for (const [k, v] of summaryPairs) lines.push(`${csvEscape(k)},${csvEscape(v)}`);
    lines.push("");
  }
  lines.push(cols.map((c) => csvEscape(c.label)).join(","));
  for (const r of rows) lines.push(cols.map((c) => csvEscape(r[c.key])).join(","));
  return downloadBlob("\uFEFF" + lines.join("\n"), filename, "text/csv;charset=utf-8;");
}

/**
 * Open a print-ready report in a new tab and trigger the browser's print
 * dialog (Save as PDF). This is dependency-free and reliable on web.
 */
export function exportPDF(
  title: string,
  subtitle: string,
  summaryPairs: [string, string][],
  cols: Col[],
  rows: any[],
): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  const summaryHtml = summaryPairs
    .map(([k, v]) => `<div class="card"><div class="k">${htmlEscape(k)}</div><div class="v">${htmlEscape(v)}</div></div>`)
    .join("");
  const head = cols.map((c) => `<th>${htmlEscape(c.label)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${cols.map((c) => `<td>${htmlEscape(r[c.key])}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>${htmlEscape(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1A1A1A; margin: 28px; }
  .brand { color: #2D7A4D; font-weight: 800; font-size: 13px; letter-spacing: 1px; }
  h1 { font-size: 22px; margin: 4px 0 2px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 18px; }
  .cards { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
  .card { border: 1px solid #E2E2E2; border-radius: 10px; padding: 10px 14px; min-width: 150px; }
  .card .k { font-size: 11px; color: #777; text-transform: uppercase; letter-spacing: .4px; }
  .card .v { font-size: 18px; font-weight: 800; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; background: #F2F7F4; color: #2D7A4D; padding: 8px 10px; border-bottom: 2px solid #2D7A4D; }
  td { padding: 7px 10px; border-bottom: 1px solid #EEE; }
  tr:nth-child(even) td { background: #FAFAFA; }
  .foot { margin-top: 18px; color: #999; font-size: 10px; }
  @media print { body { margin: 12px; } }
</style></head>
<body>
  <div class="brand">BISNOI</div>
  <h1>${htmlEscape(title)}</h1>
  <div class="sub">${htmlEscape(subtitle)}</div>
  <div class="cards">${summaryHtml}</div>
  <table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}">No records in this period.</td></tr>`}</tbody></table>
  <div class="foot">Generated on ${new Date().toLocaleString()} • Bisnoi</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
