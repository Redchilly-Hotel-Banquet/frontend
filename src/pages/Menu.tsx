import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGuestSession } from "@/lib/guestSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  ShoppingCart,
  Leaf,
  Clock,
  Minus,
  Plus,
  Image as ImageIcon,
  Receipt,
  Search,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import logo from "@/assets/red-chilly-logo.jpeg";
import { apiPost } from "@/lib/apiClient";

/** ===================== Types ===================== */
type MongoId = string | { $oid?: string } | { toString(): string };

type Category = {
  id?: string;
  _id?: MongoId;
  name: string;
  outlet_id: string;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  description?: string;
};

type MenuItem = {
  id?: string;
  _id?: MongoId;
  name: string;
  description: string | null;
  image_url: string | null;
  is_available: boolean | null;
  is_veg: boolean | null;
  price: number | string;
  prep_time_minutes: number | string | null;
  outlet_id: string;
  /** your data may have either of these: */
  category?: string | null;              // e.g. "Starters"
  category_id?: string | MongoId | null; // e.g. "68f203..."
  created_at?: string | null;
};

type MenuResponse = { categories: Category[]; items: MenuItem[] };

type CartItem = { id: string; name: string; price: number; quantity: number; prepTime: number };

type CartAction =
  | { type: "SET"; items: CartItem[] }
  | { type: "CLEAR" }
  | { type: "ADD"; item: MenuItem }
  | { type: "INC"; id: string }
  | { type: "DEC"; id: string };

/** ===================== Utils ===================== */
const toNumber = (v: number | string | null | undefined, fallback = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
};

const storageKeyForCart = (outletId?: string | "ALL") => `rc-cart:${outletId ?? "ALL"}`;
const loadCart = (outletId?: string | "ALL"): CartItem[] => {
  try {
    const raw = sessionStorage.getItem(storageKeyForCart(outletId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item) return null;
        const id = typeof item.id === "string" && item.id.length > 0 ? item.id : item.id ? String(item.id) : "";
        if (!id) return null;
        const price = typeof item.price === "number" ? item.price : Number(item.price ?? 0);
        const quantity = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : Number(item.quantity ?? 0) || 1;
        const prepTime = typeof item.prepTime === "number" ? item.prepTime : Number(item.prepTime ?? 0);
        return {
          ...item,
          id,
          price,
          quantity,
          prepTime,
        } as CartItem;
      })
      .filter((item): item is CartItem => Boolean(item && item.id.length > 0));
  } catch {
    return [];
  }
};
const saveCart = (outletId: string | "ALL" | undefined, cart: CartItem[]) => {
  try {
    sessionStorage.setItem(storageKeyForCart(outletId), JSON.stringify(cart));
  } catch {}
};

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

/** Robustly unwrap Mongo ids */
const resolveObjectId = (value: MongoId | undefined | null): string | null => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const anyVal = value as any;
    if (typeof anyVal.$oid === "string") return anyVal.$oid;
    if (typeof value.toString === "function") {
      const str = value.toString();
      if (str && str !== "[object Object]") return str;
    }
  }
  return null;
};

const getMenuItemId = (item: MenuItem): string => {
  const direct = resolveObjectId(item.id as any);
  if (direct) return direct;
  const fallback = resolveObjectId(item._id as any);
  if (fallback) return fallback;
  return `${item.name}-${item.outlet_id}`;
};

const getCategoryId = (category: Category): string | null => {
  return resolveObjectId(category.id) ?? resolveObjectId(category._id);
};

const normalize = (s: string) =>
  s.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** category keys: compare by id when present, else by normalized name */
const categoryKeyFromCategory = (c: Category): string => {
  const id = getCategoryId(c);
  return id ? `id:${id}` : `${normalize(c.name ?? "")}`;
};
const categoryKeyFromItem = (it: MenuItem): string | null => {
  const cid = resolveObjectId(it.category_id as any);
  if (cid) return `id:${cid}`;
  if (typeof it.category === "string" && it.category.trim()) return `${normalize(it.category)}`;
  return null;
};

