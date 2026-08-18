#!/usr/bin/env python3
import shutil, sys

def patch(path, replacements):
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    for label, old, new in replacements:
        n = src.count(old)
        if n != 1:
            print(f"[ABORT] '{label}' in {path}: expected 1 match, found {n}")
            sys.exit(1)
        src = src.replace(old, new, 1)
    shutil.copy(path, path + ".bak")
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"[OK] Patched {path}")

# ---------------- ring.ts: add TTS voice-alert (web + native via expo-speech) ----------------
patch("frontend/src/utils/ring.ts", [
(
"import expo-speech",
'''// Web Audio based alert sounds for Bisnoi (web PWA).
// - startRing()/stopRing(): loud, looping "tring tring" telephone bell (owner new-order).
// - playChime(): single pleasant ding (customer status update).
// - playPickup(): short triple-beep (rider new pickup).
// All guarded so they are safe no-ops if Web Audio is unavailable.''',
'''// Web Audio based alert sounds for Bisnoi (web PWA).
// - startRing()/stopRing(): loud, looping "tring tring" telephone bell (owner new-order).
// - playChime(): single pleasant ding (customer status update).
// - playPickup(): short triple-beep (rider new pickup).
// - startDineinVoiceAlert()/stopDineinVoiceAlert(): spoken "Order from Table X,
//   please accept" repeated until acknowledged. Works on web AND native (uses
//   expo-speech, which is a thin wrapper over the OS/browser TTS engine).
// All guarded so they are safe no-ops if Web Audio is unavailable.
import * as Speech from "expo-speech";''',
),
(
"append TTS functions at end of file",
'''export function playPrepTimeout() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  // Two urgent beeps at ~980Hz — attention-grabbing but not alarming.
  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 980;
    o.connect(g);
    g.connect(_master || ctx.destination);
    const start = ctx.currentTime + i * 0.32;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.8, start + 0.02);
    g.gain.setValueAtTime(0.8, start + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
    o.start(start);
    o.stop(start + 0.28);
  }
}''',
'''export function playPrepTimeout() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  // Two urgent beeps at ~980Hz — attention-grabbing but not alarming.
  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 980;
    o.connect(g);
    g.connect(_master || ctx.destination);
    const start = ctx.currentTime + i * 0.32;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.8, start + 0.02);
    g.gain.setValueAtTime(0.8, start + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
    o.start(start);
    o.stop(start + 0.28);
  }
}

// ---------------------------------------------------------------------------
// Dine-in spoken alert: "Order from Table 5, please accept" — repeats every
// ~7s until stopDineinVoiceAlert() is called (owner accepts/silences).
// getMessage() is called fresh on every repeat so the announcement always
// reflects the CURRENT set of pending tables, even as new orders arrive or
// old ones get accepted mid-loop.
// ---------------------------------------------------------------------------
let _speechTimer: any = null;
let _speaking = false;

export function startDineinVoiceAlert(getMessage: () => string) {
  _speaking = true;
  const speak = () => {
    if (!_speaking) return;
    const msg = getMessage();
    if (!msg) return;
    try {
      Speech.stop();
      Speech.speak(msg, { rate: 0.95, pitch: 1.0 });
    } catch {
      /* ignore — TTS unavailable */
    }
  };
  if (_speechTimer) clearInterval(_speechTimer);
  speak();
  _speechTimer = setInterval(speak, 7000);
}

export function stopDineinVoiceAlert() {
  _speaking = false;
  if (_speechTimer) {
    clearInterval(_speechTimer);
    _speechTimer = null;
  }
  try {
    Speech.stop();
  } catch {
    /* ignore */
  }
}

/** Builds the spoken sentence for the given pending dine-in table labels. */
export function dineinVoiceMessage(labels: string[]): string {
  const uniq = Array.from(new Set(labels.filter(Boolean)));
  if (uniq.length === 0) return "";
  if (uniq.length === 1) return `Order from ${uniq[0]}, please accept`;
  return `Orders from ${uniq.slice(0, -1).join(", ")} and ${uniq[uniq.length - 1]}, please accept`;
}''',
),
])

# ---------------- OrderAlerts.tsx: wire the voice alert into the existing ring/banner cycle ----------------
patch("frontend/src/components/OrderAlerts.tsx", [
(
"import new ring functions",
'''import { startRing, stopRing, playChime, playPickup, primeAudio } from "@/src/utils/ring";''',
'''import { startRing, stopRing, playChime, playPickup, primeAudio, startDineinVoiceAlert, stopDineinVoiceAlert, dineinVoiceMessage } from "@/src/utils/ring";''',
),
(
"add dineinTablesRef",
'''  const placedIdsRef = useRef<string[]>([]);
  const dineinPlacedIdsRef = useRef<string[]>([]);''',
'''  const placedIdsRef = useRef<string[]>([]);
  const dineinPlacedIdsRef = useRef<string[]>([]);
  const dineinTableLabelsRef = useRef<string[]>([]);''',
),
(
"start/stop voice alert alongside ring",
'''          if (ringable.length > 0) {
            // Dine-in orders get a distinct "door chime"; online/delivery gets the telephone bell.
            startRing(ringableDinein.length > 0 ? "dinein" : "online");
            setOwnerCount(ringable.length);
            setHasDinein(ringableDinein.length > 0);
          } else {
            stopRing();
            setOwnerCount(0);
            setHasDinein(false);
          }''',
'''          dineinTableLabelsRef.current = ringableDinein.map((o: any) => o.table_label).filter(Boolean);
          if (ringable.length > 0) {
            // Dine-in orders get a distinct "door chime"; online/delivery gets the telephone bell.
            startRing(ringableDinein.length > 0 ? "dinein" : "online");
            setOwnerCount(ringable.length);
            setHasDinein(ringableDinein.length > 0);
            if (ringableDinein.length > 0) {
              startDineinVoiceAlert(() => dineinVoiceMessage(dineinTableLabelsRef.current));
            } else {
              stopDineinVoiceAlert();
            }
          } else {
            stopRing();
            stopDineinVoiceAlert();
            setOwnerCount(0);
            setHasDinein(false);
          }''',
),
(
"cleanup effect stops voice alert too",
'''    return () => {
      clearInterval(id);
      clearTimeout(toastTimer.current);
      stopRing();
      if (hasWebListeners) {
        window.removeEventListener("pointerdown", prime);
        window.removeEventListener("keydown", prime);
      }
    };''',
'''    return () => {
      clearInterval(id);
      clearTimeout(toastTimer.current);
      stopRing();
      stopDineinVoiceAlert();
      if (hasWebListeners) {
        window.removeEventListener("pointerdown", prime);
        window.removeEventListener("keydown", prime);
      }
    };''',
),
(
"ackOwner stops voice alert",
'''  const ackOwner = async (navigate: boolean) => {
    primeAudio();
    stopRing();''',
'''  const ackOwner = async (navigate: boolean) => {
    primeAudio();
    stopRing();
    stopDineinVoiceAlert();''',
),
])
