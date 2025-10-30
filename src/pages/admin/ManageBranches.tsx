import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRequireAdminAccess, getAdminOutlets } from "@/hooks/useAdminAccess";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search as SearchIcon,
  Trash2,
} from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/apiClient";

type StatusFilter = "all" | "active" | "inactive";

type Branch = {
  id: string;
  location_key: string;
  name?: string;
  address?: string;
  contact_number?: string;
  contact_email?: string;
  google_maps_url?: string;
  sort_order?: number;
  is_active: boolean;
};

type BranchFormData = {
  location_key: string;
  name: string;
  address: string;
  contact_number: string;
  contact_email: string;
  google_maps_url: string;
  sort_order: string;
  is_active: boolean;
};

type MutationInput =
  | { action: "create"; data: Record<string, unknown> }
  | { action: "update"; data: Record<string, unknown>; id: string }
  | { action: "delete"; id: string };

const createEmptyForm = (): BranchFormData => ({
  location_key: "",
  name: "",
  address: "",
  contact_number: "",
  contact_email: "",
  google_maps_url: "",
  sort_order: "",
  is_active: true,
});

const readString = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value && typeof value === "object") {
    const anyValue = value as Record<string, unknown>;
    if (typeof anyValue.$oid === "string") return anyValue.$oid;
    if (typeof (value as { toString?: () => string }).toString === "function") {
      const str = (value as { toString: () => string }).toString();
      if (str && str !== "[object Object]") return str;
    }
  }
  return "";
};

const readNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const readBoolean = (value: unknown, fallback = true): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    if (["true", "1", "yes", "active"].includes(normalised)) return true;
    if (["false", "0", "no", "inactive"].includes(normalised)) return false;
  }
  return fallback;
};

const normaliseBranch = (raw: any): Branch => {
  const id = readString(raw?._id ?? raw?.id);
  const locationKey =
    readString(raw?.location_key) ||
    readString(raw?.outlet_id) ||
    readString(raw?.code) ||
    "";

  const sortCandidate =
    raw?.sort_order ?? raw?.display_order ?? raw?.order ?? raw?.priority;

  return {
    id: id || locationKey,
    location_key: locationKey,
    name:
      typeof raw?.name === "string"
        ? raw.name
        : typeof raw?.display_name === "string"
        ? raw.display_name
        : "",
    address:
      typeof raw?.address === "string"
        ? raw.address
        : typeof raw?.address_line === "string"
        ? raw.address_line
        : "",
    contact_number:
      typeof raw?.contact_number === "string"
        ? raw.contact_number
        : typeof raw?.contact === "string"
        ? raw.contact
        : typeof raw?.phone === "string"
        ? raw.phone
        : "",
    contact_email:
      typeof raw?.contact_email === "string"
        ? raw.contact_email
        : typeof raw?.email === "string"
        ? raw.email
        : "",
    google_maps_url:
      typeof raw?.google_maps_url === "string"
        ? raw.google_maps_url
        : typeof raw?.map_url === "string"
        ? raw.map_url
        : typeof raw?.maps_url === "string"
        ? raw.maps_url
        : "",
    sort_order: readNumber(sortCandidate),
    is_active: readBoolean(raw?.is_active, true),
  };
};

