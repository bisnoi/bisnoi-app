import { useCallback } from "react";
import { useRouter, usePathname } from "expo-router";

// Sensible "home" to land on when there is no navigation history to go back to
// (e.g. the page was opened directly via URL, or the app was reloaded — which
// resets expo-router's in-memory stack so router.back() would otherwise no-op).
export function fallbackFor(pathname: string | null | undefined): string {
  const p = pathname || "";
  if (p.startsWith("/admin")) return "/admin";
  if (p.startsWith("/owner")) return "/owner";
  if (p.startsWith("/rider")) return "/rider";
  if (p.startsWith("/customer")) return "/customer";
  if (p.startsWith("/restaurant") || p.startsWith("/checkout") || p.startsWith("/order")) return "/customer";
  return "/";
}

/**
 * Returns a back handler that always works:
 *  - if there is history in the navigation stack -> go back
 *  - otherwise -> replace with a sensible fallback route (role home)
 *
 * @param fallback optional explicit fallback route (overrides the computed one)
 */
export function useSmartBack(fallback?: string): () => void {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(() => {
    try {
      const r: any = router;
      if (typeof r.canGoBack === "function" && r.canGoBack()) {
        router.back();
        return;
      }
    } catch {
      /* ignore and fall through to replace */
    }
    const target = (fallback || fallbackFor(pathname)) as any;
    router.replace(target);
  }, [router, pathname, fallback]);
}
