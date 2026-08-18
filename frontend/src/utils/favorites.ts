// Favorite restaurants — persisted locally per device.
import { loadJson, saveJson } from "@/src/utils/store-json";

const KEY = "fav_restaurants";

export async function getFavIds(): Promise<string[]> {
  return loadJson<string[]>(KEY, []);
}

export async function isFav(id: string): Promise<boolean> {
  const ids = await getFavIds();
  return ids.includes(id);
}

export async function toggleFav(id: string): Promise<boolean> {
  const ids = await getFavIds();
  const i = ids.indexOf(id);
  if (i >= 0) ids.splice(i, 1);
  else ids.push(id);
  await saveJson(KEY, ids);
  return ids.includes(id);
}
