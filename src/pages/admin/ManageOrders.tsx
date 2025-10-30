// ManageOrders.tsx
// Alarm-hardened: polling + optional Supabase Realtime, WebAudio + HTMLAudio fallback,
// visibility/focus repair, background refetch enabled.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, AlertTriangle, Filter, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { getAdminOutlets, useRequireAdminAccess } from "@/hooks/useAdminAccess";
import { apiPost, ApiError } from "@/lib/apiClient";

/** ===================== Config ===================== */
const POLL_MS = 10_000;
const ALARM_SRC = "/alarm.wav"; // <— place file in /public

/** ===================== Status options ===================== */
const statusOptions = [
  { value: "PENDING", label: "Pending", color: "bg-yellow-500" },
  { value: "ACCEPTED", label: "Accepted", color: "bg-blue-500" },
  { value: "PREPARING", label: "Preparing", color: "bg-orange-500" },
  { value: "READY", label: "Ready", color: "bg-green-500" },
  { value: "DELIVERED", label: "Delivered", color: "bg-green-600" },
] as const;

type StatusValue = (typeof statusOptions)[number]["value"];

const ORDERS_PAGE_SIZE = 10;

const normaliseOutletId = (value?: string | null) =>
  value ? String(value).trim().toLowerCase() : "";

/** ===================== Siren (Web Audio) ===================== */
type AlarmHandle = {
  ctx: AudioContext;
  osc: OscillatorNode | null;
  modOsc: OscillatorNode | null;
  gain: GainNode | null;
  modGain: GainNode | null;
};

function createContext(ref: React.MutableRefObject<AlarmHandle | null>) {
  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = ref.current?.ctx ?? new AC();
  if (!ref.current) ref.current = { ctx, osc: null, modOsc: null, gain: null, modGain: null };
  else ref.current.ctx = ctx;
  return ctx;
}

async function unlockAudio(ref: React.MutableRefObject<AlarmHandle | null>): Promise<boolean> {
  try {
    const ctx = createContext(ref);
    await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false;
  }
}

function startSiren(ref: React.MutableRefObject<AlarmHandle | null>) {
  try {
    const ctx = createContext(ref);
    if (ref.current?.osc) return; // already built

    const osc = ctx.createOscillator();
    const modOsc = ctx.createOscillator();
    const gain = ctx.createGain();
    const modGain = ctx.createGain();

    osc.type = "square";
    modOsc.type = "sine";
    modOsc.frequency.value = 2.2; // sweep rate
    modGain.gain.value = 650;     // sweep depth
    osc.frequency.value = 1150;   // center pitch
    gain.gain.value = 0.23;

    modOsc.connect(modGain);
    modGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(ctx.destination);

    ref.current = { ctx, osc, modOsc, gain, modGain };

    if (ctx.state === "running") {
      try {
        ref.current.osc?.start();
        ref.current.modOsc?.start();
        (navigator as any)?.vibrate?.([250, 150, 250, 150, 250]);
      } catch {}
    }
  } catch (e) {
    console.error("startSiren failed:", e);
  }
}

function stopSiren(ref: React.MutableRefObject<AlarmHandle | null>) {
  try {
    const h = ref.current;
    if (!h) return;
    h.osc?.stop();
    h.modOsc?.stop();
    h.osc?.disconnect();
    h.modOsc?.disconnect();
    h.gain?.disconnect();
    h.modGain?.disconnect();
    ref.current = { ctx: h.ctx, osc: null, modOsc: null, gain: null, modGain: null };
  } catch (e) {
    console.error("stopSiren failed:", e);
  }
}

