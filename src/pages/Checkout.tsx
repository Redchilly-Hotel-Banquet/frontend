import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ShoppingBag, Clock } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/red-chilly-logo.jpeg";
import { getGuestSession, saveGuestSession, type GuestSession } from "@/lib/guestSession";
import { apiPost, ApiError } from "@/lib/apiClient";

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  prepTime: number;
};

const cartStorageKey = (outletId?: string | "ALL") => `rc-cart:${outletId ?? "ALL"}`;
const clearCartForOutlet = (outletId?: string | "ALL") => {
  try {
    sessionStorage.removeItem(cartStorageKey(outletId));
  } catch {}
};

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Cart is provided by Menu via navigate(..., { state: { cart, outletId } })
  const initialCart: CartItem[] = location.state?.cart || [];
  const [cart] = useState<CartItem[]>(initialCart);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Location context (room/table + outlet) from session
  const [locationInfo, setLocationInfo] = useState<GuestSession | null>(() => getGuestSession());
  useEffect(() => {
    const sync = () => {
      const session = getGuestSession();
      setLocationInfo(session);
    };
    sync();
    if (typeof window !== "undefined") {
      window.addEventListener("storage", sync);
      window.addEventListener("focus", sync);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", sync);
        window.removeEventListener("focus", sync);
      }
    };
  }, []);

  // If someone lands here with an empty cart, kick them back
  useEffect(() => {
    if (!cart.length) navigate("/menu", { replace: true });
  }, [cart, navigate]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const estimatedTime = useMemo(() => (cart.length ? Math.max(...cart.map((i) => i.prepTime || 0)) : 0), [cart]);

  const outletId = locationInfo?.outletId; // required in order context
  const roomTableId = locationInfo?.id || null;
  const isOrderContext = Boolean(outletId);
  const isRoomOrder =
    (locationInfo?.type || "").toUpperCase() === "ROOM" ||
    (locationInfo?.type || "").toUpperCase() === "HOTEL_ROOM";

  const placeOrder = async () => {
    if (!isOrderContext) {
      toast.info("Viewing only. Scan your room/table QR to place an order.");
      return;
    }
    if (!cart.length) {
      toast.error("Your cart is empty.");
      return;
    }
    try {
      setIsPlacingOrder(true);

      if (!locationInfo) {
        toast.error("Missing room/table information. Please rescan your QR code.");
        return;
      }

      const data = await apiPost<{ orderId: string; bookingId?: string | null }, Record<string, unknown>>(
        "/public/orders",
        {
          outletId,
          roomTableId,
          bookingId: locationInfo.bookingId,
          specialInstructions,
          items: cart,
          subtotal,
        },
      );

      // Clear cart for this outlet (fixes “previous items” leak into next order)
      clearCartForOutlet(outletId);

      // Persist booking reference for future orders
      const updated: GuestSession = {
        ...locationInfo,
        bookingId: data?.bookingId ?? locationInfo.bookingId,
      };
      saveGuestSession(updated);
      setLocationInfo(updated);

      toast.success("Order placed successfully!");
      // Replace history to avoid going back into a “submit-able” checkout
      navigate(`/order-status/${data.orderId}`, { replace: true });
    } catch (err: unknown) {
      console.error("Error placing order:", err);
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to place order. Please try again.";
      toast.error(message);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Empty cart screen (guard)
  if (cart.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="max-w-md mx-4 shadow-elegant hover:shadow-elegant-selected transition-shadow">
          <CardContent className="pt-6 text-center">
            <ShoppingBag className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground mb-6">Add some delicious items to get started!</p>
            <Button onClick={() => navigate("/menu")} className="gradient-primary shadow-elegant">
              Browse Menu
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img 
              src={logo} 
              alt="Red Chilly Logo" 
              className="w-12 h-12 object-contain"
            />
            <div>
              <h1 className="text-xl font-bold">Review Order</h1>
              <p className="text-sm text-muted-foreground">
                {locationInfo?.type} {locationInfo?.code} • {outletId ?? "No outlet (view-only)"}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="space-y-6">
          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle>Your Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Qty: {item.quantity} × {formatINR(item.price)}
                    </p>
                  </div>
                  <p className="font-semibold">{formatINR(item.price * item.quantity)}</p>
                </div>
              ))}

              <div className="border-t pt-4 mt-4">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatINR(subtotal)}</span>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-primary" />
                <span>
                  Estimated preparation time: <strong>{estimatedTime || 10} minutes</strong>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Special Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Special Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Any special requests? (e.g., less spicy, extra napkins)"
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Place Order */}
          <Button
            size="lg"
            className="w-full gradient-primary shadow-elegant hover:scale-105 transition-smooth"
            onClick={placeOrder}
            disabled={isPlacingOrder || !isOrderContext}
            title={isOrderContext ? "" : "Viewing only. Scan QR to order."}
          >
            {isPlacingOrder ? "Placing Order..." : isOrderContext ? "Place Order" : "View Only"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
