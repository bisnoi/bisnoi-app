import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useAuth, type Role } from "@/src/auth";

const HOME_FOR_ROLE: Record<Role, string> = {
  customer: "/customer",
  restaurant_owner: "/owner",
  restaurant_staff: "/owner",
  rider: "/rider",
  admin: "/admin",
  admin_staff: "/admin",
};

/**
 * Guards a role-restricted route group (e.g. /owner, /admin, /rider).
 *
 * If the signed-in user's role isn't one of `allowed`, they're bounced to
 * their own home screen instead of being able to view that console just by
 * typing the URL — e.g. a logged-in customer visiting bisnoi.com/owner gets
 * redirected to /customer, not shown the owner dashboard.
 *
 * Returns `true` once it's safe to render the protected screen (auth loaded
 * AND role matches); the calling _layout should render nothing (or a
 * spinner) until this is true, so the protected UI never even flashes for
 * an unauthorized role.
 */
export function useRoleGuard(allowed: Role[]): boolean {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowedKey = allowed.join(",");
  const ok = !loading && !!user && allowed.includes(user.role);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login" as any);
      return;
    }
    if (!allowed.includes(user.role)) {
      const home = HOME_FOR_ROLE[user.role] || "/login";
      router.replace(home as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.role, allowedKey]);

  return ok;
}
