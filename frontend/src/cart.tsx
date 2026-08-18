import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";

export type CartItem = {
  menu_item_id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  restaurant_id: string;
  restaurant_name: string;
};

type CartCtx = {
  items: CartItem[];
  restaurantId: string | null;
  restaurantName: string | null;
  add: (item: Omit<CartItem, "quantity">) => Promise<void>;
  increment: (id: string) => Promise<void>;
  decrement: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  subtotal: number;
  count: number;
};

const Ctx = createContext<CartCtx>({} as any);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem<string>("cart", "");
      if (raw) {
        try { setItems(JSON.parse(raw)); } catch {}
      }
    })();
  }, []);

  const persist = useCallback(async (next: CartItem[]) => {
    setItems(next);
    await storage.setItem("cart", JSON.stringify(next));
  }, []);

  const add = async (item: Omit<CartItem, "quantity">) => {
    let next = items;
    // If different restaurant, replace cart
    if (items.length > 0 && items[0].restaurant_id !== item.restaurant_id) {
      next = [];
    }
    const existing = next.find((i) => i.menu_item_id === item.menu_item_id);
    if (existing) {
      next = next.map((i) => i.menu_item_id === item.menu_item_id ? { ...i, quantity: i.quantity + 1 } : i);
    } else {
      next = [...next, { ...item, quantity: 1 }];
    }
    await persist(next);
  };

  const increment = async (id: string) => {
    await persist(items.map((i) => i.menu_item_id === id ? { ...i, quantity: i.quantity + 1 } : i));
  };

  const decrement = async (id: string) => {
    const next = items
      .map((i) => i.menu_item_id === id ? { ...i, quantity: i.quantity - 1 } : i)
      .filter((i) => i.quantity > 0);
    await persist(next);
  };

  const clear = async () => {
    await persist([]);
  };

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const restaurantId = items[0]?.restaurant_id || null;
  const restaurantName = items[0]?.restaurant_name || null;

  return (
    <Ctx.Provider value={{ items, restaurantId, restaurantName, add, increment, decrement, clear, subtotal, count }}>
      {children}
    </Ctx.Provider>
  );
}

export const useCart = () => useContext(Ctx);
