import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, Pencil, Trash2, Leaf, Clock, CircleAlert, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { getAdminOutlets, useRequireAdminAccess } from "@/hooks/useAdminAccess";
import { apiPost, ApiError } from "@/lib/apiClient";

/**
 * NOTE ON FIELDS
 * - The list API returns items with `price` while the create/update form used `base_price`.
 * - We normalize in UI: form uses `price` and the mutation maps to `base_price` for backend.
 */

const currency = (n?: number) =>
  typeof n === "number" && !Number.isNaN(n) ? n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }) : "₹0";

const ManageMenuItems = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useRequireAdminAccess(["admin", "kitchen"]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [search, setSearch] = useState("");
  const [vegFilter, setVegFilter] = useState<"all" | "veg" | "nonveg">("all");
  const [availFilter, setAvailFilter] = useState<"all" | "available" | "unavailable">("all");
  const [outletFilter, setOutletFilter] = useState<string>("all"); // NEW: outlet filter
  const [sortBy, setSortBy] = useState<"newest" | "priceAsc" | "priceDesc" | "name">("newest");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    category_id: "",
    outlet_id: "",
    prep_time_minutes: "15",
    is_veg: true,
    is_available: true,
    image_url: "",
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-menu-items"],
    queryFn: async () => {
      return apiPost<{
        items: any[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>("/admin/menu-items/manage", { action: "list" }, true);
    },
  });

  /**
   * Validated outlet list
   */
  const {
    data: validatedOutlet,
    isLoading: isOutletLoading,
    isError: isOutletError,
  } = useQuery({
    queryKey: ["validated-location"],
    queryFn: async () => {
      const response = await apiPost<{ outlet?: Array<{ _id?: string; location_key?: string }> }>(
        "/public/locations/validate",
        {},
      );
      return (response as any)?.outlet as [{ _id?: string; location_key?: string }];
    },
  });

  const outlet_ids_list =
    validatedOutlet && validatedOutlet.length > 0
      ? validatedOutlet
          .map((o) => o.location_key)
          .filter((location_key): location_key is string => typeof location_key === "string")
      : [];

  // If there is exactly one outlet, auto-select it for both the filter and the form
  useEffect(() => {
    if (outlet_ids_list.length === 1) {
      const only = outlet_ids_list[0]!;
      setOutletFilter((prev) => (prev === "all" ? only : prev));
      setFormData((f) => ({ ...f, outlet_id: f.outlet_id || only }));
    }
  }, [outlet_ids_list]);

  const { data: categories, isLoading: isCategoriesLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      return apiPost("/admin/categories/manage", { action: "list" }, true);
    },
  });

  const categoryList = categories && Array.isArray(categories)
    ? [...new Set(categories.map((c: any) => c.name || "").filter((name: string) => name))]
    : [];

  const items = data?.items || [];

  const mutation = useMutation({
    mutationFn: async ({ action, data, id }: any) => {
      return apiPost("/admin/menu-items/manage", { action, data, id }, true);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-menu-items"] });
      setIsDialogOpen(false);
      setEditingItem(null);
      resetForm();
      toast.success(
        vars?.action === "delete"
          ? "Menu item deleted"
          : vars?.action === "update"
          ? "Menu item updated"
          : "Menu item created"
      );
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
          ? error.message
          : "Failed to update menu item";
      toast.error(message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      price: "",
      category_id: "",
      outlet_id: outletFilter !== "all" ? outletFilter : "", // keep outlet aligned with filter
      prep_time_minutes: "15",
      is_veg: true,
      is_available: true,
      image_url: "",
    });
    setPreviewUrl("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      base_price: parseFloat(formData.price || "0"), // backend expects base_price
      prep_time_minutes: parseInt(formData.prep_time_minutes || "0"),
    };
    delete (submitData as any).price;

    if (editingItem) {
      mutation.mutate({ action: "update", data: submitData, id: editingItem._id || editingItem.id });
    } else {
      mutation.mutate({ action: "create", data: submitData });
    }
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({
      name: item.name || "",
      description: item.description || "",
      price: String(item.price ?? item.base_price ?? ""),
      category_id: item.category_id || "",
      outlet_id: item.outlet_id || "",
      prep_time_minutes: String(item.prep_time_minutes ?? 15),
      is_veg: !!item.is_veg,
      is_available: !!item.is_available,
      image_url: item.image_url || "",
    });
    setPreviewUrl(item.image_url || "");
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this menu item?")) {
      mutation.mutate({ action: "delete", id });
    }
  };

  // Build filtered list first (including the outlet filter), then sort
  const filteredSorted = useMemo(() => {
    let res = [...items];

    // 1) Outlet filter (NEW)
    if (outletFilter !== "all") {
      res = res.filter((i) => String(i.outlet_id || "").toLowerCase() === outletFilter.toLowerCase());
    }

    // 2) Search filter
    if (search.trim()) {
      const s = search.toLowerCase();
      res = res.filter((i) =>
        [i.name, i.description, i.category, i.category_id].some((v: any) => String(v || "").toLowerCase().includes(s))
      );
    }

    // 3) Veg filter
    if (vegFilter !== "all") {
      res = res.filter((i) => (vegFilter === "veg" ? i.is_veg : !i.is_veg));
    }

    // 4) Availability filter
    if (availFilter !== "all") {
      res = res.filter((i) => (availFilter === "available" ? i.is_available : !i.is_available));
    }

    // 5) Sort
    switch (sortBy) {
      case "priceAsc":
        res.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
        break;
      case "priceDesc":
        res.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
        break;
      case "name":
        res.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        break;
      case "newest":
      default:
        res.sort(
          (a, b) =>
            new Date(b.updated_at || b.created_at || 0).getTime() -
            new Date(a.updated_at || a.created_at || 0).getTime()
        );
        break;
    }
    return res;
  }, [items, outletFilter, search, vegFilter, availFilter, sortBy]);

  // Stats reflect the currently filtered view (more intuitive when filtering by outlet)
  const total = filteredSorted.length;
  const availableCount = filteredSorted.filter((i: any) => i.is_available).length;
  const vegCount = filteredSorted.filter((i: any) => i.is_veg).length;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,hsl(var(--muted)/0.5)_0%,transparent_220px)]">
      <header className="bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60 border-b sticky top-0 z-20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold leading-none">Manage Menu Items</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Create, edit, and control availability in one place.
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    resetForm();
                    setEditingItem(null);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>{editingItem ? "Edit" : "Add"} Menu Item</DialogTitle>
                  <DialogDescription>Fill out details. You can toggle availability anytime.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="name">Name *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="price">Price (₹) *</Label>
                          <Input
                            id="price"
                            type="number"
                            step="0.01"
                            value={formData.price}
                            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="prep_time">Prep Time (min) *</Label>
                          <Input
                            id="prep_time"
                            type="number"
                            value={formData.prep_time_minutes}
                            onChange={(e) =>
                              setFormData({ ...formData, prep_time_minutes: e.target.value })
                            }
                            required
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label id="category_label">Category</Label>
                          <Select
                            value={formData.category_id || ""}
                            onValueChange={(v) => setFormData({ ...formData, category_id: v })}
                            disabled={isCategoriesLoading || categoryList.length === 0}
                          >
                            <SelectTrigger aria-labelledby="category_label" className="h-10 w-full bg-white">
                              <SelectValue
                                placeholder={isCategoriesLoading ? "Loading categories..." : "Select Category"}
                              />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              {categoryList.length > 0 ? (
                                categoryList.map((o) => (
                                  <SelectItem key={o} value={o}>
                                    {o}
                                  </SelectItem>
                                ))
                              ) : (
                                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                  {isCategoriesLoading ? "Loading..." : "No Categories found"}
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* dropdown for outlet selection from outlet_ids_list */}
                        <div className="space-y-2">
                          <Label id="outlet_label">Outlet</Label>
                          <Select
                            value={formData.outlet_id || ""}
                            onValueChange={(v) => setFormData({ ...formData, outlet_id: v })}
                            disabled={isOutletLoading || outlet_ids_list.length === 0}
                          >
                            <SelectTrigger aria-labelledby="outlet_label" className="h-10 w-full bg-white">
                              <SelectValue
                                placeholder={isOutletLoading ? "Loading outlets..." : "Select Outlet"}
                              />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              {outlet_ids_list.length > 0 ? (
                                outlet_ids_list.map((o) => (
                                  <SelectItem key={o} value={o}>
                                    {o}
                                  </SelectItem>
                                ))
                              ) : (
                                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                  {isOutletLoading ? "Loading..." : "No outlets found"}
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="image_url">Image URL</Label>
                        <Input
                          id="image_url"
                          value={formData.image_url}
                          onChange={(e) => {
                            setFormData({ ...formData, image_url: e.target.value });
                            setPreviewUrl(e.target.value);
                          }}
                          placeholder="https://..."
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-6 pt-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            id="is_veg"
                            checked={formData.is_veg}
                            onCheckedChange={(checked) => setFormData({ ...formData, is_veg: checked })}
                          />
                          <Label htmlFor="is_veg" className="flex items-center gap-1">
                            Vegetarian <Leaf className="w-3.5 h-3.5 text-green-600" />
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            id="is_available"
                            checked={formData.is_available}
                            onCheckedChange={(checked) =>
                              setFormData({ ...formData, is_available: checked })
                            }
                          />
                          <Label htmlFor="is_available">Available</Label>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Clock className="w-4 h-4" /> {formData.prep_time_minutes || 0} min
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-muted/30 flex items-center justify-center overflow-hidden">
                      {previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          onError={() => setPreviewUrl("")}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground py-12 w-full">
                          <ImageIcon className="w-8 h-8 mb-2" />
                          <span className="text-xs">Image preview</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={mutation.isPending}>
                    {mutation.isPending ? "Saving..." : editingItem ? "Save changes" : "Create item"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Stats & Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-background p-4">
                <div className="text-sm text-muted-foreground">Items (after filters)</div>
                <div className="text-2xl font-semibold">{total}</div>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <div className="text-sm text-muted-foreground">Available</div>
                <div className="text-2xl font-semibold">{availableCount}</div>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <div className="text-sm text-muted-foreground">Veg</div>
                <div className="text-2xl font-semibold">{vegCount}</div>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <div className="text-sm text-muted-foreground">Updated</div>
                <div className="text-2xl font-semibold">{new Date().toLocaleString()}</div>
              </div>
            </div>

            <Separator className="my-6" />

            {/* Filters Row — added Outlet filter as the first control */}
            <div className="grid gap-3 md:grid-cols-[220px_1fr_180px_180px_180px]">
              {/* Outlet Filter (NEW) */}
              <Select value={outletFilter} onValueChange={(v) => setOutletFilter(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Outlet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Outlets</SelectItem>
                  {outlet_ids_list.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                placeholder="Search by name, description, or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <Select value={vegFilter} onValueChange={(v: any) => setVegFilter(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Veg filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="veg">Veg only</SelectItem>
                  <SelectItem value="nonveg">Non-Veg only</SelectItem>
                </SelectContent>
              </Select>

              <Select value={availFilter} onValueChange={(v: any) => setAvailFilter(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Availability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="priceAsc">Price: Low → High</SelectItem>
                  <SelectItem value="priceDesc">Price: High → Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Error State */}
        {isError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <CircleAlert className="h-4 w-4 text-destructive" />
            <span className="text-destructive font-medium">
              {(error as any)?.message || "Something went wrong."}
            </span>
          </div>
        )}

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-2/3" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-40 w-full mb-3" />
                  <Skeleton className="h-3 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
                <CardFooter className="flex justify-between">
                  <Skeleton className="h-8 w-20" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredSorted.length === 0 && (
          <Card className="p-10 flex flex-col items-center text-center">
            <ImageIcon className="w-10 h-10 text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold">No items match your filters</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Try adjusting search or create a new item.
            </p>
            <Button
              onClick={() => {
                resetForm();
                setEditingItem(null);
                setIsDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" /> Add your first item
            </Button>
          </Card>
        )}

        {/* Grid */}
        {!isLoading && filteredSorted.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSorted.map((item: any) => (
              <Card key={item._id || item.id} className="overflow-hidden group">
                {/* Image */}
                <div className="aspect-[16/9] bg-muted/50 overflow-hidden">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                </div>

                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{item.name}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {item.is_veg ? (
                          <Badge variant="secondary" className="border border-green-600/30">
                            Veg
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="border border-amber-600/30">
                            Non-Veg
                          </Badge>
                        )}
                        <Badge
                          variant={item.is_available ? "default" : "secondary"}
                          className={!item.is_available ? "bg-muted text-muted-foreground" : ""}
                        >
                          {item.is_available ? "Available" : "Unavailable"}
                        </Badge>
                        {item.category && <Badge variant="outline">{item.category}</Badge>}
                        {item.outlet_id && (
                          <Badge variant="outline" className="opacity-80">
                            {item.outlet_id}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">{currency(item.price)}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                        <Clock className="w-3.5 h-3.5" /> {item.prep_time_minutes} min
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {item.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                  )}
                </CardContent>

                <CardFooter className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    Updated {new Date(item.updated_at || item.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(item)}
                      className="hover:bg-primary/10"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(item._id || item.id)}
                      className="hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination (client-side placeholder that reflects API totals) */}
        {data?.totalPages && data.totalPages > 1 && (
          <div className="flex justify-center items-center gap-3 mt-8 text-sm text-muted-foreground">
            <span>
              Page {data.page} of {data.totalPages}
            </span>
          </div>
        )}
      </main>
    </div>
  );
};

export default ManageMenuItems;
