import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Api } from "@/src/api";

/**
 * Shares the rider's REAL device location for a given order using the browser
 * Geolocation API (watchPosition) and pushes updates to the backend
 * (PATCH /orders/{id}/rider-location), throttled to ~4s. The customer's order
 * tracking map then shows the rider moving live.
 */
export function useRiderLocationShare() {
  const [sharingOrderId, setSharingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const watchId = useRef<number | null>(null);
  const lastPush = useRef<number>(0);
  const orderRef = useRef<string | null>(null);

  const supported =
    Platform.OS !== "web" || (typeof navigator !== "undefined" && !!navigator.geolocation);

  const stop = useCallback(() => {
    if (watchId.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        navigator.geolocation.clearWatch(watchId.current);
      } catch {}
    }
    watchId.current = null;
    orderRef.current = null;
    setSharingOrderId(null);
  }, []);

  const start = useCallback(
    (orderId: string) => {
      setError("");
      if (Platform.OS !== "web" || typeof navigator === "undefined" || !navigator.geolocation) {
        setError("Live location is only available on the web build of the app.");
        return;
      }
      // stop any prior watch
      if (watchId.current != null) {
        try {
          navigator.geolocation.clearWatch(watchId.current);
        } catch {}
      }
      orderRef.current = orderId;
      setSharingOrderId(orderId);
      watchId.current = navigator.geolocation.watchPosition(
        async (pos) => {
          const now = Date.now();
          if (now - lastPush.current < 4000) return; // throttle
          lastPush.current = now;
          try {
            await Api.riderLocation(orderId, pos.coords.latitude, pos.coords.longitude);
          } catch {
            /* ignore transient push errors */
          }
        },
        (err) => {
          setError(
            err.code === 1
              ? "Location permission denied. Allow location access to share live tracking."
              : "Couldn't get your location. Check GPS / permissions.",
          );
          stop();
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
      );
    },
    [stop],
  );

  useEffect(() => () => stop(), [stop]);

  return { sharingOrderId, start, stop, supported, error };
}
