import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Hotel, ShoppingBag, DollarSign, Calendar, Users } from "lucide-react";
import { Search, Download, ChevronRight } from "lucide-react";

// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequireAdminAccess } from "@/hooks/useAdminAccess";
import { apiPost, ApiError } from "@/lib/apiClient";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

// ---------- utils
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const fmtInt = (n: number | null | undefined) => (Number(n || 0)).toLocaleString("en-IN");
const toNumber = (n: any) => Number(n || 0);

type Outlet = {
  outlet_id: string;
  outlet_name: string;
  total_orders: number;
  total_revenue: number;
  food_revenue: number;
  today_orders: number;
  total_bookings: number;
  active_bookings: number;
  total_rooms: number;
  total_tables: number;
};

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a78bfa", "#e879f9", "#10b981", "#fb7185", "#60a5fa"];

const Analytics = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"revenue"|"orders"|"bookings"|"name">("revenue");
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(null);

  useRequireAdminAccess("admin");

  const { data: outlets = [], isLoading } = useQuery<Outlet[]>({
    queryKey: ["outlet-analytics"],
    queryFn: async () => {
      const response = await apiPost<{ outlets: Outlet[] }>(
        "/admin/analytics/outlets",
        {},
        true,
      );
      return response?.outlets ?? [];
    },
    refetchInterval: 30000,
  });

  // ---------- derived
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? outlets.filter(o => o.outlet_name?.toLowerCase().includes(q))
      : outlets;

    const sorted = [...base].sort((a, b) => {
      switch (sortKey) {
        case "revenue": return toNumber(b.total_revenue) - toNumber(a.total_revenue);
        case "orders": return toNumber(b.total_orders) - toNumber(a.total_orders);
        case "bookings": return toNumber(b.total_bookings) - toNumber(a.total_bookings);
        default: return (a.outlet_name || "").localeCompare(b.outlet_name || "");
      }
    });
    return sorted;
  }, [outlets, query, sortKey]);

  const totals = useMemo(() => {
    const agg = outlets.reduce((acc, o) => {
      acc.orders += toNumber(o.total_orders);
      acc.revenue += toNumber(o.total_revenue);
      acc.food += toNumber(o.food_revenue);
      acc.today += toNumber(o.today_orders);
      acc.bookings += toNumber(o.total_bookings);
      acc.active += toNumber(o.active_bookings);
      acc.rooms += toNumber(o.total_rooms);
      acc.tables += toNumber(o.total_tables);
      return acc;
    }, { orders:0, revenue:0, food:0, today:0, bookings:0, active:0, rooms:0, tables:0 });

    return { 
      ...agg, 
      roomRevenue: Math.max(0, agg.revenue - agg.food),
      foodPct: agg.revenue ? (agg.food / agg.revenue) * 100 : 0
    };
  }, [outlets]);

  const revenueByBranch = useMemo(() => {
    return filtered.map((o, i) => ({
      name: o.outlet_name,
      revenue: toNumber(o.total_revenue),
      food: toNumber(o.food_revenue),
      room: Math.max(0, toNumber(o.total_revenue) - toNumber(o.food_revenue)),
      fill: COLORS[i % COLORS.length],
    }));
  }, [filtered]);

  // -------- export CSV
  const exportCsv = () => {
    const header = [
      "Outlet","Total Orders","Total Revenue","Food Revenue","Room Revenue","Today's Orders",
      "Total Bookings","Active Bookings","Rooms","Tables"
    ];
    const rows = filtered.map(o => ([
      o.outlet_name,
      o.total_orders,
      toNumber(o.total_revenue),
      toNumber(o.food_revenue),
      Math.max(0, toNumber(o.total_revenue) - toNumber(o.food_revenue)),
      o.today_orders,
      o.total_bookings,
      o.active_bookings,
      o.total_rooms,
      o.total_tables
    ].join(",")));

    const blob = new Blob([header.join(",") + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `branch-analytics.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between gap-2 mb-4">
          <Button variant="ghost" onClick={() => navigate("/admin/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 w-[220px]"
                placeholder="Search branch…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Sort by: {sortKey}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSortKey("revenue")}>Revenue</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortKey("orders")}>Orders</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortKey("bookings")}>Bookings</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortKey("name")}>Name</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-2">Branch-wise Analytics</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Auto-refreshing every 30s • {outlets.length} branches
        </p>

        {/* KPI SUMMARY */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(8)].map((_, i) => (
              <Card key={i}><CardContent className="p-6"><Skeleton className="h-5 w-32 mb-2" /><Skeleton className="h-8 w-24" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
            <Kpi title="Total Orders" icon={<ShoppingBag className="h-4 w-4" />} value={fmtInt(totals.orders)} />
            <Kpi title="Total Revenue" icon={<DollarSign className="h-4 w-4" />} value={INR.format(totals.revenue)} />
            <Kpi title="F&B Revenue" icon={<DollarSign className="h-4 w-4" />} value={INR.format(totals.food)} hint={`${totals.foodPct.toFixed(0)}%`} />
            <Kpi title="Room Revenue" icon={<DollarSign className="h-4 w-4" />} value={INR.format(totals.roomRevenue)} />
            <Kpi title="Today's Orders" icon={<Calendar className="h-4 w-4" />} value={fmtInt(totals.today)} />
            <Kpi title="Bookings" icon={<Hotel className="h-4 w-4" />} value={fmtInt(totals.bookings)} hint={`${fmtInt(totals.active)} active`} />
            <Kpi title="Rooms" icon={<Users className="h-4 w-4" />} value={fmtInt(totals.rooms)} />
            <Kpi title="Tables" icon={<Users className="h-4 w-4" />} value={fmtInt(totals.tables)} />
          </div>
        )}

        <Tabs defaultValue="compare" className="space-y-4">
          <TabsList>
            <TabsTrigger value="compare">Compare Branches</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="cards">Cards</TabsTrigger>
          </TabsList>

          {/* CHARTS */}
          <TabsContent value="compare" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Branch</CardTitle>
              </CardHeader>
              <CardContent className="h-[340px]">
                {isLoading ? <Skeleton className="h-full w-full" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueByBranch} margin={{ left: 8, right: 8 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-10} height={60} />
                      <YAxis tickFormatter={(v) => INR.format(v).replace("₹", "")} />
                      <Tooltip formatter={(v: number) => INR.format(v)} />
                      <Legend />
                      <Bar dataKey="revenue" name="Total Revenue" radius={[4, 4, 0, 0]}>
                        {revenueByBranch.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Split (Food vs Room)</CardTitle>
              </CardHeader>
              <CardContent className="h-[340px]">
                {isLoading ? <Skeleton className="h-full w-full" /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueByBranch} stackOffset="none" margin={{ left: 8, right: 8 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-10} height={60} />
                      <YAxis tickFormatter={(v) => INR.format(v).replace("₹", "")} />
                      <Tooltip formatter={(v: number) => INR.format(v)} />
                      <Legend />
                      <Bar dataKey="food" name="F&B" stackId="a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="room" name="Room" stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TABLE VIEW */}
          <TabsContent value="table">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Branch Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">F&amp;B</TableHead>
                        <TableHead className="text-right">Room</TableHead>
                        <TableHead className="text-right">Today</TableHead>
                        <TableHead className="text-right">Bookings</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                        <TableHead className="text-right">Rooms</TableHead>
                        <TableHead className="text-right">Tables</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(isLoading ? Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                          {Array.from({ length: 9 }).map((__, j) => (
                            <TableCell key={j} className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                          ))}
                        </TableRow>
                      )) : filtered.map((o) => {
                        const roomRevenue = Math.max(0, toNumber(o.total_revenue) - toNumber(o.food_revenue));
                        return (
                          <TableRow key={o.outlet_id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedOutlet(o)}>
                            <TableCell className="font-medium">{o.outlet_name}</TableCell>
                            <TableCell className="text-right">{fmtInt(o.total_orders)}</TableCell>
                            <TableCell className="text-right">{INR.format(toNumber(o.total_revenue))}</TableCell>
                            <TableCell className="text-right">{INR.format(toNumber(o.food_revenue))}</TableCell>
                            <TableCell className="text-right">{INR.format(roomRevenue)}</TableCell>
                            <TableCell className="text-right">{fmtInt(o.today_orders)}</TableCell>
                            <TableCell className="text-right">{fmtInt(o.total_bookings)}</TableCell>
                            <TableCell className="text-right">{fmtInt(o.active_bookings)}</TableCell>
                            <TableCell className="text-right">{fmtInt(o.total_rooms)}</TableCell>
                            <TableCell className="text-right">{fmtInt(o.total_tables)}</TableCell>
                          </TableRow>
                        );
                      }))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CARD VIEW (per-branch quick tiles) */}
          <TabsContent value="cards">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(isLoading ? Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}><CardContent className="p-6"><Skeleton className="h-6 w-40 mb-3" /><Skeleton className="h-5 w-24" /><Skeleton className="h-40 w-full mt-4" /></CardContent></Card>
              )) : filtered.map((o, i) => {
                const roomRevenue = Math.max(0, toNumber(o.total_revenue) - toNumber(o.food_revenue));
                const pie = [
                  { name: "F&B", value: toNumber(o.food_revenue), color: "#6366f1" },
                  { name: "Room", value: roomRevenue, color: "#22c55e" },
                ];
                return (
                  <Card key={o.outlet_id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xl">{o.outlet_name}</CardTitle>
                        <Badge variant="secondary">{fmtInt(o.today_orders)} today</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <MiniKpi label="Orders" value={fmtInt(o.total_orders)} />
                        <MiniKpi label="Revenue" value={INR.format(toNumber(o.total_revenue))} />
                        <MiniKpi label="Bookings" value={fmtInt(o.total_bookings)} />
                      </div>
                      <div className="h-[160px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Tooltip formatter={(v: number) => INR.format(v)} />
                            <Pie
                              data={pie}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={45}
                              outerRadius={70}
                              paddingAngle={2}
                            >
                              {pie.map((p, idx) => <Cell key={idx} fill={p.color} />)}
                            </Pie>
                            {/* simple legend */}
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <Button variant="ghost" className="w-full mt-1" onClick={() => setSelectedOutlet(o)}>
                        Details <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              }))}
            </div>
          </TabsContent>
        </Tabs>

        {/* DETAILS SHEET */}
        <Sheet open={!!selectedOutlet} onOpenChange={(open) => !open && setSelectedOutlet(null)}>
          <SheetContent side="right" className="w-full sm:w-[520px]">
            <SheetHeader>
              <SheetTitle>{selectedOutlet?.outlet_name}</SheetTitle>
              <SheetDescription>Quick breakdown</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              {selectedOutlet && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Kpi compact title="Orders" icon={<ShoppingBag className="h-4 w-4" />} value={fmtInt(selectedOutlet.total_orders)} />
                    <Kpi compact title="Revenue" icon={<DollarSign className="h-4 w-4" />} value={INR.format(toNumber(selectedOutlet.total_revenue))} />
                    <Kpi compact title="Today" icon={<Calendar className="h-4 w-4" />} value={fmtInt(selectedOutlet.today_orders)} />
                    <Kpi compact title="Bookings" icon={<Hotel className="h-4 w-4" />} value={fmtInt(selectedOutlet.total_bookings)} hint={`${fmtInt(selectedOutlet.active_bookings)} active`} />
                  </div>
                  <Separator />
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip formatter={(v: number) => INR.format(v)} />
                        <Pie
                          data={[
                            { name: "F&B", value: toNumber(selectedOutlet.food_revenue), color: "#6366f1" },
                            { name: "Room", value: Math.max(0, toNumber(selectedOutlet.total_revenue) - toNumber(selectedOutlet.food_revenue)), color: "#22c55e" },
                          ]}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={2}
                          label={(p) => `${p.name}`}
                        >
                          <Cell fill="#6366f1" />
                          <Cell fill="#22c55e" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <MiniKpi label="Rooms" value={fmtInt(selectedOutlet.total_rooms)} />
                    <MiniKpi label="Tables" value={fmtInt(selectedOutlet.total_tables)} />
                  </div>
                </>
              )}
            </div>
            <SheetFooter className="mt-4">
              <SheetTrigger asChild>
                <Button variant="outline" onClick={() => setSelectedOutlet(null)}>Close</Button>
              </SheetTrigger>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
};

export default Analytics;

// ---------- Reusable bits
function Kpi({
  title, value, icon, hint, compact = false,
}: { title: string; value: string; icon: React.ReactNode; hint?: string; compact?: boolean; }) {
  return (
    <Card className={compact ? "" : "hover:shadow-sm transition-shadow"}>
      <CardHeader className={compact ? "py-3" : "pb-2"}>
        <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
          {icon}{title}{hint ? <Badge variant="outline" className="ml-auto">{hint}</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? "pt-0 pb-3" : ""}>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
