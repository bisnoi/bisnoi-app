// Web Audio based alert sounds for Bisnoi (web PWA).
// - startRing()/stopRing(): loud, looping "tring tring" telephone bell (owner new-order).
// - playChime(): single pleasant ding (customer status update).
// - playPickup(): short triple-beep (rider new pickup).
// - startDineinVoiceAlert()/stopDineinVoiceAlert(): spoken "Order from Table X,
//   please accept" repeated until acknowledged. Works on web AND native (uses
//   expo-speech, which is a thin wrapper over the OS/browser TTS engine).
// All guarded so they are safe no-ops if Web Audio is unavailable.
import * as Speech from "expo-speech";

type Ctx = AudioContext | null;

let _ctx: Ctx = null;
let _master: GainNode | null = null;
let _ringTimer: any = null;
let _ringing = false;
let _ringKind: "online" | "dinein" = "online";

function getCtx(): Ctx {
  try {
    if (typeof window === "undefined") return null;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!_ctx) {
      const created = new AC();
      _ctx = created;
      const gain = created.createGain();
      _master = gain;
      gain.gain.value = 0.9; // high volume
      gain.connect(created.destination);
    }
    return _ctx;
  } catch {
    return null;
  }
}

/** Resume the AudioContext — must be called from a user gesture at least once. */
export function primeAudio() {
  const ctx = getCtx();
  try {
    if (ctx && ctx.state === "suspended") ctx.resume();
    // Play an inaudible blip to fully unlock on iOS/Safari.
    if (ctx) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.00001;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.02);
    }
  } catch {
    /* ignore */
  }
}

export function audioReady(): boolean {
  const ctx = getCtx();
  return !!ctx && ctx.state === "running";
}

// One double-trill "tring tring" burst starting at time t0.
function _bell(ctx: AudioContext, t0: number) {
  const trill = (start: number) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.connect(g);
    g.connect(_master || ctx.destination);
    // Rapidly alternate two frequencies => classic bell trill.
    for (let i = 0; i < 10; i++) {
      osc.frequency.setValueAtTime(i % 2 ? 1480 : 1180, start + i * 0.045);
    }
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.9, start + 0.02);
    g.gain.setValueAtTime(0.9, start + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.46);
    osc.start(start);
    osc.stop(start + 0.48);
  };
  trill(t0);
  trill(t0 + 0.55);
}

// Dine-in alert: a warm two-note "ding-dong" door chime — deliberately distinct
// from the shrill telephone trill used for online/delivery orders.
function _doorChime(ctx: AudioContext, t0: number) {
  const note = (freq: number, start: number, dur: number) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.connect(g);
    g.connect(_master || ctx.destination);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.9, start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  };
  // "Ding" (higher) then "Dong" (lower) — classic doorbell.
  note(880, t0, 0.5);          // A5 ding
  note(587.33, t0 + 0.42, 0.85); // D5 dong (longer, resonant)
}

/** Start the looping ring. Idempotent — safe to call repeatedly.
 *  kind: "online" (delivery/takeaway) uses the telephone bell;
 *        "dinein" uses a distinct door-chime so owners can tell them apart. */
export function startRing(kind: "online" | "dinein" = "online") {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  if (_ringing && _ringKind === kind) return;
  const switching = _ringing && _ringKind !== kind;
  _ringKind = kind;
  if (switching) {
    // change of sound: fire the new sound immediately, keep the loop running
    try { (kind === "dinein" ? _doorChime : _bell)(ctx, ctx.currentTime + 0.04); } catch { /* ignore */ }
    return;
  }
  _ringing = true;
  const fire = () => {
    const c = getCtx();
    if (!c || !_ringing) return;
    try {
      (_ringKind === "dinein" ? _doorChime : _bell)(c, c.currentTime + 0.04);
    } catch {
      /* ignore */
    }
  };
  fire();
  _ringTimer = setInterval(fire, 2400); // ring ~every 2.4s
}

export function stopRing() {
  _ringing = false;
  if (_ringTimer) {
    clearInterval(_ringTimer);
    _ringTimer = null;
  }
}

export function isRinging(): boolean {
  return _ringing;
}

/** Single pleasant two-note ding (customer order update). */
export function playChime() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const notes = [880, 1318.5];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    o.connect(g);
    g.connect(_master || ctx.destination);
    const start = ctx.currentTime + i * 0.16;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.7, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
    o.start(start);
    o.stop(start + 0.34);
  });
}

/** Short triple-beep alert (rider new pickup). */
export function playPickup() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  for (let i = 0; i < 3; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 1320;
    o.connect(g);
    g.connect(_master || ctx.destination);
    const start = ctx.currentTime + i * 0.18;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.5, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
    o.start(start);
    o.stop(start + 0.15);
  }
}

/** Prep-time-out alert: a distinct urgent double beep played once when a
 *  restaurant order's preparation window expires (green → red timer flip). */
export function playPrepTimeout() {
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
}
