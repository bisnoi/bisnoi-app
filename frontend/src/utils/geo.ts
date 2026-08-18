import { hydrateCachedLocation, refreshCachedLocation } from "@/src/components/LocationPrompt";
import { storage } from "@/src/utils/storage";

const GKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined;
const LABEL_KEY = "last_geo_label_v1";
const TTL = 15 * 60 * 1000; // 15 minutes

type LabelCache = { label: string; lat: number; lng: number; at: number };

function fallbackLabel(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}\u00b0${ns}, ${Math.abs(lng).toFixed(2)}\u00b0${ew}`;
}

/** Reverse-geocode lat/lng to a short "Locality, City" label via Google Maps. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fb = fallbackLabel(lat, lng);
  if (!GKEY) return fb;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GKEY}`;
    const res = await fetch(url);
    const json: any = await res.json();
    if (json.status !== "OK" || !json.results?.length) return fb;
    const comps = (json.results[0].address_components as any[]) || [];
    const pick = (types: string[]) =>
      comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name as string | undefined;
    const locality = pick(["sublocality", "sublocality_level_1", "neighborhood"]);
    const city = pick(["locality", "administrative_area_level_2", "administrative_area_level_1"]);
    if (locality && city && locality !== city) return `${locality}, ${city}`;
    return locality || city || (json.results[0].formatted_address as string) || fb;
  } catch {
    return fb;
  }
}

async function readLabelCache(): Promise<LabelCache | null> {
  try {
    const raw = await storage.getItem<string>(LABEL_KEY, "");
    return raw ? (JSON.parse(raw) as LabelCache) : null;
  } catch {
    return null;
  }
}

function writeLabelCache(c: LabelCache) {
  storage.setItem(LABEL_KEY, JSON.stringify(c)).catch(() => {});
}

/**
 * Returns a location label from cache, or by reverse-geocoding the cached
 * coordinates. Uses a 15-min TTL cache to avoid repeat Geocoding API calls.
 * Returns null if there is no cached position yet.
 */
export async function getLocationLabel(): Promise<string | null> {
  // Await hydration rather than reading the mirror directly — on native the
  // cache lives in AsyncStorage and may not have loaded yet on first render.
  const geo = await hydrateCachedLocation();
  if (!geo) return null;
  const cached = await readLabelCache();
  if (
    cached &&
    Date.now() - cached.at < TTL &&
    Math.abs(cached.lat - geo.lat) < 0.0015 &&
    Math.abs(cached.lng - geo.lng) < 0.0015
  ) {
    return cached.label;
  }
  const label = await reverseGeocode(geo.lat, geo.lng);
  writeLabelCache({ label, lat: geo.lat, lng: geo.lng, at: Date.now() });
  return label;
}

/**
 * Actively detect the user's location (triggers the browser popup if needed),
 * reverse-geocode it and return the resolved label. Returns null on failure.
 */
export async function detectLocation(): Promise<string | null> {
  const geo = await refreshCachedLocation(true);
  if (!geo) return null;
  const label = await reverseGeocode(geo.lat, geo.lng);
  writeLabelCache({ label, lat: geo.lat, lng: geo.lng, at: Date.now() });
  return label;
}