/** ===================== Persisted acks ===================== */
const ACK_KEY = "acknowledgedOrderIds";
function getAcked(): Set<string> {
  try {
    const raw = sessionStorage.getItem(ACK_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function addAcked(ids: string[]) {
  const s = getAcked();
  ids.forEach((id) => s.add(id));
  sessionStorage.setItem(ACK_KEY, JSON.stringify(Array.from(s)));
}

/** ===================== Component ===================== */
const ManageOrders = () => {
  const navigate = useNavigate();
  useRequireAdminAccess(["admin", "kitchen"]);

  /** Alarm state */
  const alarmRef = useRef<AlarmHandle | null>(null);
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showAlarmModal, setShowAlarmModal] = useState(false);
  const [pendingToAcknowledge, setPendingToAcknowledge] = useState<string[]>([]);
  const [wakeLock, setWakeLock] = useState<any>(null);

  /** Enable audio + prime HTMLAudio */
  const handleEnableSound = async () => {
    const ok = await unlockAudio(alarmRef);

    try {
      if (htmlAudioRef.current) {
        htmlAudioRef.current.loop = true;
        htmlAudioRef.current.volume = 0; // primed muted
        await htmlAudioRef.current.play();
        await Promise.resolve();
        htmlAudioRef.current.pause();
      }
    } catch (e) {
      console.warn("Priming HTMLAudio failed:", e);
    }

    setAudioEnabled(ok);

    try {
      // @ts-ignore - Wake Lock is experimental in TS DOM lib
      const wl = await navigator.wakeLock?.request?.("screen");
      if (wl) {
        setWakeLock(wl);
        wl.addEventListener("release", () => setWakeLock(null));
      }
    } catch {}

    if (ok && pendingToAcknowledge.length > 0) {
      startSiren(alarmRef);
      try {
        if (htmlAudioRef.current) {
          htmlAudioRef.current.volume = 1;
          await htmlAudioRef.current.play();
        }
      } catch {}
    }
  };

  /** Repair audio on visibility/focus */
  useEffect(() => {
    const repair = async () => {
      if (!audioEnabled) return;
      const ok = await unlockAudio(alarmRef);
      if (!ok) return;

      if (showAlarmModal && pendingToAcknowledge.length > 0) {
        stopSiren(alarmRef);
        startSiren(alarmRef);
        try {
          if (htmlAudioRef.current) {
            htmlAudioRef.current.volume = 1;
            await htmlAudioRef.current.play();
          }
        } catch {}
      }
    };
    const onVis = () => void repair();
    const onFocus = () => void repair();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [audioEnabled, showAlarmModal, pendingToAcknowledge.length]);

  /** Fetch orders (keep polling in background) */
  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      return apiPost<any[], { action: "list" }>("/admin/orders/manage", { action: "list" }, true);
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });


  /** Detect new PENDING orders from polling */
  const newPendingOrders = useMemo(() => {
    const acked = getAcked();
    const fresh: any[] = [];
    (orders ?? []).forEach((o: any) => {
      if (o.status === "PENDING" && !acked.has(o._id)) fresh.push(o);
    });
    return fresh;
  }, [orders]);

  useEffect(() => {
    if (!orders || newPendingOrders.length === 0) return;

    const ids = newPendingOrders.map((o: any) => o._id);
    setPendingToAcknowledge(ids);
    setShowAlarmModal(true);

    if (audioEnabled) {
      startSiren(alarmRef);
      (async () => {
        try {
          if (htmlAudioRef.current) {
            htmlAudioRef.current.volume = 1;
            await htmlAudioRef.current.play();
          }
        } catch {}
      })();
    }

    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification("New Order Received", {
          body: `You have ${newPendingOrders.length} new order(s).`,
          silent: true,
        });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    }
  }, [orders, newPendingOrders, audioEnabled]);

  /** Update status */
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StatusValue }) => {
      return apiPost("/admin/orders/manage", { action: "update_status", id, status }, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("Order status updated!");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
          ? error.message
          : "Failed to update order status";
      toast.error(message);
    },
  });

  const handleStatusChange = (orderId: string, newStatus: StatusValue) => {
    mutation.mutate({ id: orderId, status: newStatus });
  };

  /** Filters & sorting */
  const [statusFilter, setStatusFilter] = useState<Set<StatusValue>>(
    () => new Set<StatusValue>(["PENDING", "ACCEPTED", "PREPARING", "READY"])
  );
  const toggleStatus = (v: StatusValue, checked: boolean) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (checked) next.add(v);
      else next.delete(v);
      return next;
    });
    setPage(1);
  };
  const setAllStatus = () => {
    setStatusFilter(new Set(statusOptions.map((s) => s.value)));
    setPage(1);
  };
  const setNonDelivered = () => {
    setStatusFilter(new Set<StatusValue>(["PENDING", "ACCEPTED", "PREPARING", "READY"]));
    setPage(1);
  };
  const setNoneStatus = () => {
    setStatusFilter(new Set());
    setPage(1);
  };

  const outlets = useMemo(() => {
    const s = new Set<string>();
    (orders ?? []).forEach((o: any) => s.add(o.outlet_id));
    return ["ALL", ...Array.from(s).sort()];
  }, [orders]);
  const [outletFilter, setOutletFilter] = useState<string>("ALL");
  const outletScoped = useMemo(
    () => (outletFilter === "ALL" ? orders ?? [] : (orders ?? []).filter((o: any) => o.outlet_id === outletFilter)),
    [orders, outletFilter]
  );

  const repeatMap = useMemo(() => {
    const m = new Map<string, number>();
    outletScoped.forEach((o: any) => {
      const key = o.room_table_id ?? o.rooms_tables?._id ?? "unknown";
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return m;
  }, [outletScoped]);

  const tables = useMemo(() => {
    const s = new Set<string>();
    outletScoped.forEach((o: any) => {
      const code = o.rooms_tables?.code;
      if (code) s.add(code);
    });
    return ["ALL", ...Array.from(s).sort((a, b) => a.localeCompare(b, "en", { numeric: true }))];
  }, [outletScoped]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    outletScoped.forEach((o: any) => {
      (o.order_items ?? []).forEach((it: any) => {
        const cat = it.menu_items?.category;
        if (cat) s.add(cat);
      });
    });
    return ["ALL", ...Array.from(s).sort()];
  }, [outletScoped]);

  const [tableFilter, setTableFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"NEWEST" | "OLDEST" | "REPEAT_FIRST">("NEWEST");
  const [page, setPage] = useState(1);

  const filteredOrders = useMemo(() => {
    let arr = outletScoped;

    arr = arr.filter((o: any) => (statusFilter.size === 0 ? true : statusFilter.has(o.status as StatusValue)));

    if (tableFilter !== "ALL") arr = arr.filter((o: any) => o.rooms_tables?.code === tableFilter);
    if (categoryFilter !== "ALL") {
      arr = arr.filter((o: any) =>
        (o.order_items ?? []).some((it: any) => it.menu_items?.category === categoryFilter)
      );
    }

    arr = arr.map((o: any) => ({
      ...o,
      __isRepeat: (repeatMap.get(o.room_table_id ?? o.rooms_tables?._id ?? "unknown") ?? 0) > 1,
    }));

    const byDateDesc = (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    const byDateAsc = (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

    if (sortBy === "NEWEST") return [...arr].sort(byDateDesc);
    if (sortBy === "OLDEST") return [...arr].sort(byDateAsc);

    return [...arr].sort((a: any, b: any) => {
      if (a.__isRepeat !== b.__isRepeat) return a.__isRepeat ? -1 : 1;
      return byDateDesc(a, b);
    });
  }, [outletScoped, statusFilter, tableFilter, categoryFilter, sortBy, repeatMap]);

  const totalOrderPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE));

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalOrderPages));
  }, [totalOrderPages]);

  const currentOrderPage = Math.min(page, totalOrderPages);
  const orderStartIndex = filteredOrders.length === 0 ? 0 : (currentOrderPage - 1) * ORDERS_PAGE_SIZE;
  const orderEndIndex = filteredOrders.length === 0 ? 0 : Math.min(filteredOrders.length, orderStartIndex + ORDERS_PAGE_SIZE);
  const paginatedOrders = filteredOrders.slice(orderStartIndex, orderEndIndex);

  /** Modal ack */
  const acknowledgeAlarm = () => {
    addAcked(pendingToAcknowledge);
    setPendingToAcknowledge([]);
    setShowAlarmModal(false);
    stopSiren(alarmRef);
    try {
      if (htmlAudioRef.current) {
        htmlAudioRef.current.volume = 0;
        htmlAudioRef.current.pause();
        htmlAudioRef.current.currentTime = 0;
      }
    } catch {}
  };

  useEffect(() => {
    return () => {
      try { wakeLock?.release?.(); } catch {}
      stopSiren(alarmRef);
      try { htmlAudioRef.current?.pause(); } catch {}
    };
  }, [wakeLock]);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Hidden HTMLAudio (fallback for Safari/iOS) */}
      <audio ref={htmlAudioRef} src={ALARM_SRC} preload="auto" playsInline loop style={{ display: "none" }} />

      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold">Manage Orders</h1>
            <div className="ml-auto flex items-center gap-2">
              {!audioEnabled && (
                <Button size="sm" variant="outline" onClick={handleEnableSound} title="Enable audio for alarms">
                  Enable Sound
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Alarm Modal */}
      {showAlarmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-[92%] max-w-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h2 className="text-xl font-bold">New Order Received</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              The alarm will keep sounding until you acknowledge. Review and click OK.
            </p>

            <div className="bg-muted/40 rounded-lg p-3 max-h-48 overflow-auto mb-4">
              {pendingToAcknowledge.map((id) => (
                <div key={id} className="text-sm">
                  Order #{id.substring(0, 8)}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              {!audioEnabled ? (
                <Button variant="secondary" onClick={handleEnableSound}>Enable Sound</Button>
              ) : (
                <div />
              )}
              <Button className="gradient-primary shadow-elegant" onClick={acknowledgeAlarm}>
                OK, got it
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />

            {/* Outlet */}
            <Select value={outletFilter} onValueChange={(value) => {
              setOutletFilter(value);
              setPage(1);
            }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Outlet" /></SelectTrigger>
              <SelectContent>
                {outlets.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Table/Room */}
            <Select value={tableFilter} onValueChange={(value) => {
              setTableFilter(value);
              setPage(1);
            }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Table/Room" /></SelectTrigger>
              <SelectContent>
                {tables.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Category */}
            <Select value={categoryFilter} onValueChange={(value) => {
              setCategoryFilter(value);
              setPage(1);
            }}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Status multi-select */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {statusOptions.map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s.value}
                    checked={statusFilter.has(s.value as StatusValue)}
                    onCheckedChange={(checked) => toggleStatus(s.value as StatusValue, Boolean(checked))}
                  >
                    {s.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 flex gap-2">
                  <Button size="sm" variant="outline" onClick={setNoneStatus}>None</Button>
                  <Button size="sm" variant="outline" onClick={setAllStatus}>All</Button>
                  <Button size="sm" className="ml-auto" onClick={setNonDelivered}>Non-Delivered</Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v: any) => {
              setSortBy(v);
              setPage(1);
            }}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Sort by" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NEWEST">Newest first</SelectItem>
                <SelectItem value="OLDEST">Oldest first</SelectItem>
                <SelectItem value="REPEAT_FIRST">Repeat orders first</SelectItem>
              </SelectContent>
            </Select>

            {/* Reset */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOutletFilter("ALL");
                setTableFilter("ALL");
                setCategoryFilter("ALL");
                setSortBy("NEWEST");
                setPage(1);
                setNonDelivered();
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="mb-4 text-xs text-muted-foreground">
          {filteredOrders.length === 0
            ? "No orders match your filters."
            : `Showing ${orderStartIndex + 1}-${orderEndIndex} of ${filteredOrders.length}`}
        </div>

        {isLoading ? (
          <p>Loading orders...</p>
        ) : filteredOrders.length === 0 ? (
          <p className="text-muted-foreground">No orders match your filters.</p>
        ) : (
          <>
            {/* ✅ wrap both siblings in a fragment */}
            <div className="space-y-4">
              {paginatedOrders.map((order: any) => {
                const currentStatus = statusOptions.find((s) => s.value === order.status);
                const firstCat = order.order_items?.find((it: any) => it.menu_items?.category)?.menu_items?.category;
                return (
                  <Card key={order._id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">Order #{order._id.substring(0, 8)}</CardTitle>
                          {order.__isRepeat && <Badge variant="secondary">Repeat</Badge>}
                          {firstCat && <Badge variant="outline">{firstCat}</Badge>}
                        </div>
                        <Badge className={currentStatus?.color}>{currentStatus?.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {order.outlet_id} • {order.rooms_tables ? `${order.rooms_tables.type} ${order.rooms_tables.code}` : "No location"}
                      </p>
                      <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString()}</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">Items:</h4>
                        <div className="space-y-2">
                          {order.order_items?.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span>
                                {item.quantity}x {item.menu_items?.name}
                                {item.menu_items?.category ? (
                                  <span className="text-muted-foreground"> — {item.menu_items.category}</span>
                                ) : null}
                              </span>
                              <span>₹{(Number(item.price) * item.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {order.special_instructions && (
                        <div>
                          <h4 className="font-semibold mb-1">Special Instructions:</h4>
                          <p className="text-sm text-muted-foreground">{order.special_instructions}</p>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-bold">Total: ₹{Number(order.total).toFixed(2)}</span>
                        <Select
                          value={order.status}
                          onValueChange={(value) => handleStatusChange(order._id, value as StatusValue)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((status) => (
                              <SelectItem key={status.value} value={status.value}>
                                {status.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {filteredOrders.length > ORDERS_PAGE_SIZE && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6 text-xs sm:text-sm text-muted-foreground">
                <span>
                  Showing {orderStartIndex + 1}-{orderEndIndex} of {filteredOrders.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentOrderPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="font-medium">
                    Page {currentOrderPage} of {totalOrderPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((prev) => Math.min(totalOrderPages, prev + 1))}
                    disabled={currentOrderPage === totalOrderPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ManageOrders;
