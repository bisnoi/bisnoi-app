import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { Api } from "@/src/api";

export type Role =
  | "customer"
  | "restaurant_owner"
  | "rider"
  | "admin"
  | "restaurant_staff"
  | "admin_staff";

export type AuthUser = {
  id: string;
  phone: string;
  name?: string;
  email?: string | null;
  dob?: string | null;
  gender?: string | null;
  avatar?: string | null;
  role: Role;
  created_at: string;
  // Staff-only extras (present when role is admin_staff/restaurant_staff)
  permissions?: string[];
  staff_label?: string;
  parent_id?: string;
  restaurant_id?: string;
  restaurant_name?: string;
  active?: boolean;
  /** Short admin-searchable ID, e.g. `CUST-3A9K7`. */
  account_id?: string;
};

/** Convenience: is this user a staff account (either flavour)? */
export const isStaff = (u: AuthUser | null | undefined) =>
  !!u && (u.role === "admin_staff" || u.role === "restaurant_staff");

/** Does this staff user have permission for the given module? Non-staff always true. */
export const hasPerm = (u: AuthUser | null | undefined, moduleKey: string): boolean => {
  if (!u) return false;
  if (!isStaff(u)) return true;
  return (u.permissions || []).includes(moduleKey);
};

type AuthCtx = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  signIn: (token: string, user: AuthUser) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await Api.me();
      setUser(me as AuthUser);
    } catch {
      await storage.removeItem("auth_token");
      await storage.removeItem("auth_user");
      setUser(null);
      setToken(null);
    }
  }, []);

  useEffect(() => {
    let done = false;
    // Safety net: never let the app hang on the bootstrap spinner.
    const safety = setTimeout(() => {
      if (!done) setLoading(false);
    }, 2500);
    (async () => {
      try {
        const t = await storage.getItem<string>("auth_token", "");
        const u = await storage.getItem<string>("auth_user", "");
        if (t) {
          setToken(t);
          let parsed: AuthUser | null = null;
          if (u) {
            try { parsed = JSON.parse(u); setUser(parsed); } catch {}
          }
          // Skip server refresh for the mock demo-owner session (no real token).
          if (t !== "demo-owner-token" && parsed?.id !== "demo-owner-8888888888") {
            await refresh();
          }
        }
      } catch {
        /* ignore — fall through to finish loading */
      } finally {
        done = true;
        clearTimeout(safety);
        setLoading(false);
      }
    })();
    return () => clearTimeout(safety);
  }, [refresh]);

  const signIn = async (newToken: string, newUser: AuthUser) => {
    await storage.setItem("auth_token", newToken);
    await storage.setItem("auth_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const signOut = async () => {
    await storage.removeItem("auth_token");
    await storage.removeItem("auth_user");
    await storage.removeItem("cart");
    setToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, token, loading, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
