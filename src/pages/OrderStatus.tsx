import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, ChefHat, Truck, Home, Sparkles } from "lucide-react";
import { getGuestSession } from "@/lib/guestSession";
import { apiPost } from "@/lib/apiClient";

type OrderItem = {
  id: string;
  menu_items?: { name: string };
  price: number | string;
  quantity: number;
};

type Order = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "PREPARING" | "READY" | "DELIVERED" | "ORDER_FINISHED";
  total: number | string;
  special_instructions?: string;
  rooms_tables?: { type: string; code: string };
  order_items?: OrderItem[];
};

const statusConfig = {
  PENDING: { label: "Order Received", icon: Clock, color: "bg-yellow-500" },
  ACCEPTED: { label: "Accepted", icon: CheckCircle2, color: "bg-blue-500" },
  PREPARING: { label: "Preparing", icon: ChefHat, color: "bg-orange-500" },
  READY: { label: "Ready", icon: Truck, color: "bg-green-500" },
  DELIVERED: { label: "Delivered", icon: CheckCircle2, color: "bg-green-600" },
  ORDER_FINISHED: { label: "Order Finished", icon: Sparkles, color: "bg-purple-600" },
} as const;

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

const toNumber = (v: number | string) => (typeof v === "number" ? v : Number(v || 0));

const OrderStatus = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const guestSession = getGuestSession();
  const bookingId = guestSession?.bookingId ?? null;

  const { data: order, refetch, isLoading, isError, error } = useQuery<Order>({
    queryKey: ["order", orderId, bookingId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      return apiPost<Order, { orderId: string | undefined; bookingId: string | null }>(
        "/public/orders/detail",
        {
          orderId,
          bookingId,
        },
      );
    },
    refetchInterval: 5000, // poll every 5s (React Query's built-in interval)
    refetchOnWindowFocus: false,
  });

  // Fallback manual refetch if needed (kept minimal since refetchInterval is on)
  useEffect(() => {
    if (!orderId) return;
    const t = setTimeout(() => refetch(), 100);
    return () => clearTimeout(t);
  }, [orderId, refetch]);

  const currentStatus = (order?.status || "PENDING") as keyof typeof statusConfig;
  const statusInfo = statusConfig[currentStatus];
  const StatusIcon = statusInfo.icon;

  const statuses = useMemo(() => Object.entries(statusConfig), []);
  const currentIndex = useMemo(
    () => statuses.findIndex(([key]) => key === currentStatus),
    [statuses, currentStatus]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading order...</p>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4">Failed to load order.</p>
          <p className="text-sm text-muted-foreground mb-6">{(error as any)?.message || "Please retry."}</p>
          <Button onClick={() => navigate("/", { replace: true })}>Go Home</Button>
        </div>
      </div>
    );
  }

  const total = toNumber(order.total);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-bold">Order Status</h1>
          <p className="text-sm text-muted-foreground">
            {order.rooms_tables?.type} {order.rooms_tables?.code}
          </p>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
        {/* Current Status */}
        <Card className="border-2 shadow-elegant">
          <CardContent className="pt-6">
            <div className="text-center">
              <div
                className={`w-20 h-20 rounded-full ${statusInfo.color} mx-auto mb-4 flex items-center justify-center shadow-glow`}
              >
                <StatusIcon className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">{statusInfo.label}</h2>
              <Badge variant="outline" className="mb-4">
                Order #{order.id.slice(0, 8)}
              </Badge>
              {currentStatus === "ORDER_FINISHED" ? (
                <p className="text-muted-foreground">Thank you for your order! Enjoy your meal!</p>
              ) : currentStatus === "DELIVERED" ? (
                <p className="text-muted-foreground">
                  Your order has been delivered. We will mark it finished shortly.
                </p>
              ) : (
                <p className="text-muted-foreground">Your order is being processed</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Progress Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Order Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statuses.map(([key, config], index) => {
                const Icon = config.icon;
                const isCompleted = index <= currentIndex;
                const isCurrent = index === currentIndex;

                return (
                  <div key={key} className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-smooth ${
                        isCompleted ? `${config.color} text-white shadow-glow` : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p
                        className={`font-semibold ${
                          isCurrent ? "text-primary" : isCompleted ? "" : "text-muted-foreground"
                        }`}
                      >
                        {config.label}
                      </p>
                    </div>
                    {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Order Items */}
        <Card>
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.order_items?.map((item) => {
              const lineTotal = toNumber(item.price) * item.quantity;
              return (
                <div key={item.id} className="flex justify-between">
                  <span>
                    {item.quantity}× {item.menu_items?.name}
                  </span>
                  <span className="font-semibold">{formatINR(lineTotal)}</span>
                </div>
              );
            })}
            <div className="border-t pt-3 mt-3 flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{formatINR(total)}</span>
            </div>
            {order.special_instructions && (
              <div className="bg-muted/50 rounded-lg p-3 mt-4">
                <p className="text-sm font-semibold mb-1">Special Instructions:</p>
                <p className="text-sm text-muted-foreground">{order.special_instructions}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-3">
          {currentStatus === "ORDER_FINISHED" && (
            <Button
              size="lg"
              className="w-full gradient-accent shadow-elegant"
              onClick={() => navigate("/menu", { replace: true })}
            >
              Order More
            </Button>
          )}
          <Button variant="outline" size="lg" className="w-full" onClick={() => navigate("/")}>
            <Home className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OrderStatus;