/** ===================== Image ===================== */
function Img({ src, alt }: { src?: string | null; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  const showFallback = err || !src;

  return (
    <div className="relative w-full overflow-hidden">
      {/* Aspect ratio 4:3 */}
      <div className="pt-[75%]" />
      <div className="absolute inset-0">
        {!showFallback && (
          <img
            src={src!}
            alt={alt}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setErr(true)}
            className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            draggable={false}
          />
        )}
        {!loaded && !showFallback && <div className="absolute inset-0 animate-pulse bg-muted" />}
        {showFallback && (
          <div className="h-full w-full grid place-items-center bg-muted">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

/** ===================== Reducer ===================== */
const cartReducer = (state: CartItem[], action: CartAction): CartItem[] => {
  switch (action.type) {
    case "SET":
      return action.items.filter((item) => item && typeof item.id === "string" && item.id.length > 0);

    case "CLEAR":
      return [];

    case "ADD": {
      const id = getMenuItemId(action.item);
      const existing = state.find((i) => i.id === id);
      const price = toNumber(action.item.price);
      const prep = toNumber(action.item.prep_time_minutes, 10);
      if (existing) {
        return state.map((i) => (i.id === id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...state, { id, name: action.item.name, price, quantity: 1, prepTime: prep }];
    }

    case "INC":
      return state.map((i) => (i.id === action.id ? { ...i, quantity: i.quantity + 1 } : i));

    case "DEC": {
      const found = state.find((i) => i.id === action.id);
      if (!found) return state;
      if (found.quantity > 1) return state.map((i) => (i.id === action.id ? { ...i, quantity: i.quantity - 1 } : i));
      return state.filter((i) => i.id !== action.id);
    }

    default:
      return state;
  }
};

/** ===================== Component ===================== */
const Menu = () => {
  const navigate = useNavigate();

  /**
   * CONTEXT DETECTION
   * - If guestLocation.outletId exists -> ORDER CONTEXT (locked to outlet; cart enabled)
   * - Else -> BROWSE CONTEXT (no outletId; outlet switch visible; cart disabled)
   */
  const guestSession = getGuestSession();
  const fixedOutletId = guestSession?.outletId;
  const initialSelectedOutlet: string | "ALL" = fixedOutletId ?? "ALL";
  const isOrderContext = Boolean(fixedOutletId);

  // Selected outlet state
  const [selectedOutletId, setSelectedOutletId] = useState<string | "ALL">(initialSelectedOutlet);
  useEffect(() => {
    if (isOrderContext && fixedOutletId) setSelectedOutletId(fixedOutletId);
  }, [isOrderContext, fixedOutletId]);

  // Category + Search
  const [selectedCategory, setSelectedCategory] = useState<string | "ALL">("ALL"); // holds category *key*
  const [query, setQuery] = useState("");

  // Query inputs based on mode
  const effectiveOutletId = selectedOutletId === "ALL" ? undefined : selectedOutletId;

  /** ========= Data Fetch =========
   * Fetch by outlet (or all). Category/search are client-side to avoid id-shape issues.
   */
  const {
    data: menuData,
    isFetching,
    isLoading,
    isError,
    error,
  } = useQuery<MenuResponse>({
    queryKey: ["menu", effectiveOutletId ?? "ALL"],
    enabled: true,
    queryFn: async () => {
      return apiPost<MenuResponse, { outletId?: string }>("/public/menu/query", {
        outletId: effectiveOutletId,
      });
    },
    staleTime: 60_000,
    retry: (c) => c < 2,
    refetchOnWindowFocus: false,
  });

  const allItems = menuData?.items ?? [];
  const allCategories = menuData?.categories ?? [];

  const { data: guestOrdersData } = useQuery<{ orders: any[] }>({
    queryKey: ["guest-orders-summary", guestSession?.bookingId],
    enabled: Boolean(
      isOrderContext &&
        guestSession?.bookingId &&
        guestSession?.bookingStatus !== "CHECKED_OUT"
    ),
    queryFn: async () => {
      return apiPost<{ orders: any[] }, { bookingId: string | undefined }>("/public/orders/guest", {
        bookingId: guestSession?.bookingId,
      });
    },
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const hasGuestOrders = Boolean(guestOrdersData?.orders?.length);

  /** OUTLETS (only used in browse mode for the switch) */
  const outlets = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of allItems) {
      if (it.outlet_id) map.set(it.outlet_id, (map.get(it.outlet_id) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
  }, [allItems]);

  /** CATEGORIES (per-outlet) with stable keys */
  const categories = useMemo(() => {
    if (!isOrderContext || selectedOutletId === "ALL") return [];
    return allCategories
      .filter((c) => c.outlet_id === selectedOutletId && (c.is_active ?? true))
      .map((c) => ({ ...c, _key: categoryKeyFromCategory(c) }))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [allCategories, isOrderContext, selectedOutletId]);

  // Reset category on outlet change
  useEffect(() => {
    setSelectedCategory("ALL");
  }, [selectedOutletId]);

  /** CART */
  const [cart, dispatch] = useReducer(cartReducer, []);
  useEffect(() => {
    dispatch({ type: "SET", items: loadCart(isOrderContext ? selectedOutletId : "ALL") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrderContext, selectedOutletId]);

  useEffect(() => {
    saveCart(isOrderContext ? selectedOutletId : "ALL", cart);
  }, [cart, isOrderContext, selectedOutletId]);

  const addToCart = useCallback(
    (item: MenuItem) => {
      if (!isOrderContext) {
        toast.info("Viewing only. Scan your room/table QR to place an order.");
        return;
      }
      if (item.is_available === false) {
        toast.info("This item is currently unavailable.");
        return;
      }
      dispatch({ type: "ADD", item });
      toast.success("Added to cart!");
    },
    [isOrderContext]
  );

  const inc = useCallback(
    (id: string) => {
      if (!isOrderContext) return;
      dispatch({ type: "INC", id });
    },
    [isOrderContext]
  );

  const dec = useCallback(
    (id: string) => {
      if (!isOrderContext) return;
      dispatch({ type: "DEC", id });
    },
    [isOrderContext]
  );

  const { cartTotal, cartItemCount, estPrep } = useMemo(() => {
    const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    const count = cart.reduce((s, i) => s + i.quantity, 0);
    const prep = cart.reduce((m, i) => Math.max(m, i.prepTime || 0), 0);
    return { cartTotal: total, cartItemCount: count, estPrep: prep };
  }, [cart]);

  const handleCheckout = useCallback(() => {
    if (!isOrderContext) return toast.info("Viewing only. Scan your room/table QR to place an order.");
    if (!cart.length) return toast.error("Your cart is empty!");
    navigate("/checkout", { state: { cart, outletId: selectedOutletId } });
  }, [cart, isOrderContext, navigate, selectedOutletId]);

  /** ===================== Derived UI Data (Filtering) ===================== */

  // 1) outlet filter
  const byOutlet = useMemo(
    () => allItems.filter((it) => (effectiveOutletId ? it.outlet_id === effectiveOutletId : true)),
    [allItems, effectiveOutletId]
  );

  // 2) category filter (key-agnostic: id or name)
  const byCategory = useMemo(() => {
    if (!isOrderContext || selectedOutletId === "ALL" || selectedCategory === "ALL") return byOutlet;
    return byOutlet.filter((it) => categoryKeyFromItem(it) === selectedCategory);
  }, [byOutlet, isOrderContext, selectedOutletId, selectedCategory]);

  // 3) search filter (name + description)
  const itemsToRender = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return byCategory;
    return byCategory.filter((it) => {
      const name = normalize(it.name || "");
      const desc = normalize(it.description || "");
      return name.includes(q) || desc.includes(q);
    });
  }, [byCategory, query]);

  // counts per category (for badges)
  const categoryCounts = useMemo(() => {
    if (!isOrderContext || selectedOutletId === "ALL") return new Map<string, number>();
    const map = new Map<string, number>();
    for (const it of byOutlet) {
      const key = categoryKeyFromItem(it);
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [byOutlet, isOrderContext, selectedOutletId]);

  /** ===================== UI Bits ===================== */

  const Header = (
    <header className="bg-card border-b sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src={logo} alt="Red Chilly Logo" className="w-12 h-12 object-contain flex-none" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">Red Chilly Menu</h1>
              <p className="text-sm text-muted-foreground">
                {isOrderContext
                  ? `Outlet • ${selectedOutletId}`
                  : selectedOutletId === "ALL"
                  ? "All Outlets (view-only)"
                  : `Outlet • ${selectedOutletId} (view-only)`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isOrderContext && hasGuestOrders && (
              <Button variant="outline" onClick={() => navigate("/my-orders")}>
                <Receipt className="w-4 h-4 mr-2" />
                View My Orders
              </Button>
            )}
            <Button
              className="gradient-primary shadow-elegant"
              onClick={handleCheckout}
              disabled={!isOrderContext || cart.length === 0}
              title={
                !isOrderContext
                  ? "Viewing only"
                  : cart.length
                  ? `Est. prep ${estPrep || 10} min`
                  : "Cart is empty"
              }
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              {isOrderContext ? (
                <>
                  {cartItemCount > 0 && `${cartItemCount} items • `}
                  {formatINR(cartTotal)}
                </>
              ) : (
                <>View Only</>
              )}
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a dish (e.g., Biryani, Paneer, Noodles)…"
              className="w-full pl-10 pr-3 py-2 rounded-md border bg-background outline-none focus:ring-2 focus:ring-primary"
              aria-label="Search menu items"
            />
          </div>
          {!!query && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing {itemsToRender.length} result{itemsToRender.length === 1 ? "" : "s"} for “{query}”
            </p>
          )}
        </div>
      </div>
    </header>
  );

  // Outlet switch: shown ONLY in browse context (no fixed outletId)
  const OutletSwitch =
    !isOrderContext ? (
      <div className="bg-card border-b sticky top-[120px] z-40">
        <div className="container mx-auto px-4 py-3 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            <Button
              variant={selectedOutletId === "ALL" ? "default" : "outline"}
              className={selectedOutletId === "ALL" ? "gradient-primary shadow-elegant" : ""}
              onClick={() => setSelectedOutletId("ALL")}
              disabled={isFetching}
            >
              All Outlets
            </Button>
            {outlets.map(({ id, count }) => (
              <Button
                key={id}
                variant={selectedOutletId === id ? "default" : "outline"}
                className={selectedOutletId === id ? "gradient-primary shadow-elegant" : ""}
                onClick={() => setSelectedOutletId(id)}
                disabled={isFetching}
                title={`${count} items`}
              >
                {id}
              </Button>
            ))}
          </div>
        </div>
      </div>
    ) : null;

  // Category tabs: ONLY in order context (since categories are per-outlet)
  const CategoryTabs =
    isOrderContext && categories.length > 0 ? (
      <div className="bg-card border-b sticky top-[168px] z-40">
        <div className="container mx-auto px-4 py-3 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            <Button
              key="ALL"
              variant={selectedCategory === "ALL" ? "default" : "outline"}
              onClick={() => setSelectedCategory("ALL")}
              className={selectedCategory === "ALL" ? "gradient-primary shadow-elegant" : ""}
              disabled={isFetching}
            >
              All
              <Badge variant="secondary" className="ml-2">{byOutlet.length}</Badge>
            </Button>

            {categories.map((c) => {
              console.log("Category key:", c);
              console.log("Category Count: ", categoryCounts);
              console.log("Selected Category:", selectedCategory);
              const key = (c as any).name as string;
              const isActive = selectedCategory === key;
              const count = categoryCounts.get(key.toLowerCase()) ?? 0;
              return (
                <Button
                  key={key}
                  variant={isActive ? "default" : "outline"}
                  onClick={() => setSelectedCategory(key.toLowerCase())}
                  className={isActive ? "gradient-primary shadow-elegant" : ""}
                  disabled={isFetching}
                >
                  {c.name}
                  <Badge variant="secondary" className="ml-2">{count}</Badge>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    ) : null;

  const LoadingGrid = (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <div className="pt-[75%] bg-muted animate-pulse" />
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <div className="flex items-center justify-between pt-3">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-9 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const ErrorUI = (
    <Card className="my-6">
      <CardHeader>
        <CardTitle>Couldn’t load menu</CardTitle>
        <CardDescription className="text-red-500">
          {(error as any)?.message || "Please try again in a moment."}
        </CardDescription>
      </CardHeader>
    </Card>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      {Header}
      {OutletSwitch}
      {CategoryTabs}

      <div className="container mx-auto px-4 py-6">
        {isError && ErrorUI}
        {isLoading && LoadingGrid}

        {!isLoading && !isError && itemsToRender.length === 0 && (
          <Card className="my-6">
            <CardHeader>
              <CardTitle>No items found</CardTitle>
              <CardDescription>
                {query
                  ? "Try a different search term."
                  : selectedOutletId === "ALL"
                  ? "No menu items are available across outlets."
                  : "Try a different outlet or category."}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {!isLoading && !isError && itemsToRender.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {itemsToRender.map((item) => {
              const price = toNumber(item.price);
              const prep = toNumber(item.prep_time_minutes, 10);
              const itemId = getMenuItemId(item);
              const cartItem = cart.find((i) => i.id === itemId);
              const unavailable = item.is_available === false;

              return (
                <Card key={itemId} className="group overflow-hidden hover:shadow-elegant transition-smooth">
                  <div className="relative">
                    <Img src={item.image_url} alt={item.name} />
                    <div className="absolute left-2 top-2 flex gap-2">
                      {item.is_veg && (
                        <Badge variant="outline" className="bg-white/90 border-green-500 text-green-600 backdrop-blur">
                          <Leaf className="w-3 h-3 mr-1" /> Veg
                        </Badge>
                      )}
                      {unavailable && (
                        <Badge variant="secondary" className="bg-black/60 text-white backdrop-blur">Unavailable</Badge>
                      )}
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3 text-white">
                      <h3 className="font-semibold text-lg line-clamp-1 drop-shadow">{item.name}</h3>
                    </div>
                  </div>

                  <CardContent className="p-4">
                    {item.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{item.description}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xl font-bold text-primary">{formatINR(price)}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {prep || 10} min
                        </p>
                      </div>

                      {/* ACTIONS */}
                      {!isOrderContext ? (
                        <Button variant="outline" onClick={() => toast.info("Please visit the restaurant to order.")}>
                          View Only
                        </Button>
                      ) : cartItem ? (
                        <div className="flex items-center gap-2 border rounded-lg p-1 bg-background/60 backdrop-blur">
                          <Button size="icon" variant="ghost" onClick={() => dec(itemId)} className="h-8 w-8">
                            <Minus className="w-4 h-4" />
                          </Button>
                          <span className="w-8 text-center font-semibold">{cartItem.quantity}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => inc(itemId)}
                            className="h-8 w-8"
                            disabled={unavailable}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => addToCart(item)}
                          className="gradient-accent shadow-elegant"
                          disabled={unavailable || !isOrderContext}
                        >
                          {unavailable ? "Unavailable" : "Add"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Cart Button (Mobile) — order context only */}
      {cart.length > 0 && isOrderContext && (
        <div className="fixed bottom-4 left-4 right-4 md:hidden">
          <Button size="lg" className="w-full gradient-primary shadow-elegant" onClick={handleCheckout}>
            <ShoppingCart className="w-5 h-5 mr-2" />
            View Cart ({cartItemCount} items) • {formatINR(cartTotal)}
          </Button>
        </div>
      )}
    </div>
  );
};

export default Menu;