const ManageBranches = () => {
  useRequireAdminAccess("admin");

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState<BranchFormData>(() => createEmptyForm());

  const allowedOutlets = useMemo(() => {
    try {
      return getAdminOutlets();
    } catch {
      return ["all"];
    }
  }, []);

  const {
    data: publicOutlets,
    isLoading: isPublicLoading,
    isError: isPublicError,
    error: publicError,
  } = useQuery({
    queryKey: ["public-outlets"],
    queryFn: async () => {
      return apiGet("/public/outlets");
    },
    staleTime: 60_000,
  });

  const {
    data: adminBranches = [],
    isLoading: isAdminLoading,
    error: adminError,
  } = useQuery<Branch[], Error>({
    queryKey: ["admin-branches"],
    queryFn: async () => {
      const payload = await apiPost<{ outlets?: any[] } | any[]>(
        "/admin/outlets/manage",
        { action: "list" },
        true,
      );
      const rawList: any[] = Array.isArray(payload?.outlets)
        ? payload.outlets
        : Array.isArray(payload)
        ? payload
        : [];

      return rawList.map(normaliseBranch).filter((branch) => branch.location_key.length > 0);
    },
    staleTime: 60_000,
  });

  const normalisedPublicBranches = useMemo(() => {
    const raw = Array.isArray((publicOutlets as any)?.outlets)
      ? (publicOutlets as any).outlets
      : Array.isArray(publicOutlets)
      ? publicOutlets
      : [];
    return raw.map(normaliseBranch).filter((branch) => branch.location_key.length > 0);
  }, [publicOutlets]);

  const mergedBranches = useMemo(() => {
    const map = new Map<string, Branch>();
    adminBranches.forEach((branch) => {
      const key = branch.location_key.trim().toLowerCase();
      map.set(key, branch);
    });
    normalisedPublicBranches.forEach((branch) => {
      const key = branch.location_key.trim().toLowerCase();
      if (map.has(key)) {
        map.set(key, { ...map.get(key)!, ...branch });
      } else {
        map.set(key, branch);
      }
    });
    return Array.from(map.values());
  }, [adminBranches, normalisedPublicBranches]);

  const allowedOutletKeys = useMemo(() => {
    const list = allowedOutlets.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    return {
      all: list.includes("all"),
      set: new Set(list),
    };
  }, [allowedOutlets]);

  const canManageBranch = useCallback(
    (branch: { location_key?: string | null }) => {
      const key = branch?.location_key?.trim().toLowerCase();
      if (!key) return allowedOutletKeys.all;
      return allowedOutletKeys.all || allowedOutletKeys.set.has(key);
    },
    [allowedOutletKeys],
  );

  const mutation = useMutation({
    mutationFn: async (variables: MutationInput) => {
      const { action, ...rest } = variables;
      const payload = { action, ...rest };
      return apiPost("/admin/outlets/manage", payload, true);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      queryClient.invalidateQueries({ queryKey: ["public-outlets"] });
      if (variables.action !== "delete") {
        setIsDialogOpen(false);
        setEditingBranch(null);
        resetForm();
      }
      const actionLabel =
        variables.action === "delete"
          ? "Branch deleted."
          : variables.action === "update"
          ? "Branch updated."
          : "Branch created.";
      toast.success(actionLabel);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to update branch.";
      toast.error(message);
    },
  });

  const resetForm = () => {
    setFormData(createEmptyForm());
  };

  const handleDialogToggle = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingBranch(null);
      resetForm();
    }
  };

  const selectAdminBranch = (branch: Branch) => {
    const key = branch.location_key.trim().toLowerCase();
    return (
      adminBranches.find(
        (candidate) => candidate.location_key.trim().toLowerCase() === key && candidate.id
      ) ?? branch
    );
  };

  const handleEdit = (branch: Branch) => {
    if (!canManageBranch(branch)) {
      toast.error("You do not have permission to modify this branch.");
      return;
    }
    const source = selectAdminBranch(branch);
    setEditingBranch(source);
    setFormData({
      location_key: source.location_key ?? "",
      name: source.name ?? "",
      address: source.address ?? "",
      contact_number: source.contact_number ?? "",
      contact_email: source.contact_email ?? "",
      google_maps_url: source.google_maps_url ?? "",
      sort_order:
        typeof source.sort_order === "number" ? String(source.sort_order) : source.sort_order ?? "",
      is_active: source.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (branch: Branch) => {
    if (!canManageBranch(branch)) {
      toast.error("You do not have permission to modify this branch.");
      return;
    }
    const source = selectAdminBranch(branch);
    const confirmed = window.confirm(
      `Delete branch “${source.name || source.location_key}”? This cannot be undone.`,
    );
    if (!confirmed) return;
    mutation.mutate({ action: "delete", id: source.id });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedKey = formData.location_key.trim();
    if (!trimmedKey) {
      toast.error("Location key is required.");
      return;
    }

    const payload: Record<string, unknown> = {
      location_key: trimmedKey,
      is_active: formData.is_active,
    };

    const addIfPresent = (field: keyof BranchFormData, key: string) => {
      const value = formData[field].trim();
      if (value) payload[key] = value;
    };

    addIfPresent("name", "name");
    addIfPresent("address", "address");
    addIfPresent("contact_number", "contact_number");
    addIfPresent("contact_email", "contact_email");
    addIfPresent("google_maps_url", "google_maps_url");

    if (formData.sort_order.trim()) {
      const parsed = Number(formData.sort_order);
      if (Number.isFinite(parsed)) {
        payload.sort_order = parsed;
      }
    }

    if (editingBranch) {
      mutation.mutate({ action: "update", id: editingBranch.id, data: payload });
    } else {
      mutation.mutate({ action: "create", data: payload });
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
    queryClient.invalidateQueries({ queryKey: ["public-outlets"] });
  };

  const filteredBranches = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return mergedBranches
      .filter((branch) => {
        const matchesStatus =
          statusFilter === "all"
            ? true
            : statusFilter === "active"
            ? branch.is_active
            : !branch.is_active;
        if (!matchesStatus) return false;

        if (!search) return true;

        const haystack = [
          branch.location_key,
          branch.name,
          branch.address,
          branch.contact_number,
          branch.contact_email,
        ]
          .map((value) => value?.toLowerCase?.() ?? "")
          .filter(Boolean);

        return haystack.some((value) => value.includes(search));
      })
      .sort((a, b) => {
        const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        const labelA = (a.name || a.location_key || "").toLowerCase();
        const labelB = (b.name || b.location_key || "").toLowerCase();
        return labelA.localeCompare(labelB);
      });
  }, [mergedBranches, searchTerm, statusFilter]);

  const isLoading = isAdminLoading || isPublicLoading;
  const combinedError: Error | null =
    adminError ??
    (isPublicError
      ? publicError instanceof Error
        ? publicError
        : new Error(
            typeof publicError === "object" && publicError && "message" in publicError
              ? String((publicError as { message?: unknown }).message)
              : "Failed to load outlets."
          )
      : null);
  const isError = Boolean(combinedError);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Manage Branches</h1>
              <p className="text-sm text-muted-foreground">
                Create, update, and deactivate restaurant outlets.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader className="gap-2">
            <CardTitle>Branches</CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading branches…"
                : `${filteredBranches.length} ${
                    filteredBranches.length === 1 ? "branch" : "branches"
                  } visible`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-xs">
                <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by name, code, contact…"
                  className="pl-9"
                />
              </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleRefresh} disabled={isLoading || mutation.isPending}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>

                  <Dialog open={isDialogOpen} onOpenChange={handleDialogToggle}>
                    <DialogTrigger asChild>
                      <Button
                        disabled={mutation.isPending}
                        onClick={() => {
                          resetForm();
                          setEditingBranch(null);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Branch
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>{editingBranch ? "Edit Branch" : "Add Branch"}</DialogTitle>
                        <DialogDescription>
                          Branch location keys are used across bookings, menu, and analytics.
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="location_key">Location Key *</Label>
                            <Input
                              id="location_key"
                              value={formData.location_key}
                              onChange={(event) =>
                                setFormData((prev) => ({ ...prev, location_key: event.target.value }))
                              }
                              placeholder="redchilly-hq"
                              required
                              disabled={mutation.isPending}
                            />
                            <p className="text-xs text-muted-foreground">
                              Use a unique, URL-safe key. Example: redchilly-hq
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="name">Display Name</Label>
                            <Input
                              id="name"
                              value={formData.name}
                              onChange={(event) =>
                                setFormData((prev) => ({ ...prev, name: event.target.value }))
                              }
                              placeholder="Red Chilly HQ"
                              disabled={mutation.isPending}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="address">Address</Label>
                          <Textarea
                            id="address"
                            rows={3}
                            value={formData.address}
                            onChange={(event) =>
                              setFormData((prev) => ({ ...prev, address: event.target.value }))
                            }
                            placeholder="Street, City, PIN"
                            disabled={mutation.isPending}
                          />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="contact_number">Contact Number</Label>
                            <Input
                              id="contact_number"
                              value={formData.contact_number}
                              onChange={(event) =>
                                setFormData((prev) => ({ ...prev, contact_number: event.target.value }))
                              }
                              placeholder="+91 98765 43210"
                              disabled={mutation.isPending}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="contact_email">Contact Email</Label>
                            <Input
                              id="contact_email"
                              type="email"
                              value={formData.contact_email}
                              onChange={(event) =>
                                setFormData((prev) => ({ ...prev, contact_email: event.target.value }))
                              }
                              placeholder="contact@redchilly.in"
                              disabled={mutation.isPending}
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
                          <div className="space-y-2">
                            <Label htmlFor="google_maps_url">Google Maps URL</Label>
                            <Input
                              id="google_maps_url"
                              value={formData.google_maps_url}
                              onChange={(event) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  google_maps_url: event.target.value,
                                }))
                              }
                              placeholder="https://maps.google.com/..."
                              disabled={mutation.isPending}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="sort_order">Sort Order</Label>
                            <Input
                              id="sort_order"
                              type="number"
                              value={formData.sort_order}
                              onChange={(event) =>
                                setFormData((prev) => ({ ...prev, sort_order: event.target.value }))
                              }
                              placeholder="0"
                              disabled={mutation.isPending}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border p-4">
                          <div>
                            <p className="text-sm font-medium">Active branch</p>
                            <p className="text-xs text-muted-foreground">
                              Inactive branches are hidden from guest flows.
                            </p>
                          </div>
                          <Switch
                            checked={formData.is_active}
                            onCheckedChange={(checked) =>
                              setFormData((prev) => ({ ...prev, is_active: checked }))
                            }
                            disabled={mutation.isPending}
                          />
                        </div>

                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleDialogToggle(false)}
                            disabled={mutation.isPending}
                          >
                            Cancel
                          </Button>
                          <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending
                              ? "Saving…"
                              : editingBranch
                              ? "Update Branch"
                              : "Create Branch"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border bg-card text-foreground">
              {isError ? (
                <div className="p-6 text-sm text-red-600">
                  {combinedError?.message ?? "Failed to load branches."}
                </div>
              ) : filteredBranches.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  {isLoading
                    ? "Loading branches…"
                    : "No branches match the selected filters."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBranches.map((branch) => (
                      <TableRow key={branch.id ?? branch.location_key}>
                        <TableCell className="align-top">
                          <div className="font-semibold">{branch.name || branch.location_key}</div>
                          <div className="text-xs text-muted-foreground mt-1">{branch.location_key}</div>
                          {typeof branch.sort_order === "number" && (
                            <Badge variant="outline" className="mt-2">
                              Sort {branch.sort_order}
                            </Badge>
                          )}
                          {!canManageBranch(branch) && (
                            <Badge variant="outline" className="mt-2 text-xs uppercase">
                              View only
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          {branch.address ? (
                            <div className="space-y-2">
                              <p className="leading-relaxed text-muted-foreground">{branch.address}</p>
                              {branch.google_maps_url && (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto px-0 text-sm"
                                  asChild
                                >
                                  <a
                                    href={branch.google_maps_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1"
                                  >
                                    <MapPin className="h-4 w-4" />
                                    View map
                                  </a>
                                </Button>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          <div className="space-y-1">
                            {branch.contact_number && <div>{branch.contact_number}</div>}
                            {branch.contact_email && (
                              <div className="text-xs text-muted-foreground">
                                {branch.contact_email}
                              </div>
                            )}
                            {!branch.contact_number && !branch.contact_email && (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant={branch.is_active ? "secondary" : "destructive"}>
                            {branch.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(branch)}
                              aria-label={`Edit ${branch.name || branch.location_key}`}
                              disabled={mutation.isPending || !canManageBranch(branch)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(branch)}
                              aria-label={`Delete ${branch.name || branch.location_key}`}
                              disabled={mutation.isPending || !canManageBranch(branch)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ManageBranches;
