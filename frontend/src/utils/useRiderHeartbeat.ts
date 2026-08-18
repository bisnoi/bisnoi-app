import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { Api } from "@/src/api";

/**
 * Rider anti-fraud + dispatch backbone.
 *
 * While the rider is signed in AND online, this hook:
 *   1. Grabs the phone's live GPS via browser Geolocation API.
 *   2. Pushes {lat,lng} to POST /api/rider/heartbeat every ~30s.
 *   3. Also emits an immediate heartbeat the moment the coordinates change
 *      significantly (>=25 m) so nearby dispatch always uses fresh data.
 *
 * Backend uses `last_heartbeat_at` (<HEARTBEAT_STALE_SECS) + last_lat/lng to
 * pick the CLOSEST online rider on `/orders/{oid}/status accepted`. Without
 * this hook the fallback broadcast blasts every online rider — including
 * riders 40 km away — which is exactly the bug we're fixing.
 *
 * `enabled` should be true only when: user.role === "rider" AND user.is_online.
 */
export function useRiderHeartbeat(enabled: boolean) {
  const watchId = useRef<number | null>(null);
  const timerId = useRef<any>(null);
  const lastCoord = useRef<{ lat: number; lng: number } | null>(null);
  const lastPushAt = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS !== "web") return; // web-only for now
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const HEARTBEAT_MS = 30_000; // 30 s
    const MIN_MOVE_M = 25;       // send early if moved 25 m

    const push = async (lat: number, lng: number) => {
      lastPushAt.current = Date.now();
      lastCoord.current = { lat, lng };
      try {
        await Api.riderHeartbeat(lat, lng);
      } catch {
        /* transient — will retry on next tick */
      }
    };

    // Haversine distance (meters) between two coords — small, no import.
    const distM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 6371000;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const s1 =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s1));
    };

    // Live watch: fires on every meaningful GPS update
    try {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          const now = Date.now();
          const prev = lastCoord.current;
          const moved = prev ? distM(prev, { lat, lng }) : Infinity;
          // Push if 30s elapsed OR rider moved > MIN_MOVE_M
          if (now - lastPushAt.current >= HEARTBEAT_MS || moved >= MIN_MOVE_M) {
            push(lat, lng);
          }
        },
        () => { /* permission denied or GPS off — silent, we retry on next mount */ },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      );
    } catch {}

    // Fallback interval: even without GPS movement, ping every 30 s from the
    // last known coords so the server keeps counting us as ONLINE.
    timerId.current = setInterval(() => {
      const c = lastCoord.current;
      if (!c) {
        // No fix yet — try a one-shot getCurrentPosition to prime lastCoord
        try {
          navigator.geolocation.getCurrentPosition(
            (pos) => push(pos.coords.latitude, pos.coords.longitude),
            () => {},
            { enableHighAccuracy: false, maximumAge: 15000, timeout: 12000 },
          );
        } catch {}
        return;
      }
      if (Date.now() - lastPushAt.current >= HEARTBEAT_MS) {
        push(c.lat, c.lng);
      }
    }, HEARTBEAT_MS);

    return () => {
      if (watchId.current != null) {
        try { navigator.geolocation.clearWatch(watchId.current); } catch {}
        watchId.current = null;
      }
      if (timerId.current) {
        clearInterval(timerId.current);
        timerId.current = null;
      }
    };
  }, [enabled]);
}
