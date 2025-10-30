import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, RefreshCcw, Receipt, CheckCircle2 } from "lucide-react";
import { getGuestSession, clearGuestSession } from "@/lib/guestSession";
import { toast } from "sonner";
import { apiPost } from "@/lib/apiClient";

type GuestOrderItem = {
  id?: string;
  quantity: number;
  price: number | string;
  menu_items?: { name?: string };
};

type GuestOrder = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "PREPARING" | "READY" | "DELIVERED" | "ORDER_FINISHED";
  created_at: string;
  total: number | string;
  rooms_tables?: { type?: string; code?: string };
  order_items?: GuestOrderItem[];
};

const statusBadges: Record<
  GuestOrder["status"],
  { label: string; color: string; description: string }
> = {
  PENDING: {
    label: "Pending",
    color: "bg-yellow-500",
    description: "We received your order.",
  },
  ACCEPTED: {
    label: "Accepted",
    color: "bg-blue-500",
    description: "Kitchen acknowledged your order.",
  },
  PREPARING: {
    label: "Preparing",
    color: "bg-orange-500",
    description: "Your food is being prepared.",
  },
  READY: {
    label: "Ready",
    color: "bg-green-500",
    description: "Staff is on the way to deliver.",
  },
  DELIVERED: {
    label: "Delivered",
    color: "bg-green-600",
    description: "Order delivered. Awaiting final confirmation.",
  },
  ORDER_FINISHED: {
    label: "Finished",
    color: "bg-purple-600",
    description: "Order closed. Thank you!",
  },
};

const formatINR = (value: number | string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(typeof value === "number" ? value : Number(value || 0));

const GuestOrders = () => {
  const navigate = useNavigate();
  const guestSession = getGuestSession();
  const bookingId = guestSession?.bookingId ?? null;

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery<{ orders: GuestOrder[] }>({
    queryKey: ["guest-orders", bookingId],
    enabled: Boolean(bookingId),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!bookingId) throw new Error("Missing booking id.");
      return apiPost<{ orders: GuestOrder[] }, { bookingId: string }>("/public/orders/guest", {
        bookingId,
      });
    },
  });

  const orders = useMemo(() => data?.orders ?? [], [data]);

  const handleCheckout = () => {
    clearGuestSession();
    try {
      if (typeof window !== "undefined" && guestSession?.outletId) {
        sessionStorage.removeItem(`rc-cart:${guestSession.outletId}`);
      }
    } catch {
      // ignore cart cleanup failures
    }
    toast.success("Guest session cleared. We hope you enjoyed your stay!");
    navigate("/", { replace: true });
  };

  if (!bookingId || !guestSession) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4">
        <Card className="max-w-md w-full border-2 border-dashed border-primary/40">
          <CardContent className="pt-6 text-center space-y-4">
            <Receipt className="w-12 h-12 mx-auto text-primary" />
            <h2 className="text-xl font-bold">No active guest session</h2>
            <p className="text-sm text-muted-foreground">
              Scan your room or table QR code to start ordering and view your running bill here.
            </p>
            <Button className="gradient-primary shadow-elegant" onClick={() => navigate("/qr")}>
              Scan QR Code
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Orders</h1>
            <p className="text-sm text-muted-foreground">
              {guestSession.type} {guestSession.code} • {guestSession.outletName ?? guestSession.outletId}
            </p>
            {guestSession.bookingCode && (
              <p className="text-xs text-muted-foreground">
                Booking Code: <span className="font-mono">{guestSession.bookingCode}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCcw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="destructive" size="sm" onClick={handleCheckout}>
              Checkout / End Stay
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
        {guestSession.bookingStatus === "CHECKED_OUT" && (
          <Card className="border-yellow-400/60 bg-yellow-50 dark:bg-yellow-950/20">
            <CardContent className="pt-4 text-sm">
              This booking has been checked out by our team. Order history is available for
              reference but new orders are disabled.
            </CardContent>
          </Card>
        )}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <Card className="border-destructive/60">
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold mb-2">Unable to fetch orders</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {(error as any)?.message || "Please try again in a moment."}
              </p>
              <Button onClick={() => refetch()}>Retry</Button>
            </CardContent>
          </Card>
        ) : orders.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <Clock className="w-12 h-12 mx-auto text-muted-foreground" />
              <h2 className="text-lg font-semibold">No orders yet</h2>
              <p className="text-sm text-muted-foreground">
                Place your first order from the menu to see it appear here.
              </p>
              <Button className="gradient-primary shadow-elegant" onClick={() => navigate("/menu")}>
                Browse Menu
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const statusInfo = statusBadges[order.status];
              return (
                <Card key={order.id} className="shadow-sm border-2 border-muted">
                  <CardHeader className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Order #{order.id.slice(0, 8)}</CardTitle>
                      <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">{statusInfo.description}</p>
                    {order.rooms_tables && (
                      <p className="text-xs text-muted-foreground">
                        {order.rooms_tables.type} {order.rooms_tables.code}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      {(order.order_items ?? []).map((item, idx) => (
                        <div key={`${item.id ?? idx}`} className="flex justify-between text-sm">
                          <span>
                            {item.quantity}× {item.menu_items?.name ?? "Item"}
                          </span>
                          <span>{formatINR(Number(item.price) * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-3 flex justify-between items-center">
                      <span className="font-semibold">Total</span>
                      <span className="text-primary font-bold">{formatINR(order.total)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/order-status/${order.id}`)}
                      >
                        View Status
                      </Button>
                      {order.status === "ORDER_FINISHED" && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                          Ready for billing
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default GuestOrders;
