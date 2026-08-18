#!/usr/bin/env python3
"""
patch_outlet_map.py

frontend/app/owner/outlet.tsx

Embeds the GoogleMapPicker component (the same one used on the customer
address screen, which already auto-centers on the device's real location)
into the "Name, Address & Location" section. Dragging the map or letting it
auto-locate updates f.lat / f.lng / f.address / f.city / f.pincode directly.
The existing manual Latitude/Longitude fields and "View on map" link are
left in place as a fallback / for fine-tuning.

Usage:
    cd ~/original_version
    python3 patch_outlet_map.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "frontend" / "app" / "owner" / "outlet.tsx"


def apply_patch(path: Path, old: str, new: str, label: str) -> bool:
    if not path.exists():
        print(f"[SKIP] {label}: file not found at {path}")
        return False
    text = path.read_text(encoding="utf-8")

    if new.strip() and new in text:
        print(f"[OK]   {label}: already patched, nothing to do")
        return True

    count = text.count(old)
    if count == 0:
        print(f"[FAIL] {label}: could not find the expected original code.")
        print("       No changes made to this file for this step.")
        return False
    if count > 1:
        print(f"[FAIL] {label}: found {count} matches, expected exactly 1 — refusing to guess.")
        print("       No changes made to this file for this step.")
        return False

    backup = path.with_suffix(path.suffix + ".bak")
    if not backup.exists():
        backup.write_text(text, encoding="utf-8")
        print(f"       backup written: {backup}")

    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"[DONE] {label}: patched {path}")
    return True


# ---------------------------------------------------------------------------
# 1. import GoogleMapPicker
# ---------------------------------------------------------------------------

IMPORT_OLD = '''import { TimeInput } from "@/src/components/form";'''

IMPORT_NEW = '''import { TimeInput } from "@/src/components/form";
import { GoogleMapPicker } from "@/src/components/GoogleMapPicker";'''


# ---------------------------------------------------------------------------
# 2. embed the picker in the Location section
# ---------------------------------------------------------------------------

SECTION_OLD = '''          <Section title="Name, Address & Location" icon="location">
            <Field label="Address" value={f.address} onChangeText={set("address")} placeholder="Street address" multiline />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Field label="City" value={f.city} onChangeText={set("city")} placeholder="City" /></View>
              <View style={{ flex: 1 }}><Field label="Pincode" value={f.pincode} onChangeText={set("pincode")} placeholder="560001" keyboardType="numeric" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Field label="Latitude" value={f.lat} onChangeText={set("lat")} placeholder="12.97" keyboardType="numeric" /></View>
              <View style={{ flex: 1 }}><Field label="Longitude" value={f.lng} onChangeText={set("lng")} placeholder="77.59" keyboardType="numeric" /></View>
            </View>
            <TouchableOpacity onPress={openMap} style={styles.mapBtn} testID="view-on-map">
              <Ionicons name="map" size={16} color={colors.primary} /><Text style={styles.mapTxt}>View on map</Text>
            </TouchableOpacity>
          </Section>'''

SECTION_NEW = '''          <Section title="Name, Address & Location" icon="location">
            <Field label="Address" value={f.address} onChangeText={set("address")} placeholder="Street address" multiline />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Field label="City" value={f.city} onChangeText={set("city")} placeholder="City" /></View>
              <View style={{ flex: 1 }}><Field label="Pincode" value={f.pincode} onChangeText={set("pincode")} placeholder="560001" keyboardType="numeric" /></View>
            </View>
            <Text style={styles.label}>Pin your outlet's exact location</Text>
            <View style={{ marginBottom: spacing.md }}>
              <GoogleMapPicker
                lat={f.lat ? parseFloat(f.lat) : undefined}
                lng={f.lng ? parseFloat(f.lng) : undefined}
                height={260}
                onChange={(loc) => setF((p: any) => ({
                  ...p,
                  lat: String(loc.lat),
                  lng: String(loc.lng),
                  address: loc.address || p.address,
                  city: loc.city || p.city,
                  pincode: loc.pincode || p.pincode,
                }))}
              />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}><Field label="Latitude" value={f.lat} onChangeText={set("lat")} placeholder="12.97" keyboardType="numeric" /></View>
              <View style={{ flex: 1 }}><Field label="Longitude" value={f.lng} onChangeText={set("lng")} placeholder="77.59" keyboardType="numeric" /></View>
            </View>
            <TouchableOpacity onPress={openMap} style={styles.mapBtn} testID="view-on-map">
              <Ionicons name="map" size={16} color={colors.primary} /><Text style={styles.mapTxt}>View on map</Text>
            </TouchableOpacity>
          </Section>'''


def main() -> int:
    ok1 = apply_patch(TARGET, IMPORT_OLD, IMPORT_NEW, "import GoogleMapPicker")
    ok2 = apply_patch(TARGET, SECTION_OLD, SECTION_NEW, "embed map picker in Location section")

    print()
    if ok1 and ok2:
        print("Patch applied (or already present). Redeploy frontend and test:")
        print("  Owner app -> Outlet Information -> Name, Address & Location")
        print("  The map should auto-center on the device's real location; drag/search")
        print("  to fine-tune, then tap Save Changes to persist lat/lng.")
        return 0
    print("One or more steps did NOT apply — see [FAIL]/[SKIP] above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
