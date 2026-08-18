import { Ionicons } from "@expo/vector-icons";
import { ConsoleNav } from "@/src/components/ConsoleDashboard";

const OWNER_NAV_ALL: (ConsoleNav & { module?: string })[] = [
  { key: "dashboard", label: "Dashboard", route: "/owner", icon: "grid", module: "dashboard" },
  { key: "orders", label: "Orders", route: "/owner/orders", icon: "receipt-outline", module: "orders" },
  { key: "pos", label: "Billing", route: "/owner/pos", icon: "calculator-outline", module: "pos" },
  { key: "qr-tables", label: "Table QR", route: "/owner/qr-tables", icon: "qr-code-outline", module: "pos" },
  { key: "menu", label: "Menu", route: "/owner/menu", icon: "fast-food-outline", module: "menu" },
  { key: "categories", label: "Categories", route: "/owner/categories", icon: "albums-outline", module: "menu" },
  { key: "reviews", label: "Reviews", route: "/owner/reviews", icon: "star-outline", module: "reviews" },
  { key: "offers", label: "Offers", route: "/owner/offers", icon: "pricetags-outline", module: "settings" },
  { key: "complaints", label: "Complaints", route: "/owner/complaints", icon: "alert-circle-outline", module: "reviews" },
  { key: "finance", label: "Finance", route: "/owner/finance", icon: "wallet-outline", module: "finance" },
  { key: "reports", label: "Reports", route: "/owner/reports", icon: "stats-chart-outline", module: "reports" },
  { key: "marketing", label: "Marketing", route: "/owner/marketing", icon: "megaphone-outline", module: "settings" },
  { key: "customers", label: "Customers", route: "/owner/customers", icon: "people-outline", module: "reviews" },
  { key: "outlet", label: "Outlet Info", route: "/owner/outlet", icon: "storefront-outline", module: "settings" },
  { key: "hours", label: "Hours", route: "/owner/hours", icon: "time-outline", module: "settings" },
  { key: "staff", label: "Staff & Roles", route: "/owner/staff", icon: "people-circle-outline", module: "__owner_only__" },
  { key: "profile", label: "Profile", route: "/owner/profile", icon: "person-circle-outline" },
];

export function ownerNavFor(user: any): ConsoleNav[] {
  const staff = user?.role === "restaurant_staff";
  const perms = user?.permissions || [];
  return OWNER_NAV_ALL
    .filter((n) => {
      if (n.module === "__owner_only__") return !staff;
      if (!staff) return true;
      if (!n.module) return true;
      return perms.includes(n.module);
    })
    .map(({ module: _m, ...rest }) => rest);
}

/** Map an expo-router owner segment (`pos`, `orders`, `menu`, …) to a nav `key`. */
export function ownerActiveKey(segment?: string): string {
  if (!segment || segment === "index") return "dashboard";
  if (segment === "pos") return "pos";
  if (segment === "tables") return "tables";
  if (segment === "orders") return "orders";
  if (segment === "menu") return "menu";
  if (segment === "categories") return "categories";
  if (segment === "reviews") return "reviews";
  if (segment === "offers") return "offers";
  if (segment === "finance") return "finance";
  if (segment === "reports") return "reports";
  if (segment === "outlet") return "outlet";
  if (segment === "hours") return "hours";
  if (segment === "staff") return "staff";
  if (segment === "profile") return "profile";
  return "dashboard";
}
