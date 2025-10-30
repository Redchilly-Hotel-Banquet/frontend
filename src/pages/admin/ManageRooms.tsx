// ManageRooms.tsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import QRCode from "qrcode";
import JSZip from "jszip";
import { apiPost, ApiError } from "@/lib/apiClient";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  QrCode,
  Copy,
  ExternalLink,
  Download,
  CalendarPlus,
  Loader2,
  Search as SearchIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { getAdminOutlets, useRequireAdminAccess } from "@/hooks/useAdminAccess";

type RoomType = "ROOM" | "TABLE";

type Room = {
  _id?: string;
  id?: string;
  code: string;            // room/table number or code
  type: RoomType;
  outlet_id?: string | null;
  is_active: boolean;
  price_per_night?: number;
  room_type?: string;
  occupancy?: number;
  amenities?: string[];
};

type FilterMode =
  | "ALL"
  | "ROOM"
  | "TABLE"
  | "OUTLET"
  | "ROOM_OUTLET"
  | "TABLE_OUTLET";

type ActiveBookingSummary = {
  id: string;
  guest_name?: string;
  booking_code?: string;
  status?: string;
  check_in_date?: string;
  check_out_date?: string;
  total_amount?: number;
  rooms_allocated?: Array<Record<string, unknown>>;
};

type ExtensionSummary = {
  previousCheckOut: string | Date;
  newCheckOut: string | Date;
  previousTotal: number;
  newTotal: number;
  additionalAmount: number;
  previousNights: number;
  newNights: number;
};

const ROOM_PAGE_SIZE = 8;

/** ===================== NEW: QR Branding Helpers ===================== */
const LOGO_URL = "/logo.jpeg"; // served from public/logo.jpeg

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/**
 * Draw text centered at bottom with sensible wrapping.
 */
function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  xCenter: number,
  yTop: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);

  const totalHeight = lines.length * lineHeight;
  let y = yTop;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    ctx.fillText(line, xCenter - w / 2, y);
    y += lineHeight;
  }
}

/**
 * Generate a branded QR image:
 * - White background
 * - Logo centered at top
 * - Square QR in the middle
 * - Label text centered at bottom
 */
async function generateBrandedQrPng(
  qrDataUrl: string,
  label: string
): Promise<string> {
  // Layout constants (tuned for print clarity)
  const CANVAS_W = 1400;
  const CANVAS_H = 1800;
  const PADDING = 60;

  const HEADER_H = 260; // logo area
  const FOOTER_H = 220; // text area

  // Compute QR square area
  const qrAreaTop = PADDING + HEADER_H + PADDING;
  const qrAreaBottom = CANVAS_H - (PADDING + FOOTER_H + PADDING);
  const qrAreaHeight = qrAreaBottom - qrAreaTop;
  const qrSize = Math.min(CANVAS_W - PADDING * 2, qrAreaHeight);

  // Prepare canvas
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Draw logo (scaled to fit header)
  try {
    const logo = await loadImage(LOGO_URL);
    const maxLogoW = CANVAS_W * 0.55;
    const maxLogoH = HEADER_H * 0.8;
    const logoRatio = Math.min(maxLogoW / logo.width, maxLogoH / logo.height);
    const logoW = Math.max(1, Math.floor(logo.width * logoRatio));
    const logoH = Math.max(1, Math.floor(logo.height * logoRatio));
    const logoX = (CANVAS_W - logoW) / 2;
    const logoY = PADDING + (HEADER_H - logoH) / 2;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(logo, logoX, logoY, logoW, logoH);
  } catch {
    // If logo fails, we just skip it (don’t block QR)
  }

  // Draw QR
  const qrImg = await loadImage(qrDataUrl);
  const qrX = (CANVAS_W - qrSize) / 2;
  const qrY = qrAreaTop + (qrAreaHeight - qrSize) / 2;
  ctx.imageSmoothingEnabled = false; // keep QR crisp
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Footer label
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = "#111111";
  ctx.textBaseline = "top";
  // Big and readable. Fallback stacks to keep it consistent.
  ctx.font = "bold 64px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  const footerTop = CANVAS_H - (PADDING + FOOTER_H) + 20;
  const maxTextWidth = CANVAS_W - PADDING * 2;
  drawCenteredText(ctx, label, CANVAS_W / 2, footerTop, maxTextWidth, 80);

  return canvas.toDataURL("image/png"); // printable PNG
}
/** =================== END: QR Branding Helpers ====================== */

const ManageRooms = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useRequireAdminAccess(["admin", "rooms"]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [formData, setFormData] = useState<Room>({
    code: "",
    type: "ROOM",
    outlet_id: "",
    is_active: true,
    price_per_night: undefined,
    occupancy: 2,
    room_type: "",
    amenities: [],
  });
  const [showPricingDialog, setShowPricingDialog] = useState(false);
  const [pricingForm, setPricingForm] = useState({
    outlet_id: "",
    room_ids: [] as string[],
    mode: "PERCENT" as "PERCENT" | "FIXED",
    percent_increase: 0,
    fixed_rate: "",
    start_date: "",
    end_date: "",
    notes: "",
  });
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [extendTargetRoom, setExtendTargetRoom] = useState<Room | null>(null);
  const [extendBooking, setExtendBooking] = useState<ActiveBookingSummary | null>(null);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [extendDate, setExtendDate] = useState<string>("");
  const [extendSummary, setExtendSummary] = useState<ExtensionSummary | null>(null);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [page, setPage] = useState(1);

  // --- Filters & search ---
  const [filterMode, setFilterMode] = useState<FilterMode>("ALL");
  const [selectedOutlet, setSelectedOutlet] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // QR cache
  const [qrImages, setQrImages] = useState<Record<string, string>>({});

  /** Rooms */
  const {
    data: rooms = [],
    isLoading,
    isError,
    error,
  } = useQuery<Room[], Error>({
    queryKey: ["admin-rooms"],
    queryFn: async () => {
      const response = await apiPost<{ rooms?: Room[] } | Room[]>(
        "/admin/rooms/manage",
        { action: "list" },
        true,
      );
      const payload = Array.isArray(response) ? response : response?.rooms;
      return (payload ?? []) as Room[];
    },
  });

  /** Outlets (validation API gives location_key we can use as human-readable outlet param) */
  const {
    data: validatedOutlet = [],
    isLoading: isOutletLoading,
    isError: isOutletError,
  } = useQuery({
    queryKey: ["validated-location"],
    queryFn: async () => {
      const response = await apiPost<{ outlet?: Array<{ _id?: string; location_key?: string }> }>(
        "/public/locations/validate",
        {},
      );
      const outlets = (response as any)?.outlet ?? [];
      return outlets as Array<{ _id?: string; location_key?: string }>;
    },
  });

  // Outlets list for selects
  const outletIdsFromValidation =
    validatedOutlet?.map((o) => o.location_key).filter((k): k is string => typeof k === "string") ?? [];

  const outletIdsFromRooms = useMemo(() => {
    const s = new Set<string>();
    rooms.forEach((r) => {
      if (r.outlet_id) s.add(r.outlet_id);
    });
    return Array.from(s);
  }, [rooms]);

  const outlet_ids_list =
    outletIdsFromValidation.length > 0 ? outletIdsFromValidation : outletIdsFromRooms;

  const roomCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    rooms.forEach((room) => {
      const id = room._id ?? room.id;
      if (id) map.set(String(id), room.code);
    });
    return map;
  }, [rooms]);

  useEffect(() => {
    if (!pricingForm.outlet_id && outlet_ids_list.length > 0) {
      setPricingForm((prev) => ({ ...prev, outlet_id: outlet_ids_list[0] }));
    }
  }, [outlet_ids_list, pricingForm.outlet_id]);

  useEffect(() => {
    if (!pricingForm.outlet_id || pricingForm.room_ids.length === 0) return;
    setPricingForm((prev) => ({
      ...prev,
      room_ids: prev.room_ids.filter((id) => {
        const room = rooms.find((r) => (r._id ?? r.id)?.toString() === id);
        return room ? room.outlet_id === prev.outlet_id : false;
      }),
    }));
  }, [pricingForm.outlet_id, rooms]);

  const { data: pricingRules = [], refetch: refetchPricing, isLoading: isPricingLoading } = useQuery({
    queryKey: ["room-pricing-rules"],
    enabled: typeof window !== "undefined",
    queryFn: async () => {
      const response = await apiPost<{ rules?: any[] }>(
        "/admin/rooms/pricing",
        { action: "list" },
        true,
      );
      return response?.rules ?? [];
    },
    staleTime: 30_000,
  });

  const sortedPricingRules = useMemo(() => {
    return pricingRules
      .slice()
      .sort((a: any, b: any) => new Date(a.start_date || 0).getTime() - new Date(b.start_date || 0).getTime());
  }, [pricingRules]);

  const extendLookupMutation = useMutation({
    mutationFn: async (roomId: string) => {
      return apiPost<{ booking: ActiveBookingSummary | null }>(
        "/admin/bookings/extensions",
        { action: "lookup", roomId },
        true,
      );
    },
    onSuccess: (data) => {
      const booking = data?.booking ?? null;
      setExtendBooking(booking);
      setExtendSummary(null);
      if (!booking) {
        setExtendError("No active booking is currently assigned to this room.");
        setExtendDate("");
        return;
      }
      setExtendError(null);
      setExtendDate(toDateInput(booking.check_out_date));
    },
    onError: (error: any) => {
      setExtendBooking(null);
      setExtendSummary(null);
      setExtendDate("");
      setExtendError(error?.message ?? "Failed to load booking information.");
    },
  });

  const extendStayMutation = useMutation({
    mutationFn: async (input: { bookingId: string; newCheckOutDate: string }) => {
      return apiPost<{ booking: ActiveBookingSummary | null; summary?: ExtensionSummary }>(
        "/admin/bookings/extensions",
        {
          action: "extend",
          bookingId: input.bookingId,
          newCheckOutDate: input.newCheckOutDate,
        },
        true,
      );
    },
    onSuccess: (data) => {
      setExtendBooking(data?.booking ?? null);
      setExtendSummary(data?.summary ?? null);
      setExtendError(null);
      toast.success("Stay extended successfully.");
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
          ? error.message
          : "Failed to extend stay.";
      toast.error(message);
    },
  });

  const resetForm = () => {
    setFormData({
      code: "",
      type: "ROOM",
      outlet_id: "",
      is_active: true,
      price_per_night: undefined,
      occupancy: 2,
      room_type: "",
      amenities: [],
    });
  };

  /** Create/Update/Delete */
  const mutation = useMutation({
    mutationFn: async ({
      action,
      data,
      id,
    }: {
      action: "create" | "update" | "delete";
      data?: Room;
      id?: string;
    }) => {
      return apiPost("/admin/rooms/manage", { action, data, id }, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-rooms"] });
      setIsDialogOpen(false);
      setEditingRoom(null);
      resetForm();
      toast.success("Room updated successfully!");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to update room";
      toast.error(message);
    },
  });

  const pricingMutation = useMutation<
    any,
    Error,
    { action: "create" | "delete"; rule?: any; id?: string }
  >({
    mutationFn: async ({ action, rule, id }) => {
      return apiPost("/admin/rooms/pricing", { action, rule, id }, true);
    },
    onSuccess: (_, variables) => {
      refetchPricing();
      if (variables.action === "create") {
        setShowPricingDialog(false);
      }
      setPricingForm((prev) => ({ ...prev, room_ids: [], percent_increase: 0, start_date: "", end_date: "", notes: "" }));
      toast.success("Pricing rule updated");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to update pricing";
      toast.error(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(formData.price_per_night ?? 0);
    if (!Number.isFinite(price) || price <= 0) {
      return toast.error("Enter a valid nightly base rate");
    }

    const occupancy =
      formData.type === "ROOM"
        ? Math.max(1, Number(formData.occupancy ?? 0))
        : undefined;

    if (formData.type === "ROOM" && (!Number.isFinite(occupancy) || occupancy < 1)) {
      return toast.error("Enter a valid occupancy for the room");
    }

    const payload: Room = {
      ...formData,
      price_per_night: price,
      occupancy,
      room_type: formData.room_type?.trim() || undefined,
      amenities:
        formData.amenities?.map((item) => item.trim()).filter(Boolean) ?? [],
    };

    if (editingRoom) {
      const id = editingRoom._id ?? editingRoom.id;
      if (!id) return toast.error("Missing room id");
      mutation.mutate({ action: "update", data: payload, id });
    } else {
      mutation.mutate({ action: "create", data: payload });
    }
  };

  const handleEdit = (room: Room) => {
    setEditingRoom(room);
    setFormData({
      code: room.code,
      type: room.type,
      outlet_id: room.outlet_id ?? "",
      is_active: room.is_active,
      price_per_night: room.price_per_night ?? undefined,
      occupancy: room.type === "ROOM" ? room.occupancy ?? 2 : undefined,
      room_type: room.room_type ?? "",
      amenities: Array.isArray(room.amenities) ? room.amenities : [],
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (room: Room) => {
    const id = room._id ?? room.id;
    if (!id) return toast.error("Missing room id");
    if (confirm("Are you sure you want to delete this room/table?")) {
      mutation.mutate({ action: "delete", id });
    }
  };

  const handleToggleRoomInPricing = (roomId: string, checked: boolean) => {
    setPricingForm((prev) => {
      const set = new Set(prev.room_ids);
      if (checked) set.add(roomId);
      else set.delete(roomId);
      return { ...prev, room_ids: Array.from(set) };
    });
  };

  const handleCreatePricingRule = () => {
    if (!pricingForm.outlet_id) {
      return toast.error("Please choose an outlet for the pricing rule");
    }
    if (!pricingForm.start_date) {
      return toast.error("Select a start date for the pricing rule");
    }
    if (pricingForm.mode === "PERCENT" && !pricingForm.percent_increase) {
      return toast.error("Enter a markup percentage");
    }
    if (pricingForm.mode === "FIXED" && !pricingForm.fixed_rate) {
      return toast.error("Enter the new nightly rate");
    }
    if (pricingForm.end_date && pricingForm.end_date < pricingForm.start_date) {
      return toast.error("End date cannot be before start date");
    }
    pricingMutation.mutate({ action: "create", rule: pricingForm });
  };

  const handleDeletePricingRule = (ruleId: string) => {
    pricingMutation.mutate({ action: "delete", id: ruleId });
  };

  // ---------- QR helpers ----------
  const hostUrl = useMemo(() => {
    return import.meta.env.VITE_PUBLIC_HOST_URL || window.location.origin;
  }, []);

  // Resolve outlet param: prefer validatedOutlet.location_key if we can match; else fallback to room.outlet_id
  const resolveOutletForParam = (room: Room) => {
    const raw = (room.outlet_id ?? "").trim();
    if (!raw) return "";
    const match = (validatedOutlet as Array<any>)?.find(
      (o) => o?.location_key === raw || o?._id === raw
    );
    return (match?.location_key ?? raw).trim();
  };

  // Rooms -> ?room=... ; Tables -> ?table=...
  const buildQrUrl = (room: Room) => {
    const key = room.type === "TABLE" ? "table" : "room";
    const code = (room.code ?? "").trim();
    const outlet = resolveOutletForParam(room);
    const qs = new URLSearchParams({ [key]: code, outlet });
    return `${hostUrl}/qr?${qs.toString()}`;
  };

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const toDateInput = (value?: string | Date | null) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatDisplayDate = (value?: string | Date | null) => {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const addDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  };

  const computeRoomAssets = (room: Room) => {
    const keyParam = room.type === "TABLE" ? "table" : "room";
    const outlet = resolveOutletForParam(room) || "outlet";
    const identity = `${keyParam}=${room.code}::${outlet}`;
    const cacheKey = (room._id ?? room.id ?? identity)?.toString?.() ?? identity;
    const fileName = `qr-${slugify(`${keyParam}-${room.code}-outlet-${outlet}`)}.png`;
    return { keyParam, outlet, identity, cacheKey, fileName };
  };

  const generateBrandedQrImage = async (room: Room) => {
    const url = buildQrUrl(room);
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 1024,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFFFF" },
    });
    const labelPrefix = room.type === "TABLE" ? "Table" : "Room";
    const outlet = resolveOutletForParam(room);
    const label = outlet ? `${labelPrefix} ${room.code} · ${outlet}` : `${labelPrefix} ${room.code}`;
    return generateBrandedQrPng(qrDataUrl, label);
  };

  const ensureQrImage = async (room: Room, cacheKey: string) => {
    if (qrImages[cacheKey]) return qrImages[cacheKey];
    const branded = await generateBrandedQrImage(room);
    setQrImages((prev) => ({ ...prev, [cacheKey]: branded }));
    return branded;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("URL copied to clipboard");
    } catch {
      toast.error("Copy failed. Try manually.");
    }
  };

  const openInNewTab = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const downloadDataUrl = (dataUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleOpenExtend = (room: Room) => {
    const roomId = room._id ?? room.id;
    if (!roomId) {
      toast.error("Unable to extend stay for this room.");
      return;
    }
    setExtendTargetRoom(room);
    setExtendDialogOpen(true);
    setExtendBooking(null);
    setExtendSummary(null);
    setExtendError(null);
    setExtendDate("");
    extendLookupMutation.mutate(String(roomId));
  };

  const handleExtendDialogOpenChange = (open: boolean) => {
    setExtendDialogOpen(open);
    if (!open) {
      setExtendTargetRoom(null);
      setExtendBooking(null);
      setExtendSummary(null);
      setExtendError(null);
      setExtendDate("");
      extendLookupMutation.reset();
      extendStayMutation.reset();
    }
  };

  const handleSubmitExtension = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!extendBooking?.id) {
      toast.error("No active booking selected for extension.");
      return;
    }
    if (!extendDate) {
      toast.error("Select a new check-out date.");
      return;
    }

    const currentCheckout = extendBooking.check_out_date ? new Date(extendBooking.check_out_date) : null;
    const requestedCheckout = new Date(extendDate);
    if (!currentCheckout || Number.isNaN(currentCheckout.getTime())) {
      toast.error("Current booking does not have a valid check-out date.");
      return;
    }
    if (Number.isNaN(requestedCheckout.getTime())) {
      toast.error("Selected date is invalid.");
      return;
    }
    if (requestedCheckout <= currentCheckout) {
      toast.error("New check-out date must be after the current check-out date.");
      return;
    }

    extendStayMutation.mutate({
      bookingId: extendBooking.id,
      newCheckOutDate: extendDate,
    });
  };

  const handleDownloadFilteredQrs = async () => {
    if (filteredRooms.length === 0) {
      toast.error("No rooms match the current filters.");
      return;
    }
    setIsBulkDownloading(true);
    try {
      const zip = new JSZip();

      for (const room of filteredRooms) {
        const { cacheKey, fileName } = computeRoomAssets(room);
        const image = await ensureQrImage(room, cacheKey);
        const base64 = image.split(",")[1];
        zip.file(fileName, base64, { base64: true });
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const downloadName = `qr-codes-${new Date().toISOString().slice(0, 10)}.zip`;
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filteredRooms.length} QR code${filteredRooms.length > 1 ? "s" : ""}.`);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message ?? "Failed to download QR codes.");
    } finally {
      setIsBulkDownloading(false);
    }
  };

  // =============== CHANGED: Generate *branded* QR images =================
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!rooms || rooms.length === 0) return;
      try {
        const pairs = await Promise.all(
          rooms.map(async (room) => {
            const { cacheKey } = computeRoomAssets(room);
            if (!cacheKey) return null;
            if (qrImages[cacheKey]) return [cacheKey, qrImages[cacheKey]] as const;
            const branded = await generateBrandedQrImage(room);
            return [cacheKey, branded] as const;
          })
        );

        if (!cancelled) {
          const valid = pairs.filter((p): p is readonly [string, string] => !!p && typeof p[1] === "string");
          if (valid.length > 0) {
            setQrImages((prev) => ({ ...prev, ...Object.fromEntries(valid) }));
          }
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) toast.error("Failed to generate one or more QR codes.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // include validatedOutlet so we regenerate with correct outlet param when it arrives
  }, [rooms, hostUrl, validatedOutlet]); // eslint-disable-line react-hooks/exhaustive-deps
  // ======================================================================

  // ---------- Filtering + search ----------
  const normalized = (s: string | null | undefined) => (s ?? "").toLowerCase().trim();

  const filteredRooms = useMemo(() => {
    const q = normalized(searchQuery);

    const matchesSearch = (r: Room) => {
      if (!q) return true;
      const hay = [
        normalized(r.code),
        normalized(r.type),
        normalized(r.room_type ?? ""),
        normalized(resolveOutletForParam(r) || r.outlet_id || ""),
      ].join(" ");
      return hay.includes(q);
    };

    const outletMatches = (r: Room) =>
      !selectedOutlet ? true : normalized(resolveOutletForParam(r) || r.outlet_id || "") === normalized(selectedOutlet);

    const typeIsRoom = (r: Room) => r.type === "ROOM";
    const typeIsTable = (r: Room) => r.type === "TABLE";

    let base = rooms.slice();

    switch (filterMode) {
      case "ROOM":
        base = base.filter(typeIsRoom);
        break;
      case "TABLE":
        base = base.filter(typeIsTable);
        break;
      case "OUTLET":
        base = base.filter(outletMatches);
        break;
      case "ROOM_OUTLET":
        base = base.filter((r) => typeIsRoom(r) && outletMatches(r));
        break;
      case "TABLE_OUTLET":
        base = base.filter((r) => typeIsTable(r) && outletMatches(r));
        break;
      case "ALL":
      default:
        break;
    }

    return base.filter(matchesSearch);
  }, [rooms, filterMode, selectedOutlet, searchQuery, validatedOutlet]);

  useEffect(() => {
    setPage(1);
  }, [filterMode, selectedOutlet, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / ROOM_PAGE_SIZE));

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const currentPage = Math.min(page, totalPages);
  const startIndex = filteredRooms.length === 0 ? 0 : (currentPage - 1) * ROOM_PAGE_SIZE;
  const endIndex = filteredRooms.length === 0 ? 0 : Math.min(filteredRooms.length, startIndex + ROOM_PAGE_SIZE);
  const paginatedRooms = filteredRooms.slice(startIndex, endIndex);

  const extendTargetKey = extendTargetRoom ? computeRoomAssets(extendTargetRoom).cacheKey : null;

  const requiresOutlet =
    filterMode === "OUTLET" || filterMode === "ROOM_OUTLET" || filterMode === "TABLE_OUTLET";

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold">Manage Rooms &amp; Tables</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Top bar: Add + Filters/Search */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex justify-between gap-3 flex-col md:flex-row">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    resetForm();
                    setEditingRoom(null);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Room/Table
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingRoom ? "Edit" : "Add"} Room/Table</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code *</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="e.g., 101, A1"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type">Type *</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ ...formData, type: value as RoomType })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ROOM">Room</SelectItem>
                        <SelectItem value="TABLE">Table</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

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
                            {isOutletLoading
                              ? "Loading..."
                              : isOutletError
                              ? "Failed to load outlets"
                              : "No outlets found"}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="price_per_night">Base Rate / Night (₹) *</Label>
                    <Input
                      id="price_per_night"
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        typeof formData.price_per_night === "number"
                          ? formData.price_per_night
                          : ""
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        setFormData({
                          ...formData,
                          price_per_night: raw === "" ? undefined : Number(raw),
                        });
                      }}
                      placeholder="Enter the nightly rate"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="room_type">Room Category / Class</Label>
                    <Input
                      id="room_type"
                      value={formData.room_type ?? ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          room_type: e.target.value,
                        })
                      }
                      placeholder="e.g., Deluxe King, Suite, Standard"
                    />
                  </div>

                  {formData.type === "ROOM" && (
                    <div className="space-y-2">
                      <Label htmlFor="occupancy">Max Occupancy *</Label>
                      <Input
                        id="occupancy"
                        type="number"
                        min="1"
                        step="1"
                        value={
                          typeof formData.occupancy === "number"
                            ? formData.occupancy
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          setFormData({
                            ...formData,
                            occupancy: raw === "" ? undefined : Number(raw),
                          });
                        }}
                        placeholder="Guests per room"
                        required
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="amenities">Amenities</Label>
                    <Textarea
                      id="amenities"
                      value={formData.amenities?.join(", ") ?? ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          amenities: e.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Separate amenities with commas (e.g., Wi-Fi, Breakfast, Pool Access)"
                    />
                    <p className="text-xs text-muted-foreground">
                      Guests will see these when browsing room categories.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label htmlFor="is_active">Active</Label>
                  </div>

                  <Button type="submit" className="w-full" disabled={mutation.isPending}>
                    {mutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            {/* Filters */}
            <div className="flex flex-1 items-center gap-3">
              <div className="min-w-[220px]">
                <Label className="sr-only" htmlFor="filterMode">
                  Filter
                </Label>
                <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
                  <SelectTrigger id="filterMode">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="ROOM">Room</SelectItem>
                    <SelectItem value="TABLE">Table</SelectItem>
                    <SelectItem value="OUTLET">Outlet</SelectItem>
                    <SelectItem value="ROOM_OUTLET">Room &amp; Outlet</SelectItem>
                    <SelectItem value="TABLE_OUTLET">Table &amp; Outlet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[220px]">
                <Label className="sr-only" htmlFor="outletFilter">
                  Outlet
                </Label>
                <Select
                  value={selectedOutlet}
                  onValueChange={setSelectedOutlet}
                  disabled={!requiresOutlet || outlet_ids_list.length === 0}
                >
                  <SelectTrigger id="outletFilter">
                    <SelectValue
                      placeholder={
                        requiresOutlet
                          ? outlet_ids_list.length
                            ? "Select Outlet"
                            : "No outlets"
                          : "Outlet (disabled)"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {outlet_ids_list.map((o) => (
                      <SelectItem value={o} key={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Search */}
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by room, table, or outlet…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                onClick={handleDownloadFilteredQrs}
                disabled={isBulkDownloading || filteredRooms.length === 0}
                className="whitespace-nowrap"
              >
                {isBulkDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Preparing…
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download QR Zip
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {/* Tiny helper line */}
          <div className="text-xs text-muted-foreground">
            {filteredRooms.length === 0
              ? `Filtered 0 of ${rooms.length}`
              : `Showing ${startIndex + 1}-${endIndex} of ${filteredRooms.length} · Total ${rooms.length}`}
            {requiresOutlet && !selectedOutlet && outlet_ids_list.length > 0
              ? " — pick an outlet to apply the filter."
              : ""}
          </div>
        </div>

        {isLoading ? (
          <p>Loading...</p>
        ) : isError ? (
          <p className="text-destructive">
            {(error as Error)?.message ?? "Failed to load rooms"}
          </p>
        ) : filteredRooms.length === 0 ? (
          <p className="text-muted-foreground">No matches found.</p>
        ) : (
          <>
          <div className="grid gap-6 md:grid-cols-2">
            {paginatedRooms.map((room) => {
              const { cacheKey, fileName, outlet } = computeRoomAssets(room);
              const url = buildQrUrl(room);
              const img = cacheKey ? qrImages[cacheKey] : undefined;
              const isExtendingThisRoom = extendDialogOpen && extendTargetKey === cacheKey;
              const extendLoading = isExtendingThisRoom && (extendLookupMutation.isPending || extendStayMutation.isPending);

              return (
                <Card key={cacheKey} className="h-full flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <QrCode className="w-5 h-5 text-primary" />
                      {room.code} {room.type === "TABLE" ? "(Table)" : "(Room)"}
                    </CardTitle>
                    <CardDescription>
                      Outlet: {outlet || "—"} · Status: {room.is_active ? "Active" : "Inactive"}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4 flex-1">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="bg-white rounded-xl p-3 border w-full md:w-[220px] h-[220px] flex items-center justify-center">
                        {img ? (
                          <img
                            src={img}
                            alt={`QR for ${room.code}`}
                            className="w-[200px] h-[200px] object-contain"
                            draggable={false}
                          />
                        ) : (
                          <div className="text-xs text-muted-foreground">Generating…</div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="bg-muted rounded-lg p-3 font-mono text-xs break-all">
                          {url}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Category</p>
                        <p className="font-semibold">{room.room_type || "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Base Rate / Night</p>
                        <p className="font-semibold">₹{Number(room.price_per_night ?? 0).toFixed(2)}</p>
                      </div>
                      {room.type === "ROOM" && (
                        <div>
                          <p className="text-muted-foreground">Max Occupancy</p>
                          <p className="font-semibold">{room.occupancy ?? 2} guests</p>
                        </div>
                      )}
                    </div>

                    {Array.isArray(room.amenities) && room.amenities.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        <p className="font-semibold text-foreground mb-1">Amenities</p>
                        <div className="flex flex-wrap gap-1">
                          {room.amenities.map((item) => (
                            <span
                              key={item}
                              className="px-2 py-1 rounded-full border bg-muted text-foreground"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="pt-0">
                    <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => copyToClipboard(url)}
                        title="Copy URL"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        <span className="whitespace-nowrap">Copy URL</span>
                      </Button>

                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => openInNewTab(url)}
                        title="Open URL"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        <span className="whitespace-nowrap">Test</span>
                      </Button>

                      <Button
                        size="sm"
                        className="w-full"
                        variant="secondary"
                        disabled={!img}
                        onClick={() => img && downloadDataUrl(img, fileName)}
                        title="Download PNG"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        <span className="whitespace-nowrap">Download</span>
                      </Button>
                    </div>
                  </CardFooter>

                  <CardFooter className="pt-0 gap-2">
                    {room.type === "ROOM" && (
                      <Button
                        onClick={() => handleOpenExtend(room)}
                        disabled={extendLoading}
                        className="flex-1"
                      >
                        {extendLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading…
                          </>
                        ) : (
                          <>
                            <CalendarPlus className="w-4 h-4 mr-2" />
                            Extend Stay
                          </>
                        )}
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => handleEdit(room)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleDelete(room)}
                      disabled={mutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
          {filteredRooms.length > ROOM_PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6 text-xs sm:text-sm text-muted-foreground">
              <span>
                Showing {startIndex + 1}-{endIndex} of {filteredRooms.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="font-medium">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
          </>
        )}

        <Dialog open={extendDialogOpen} onOpenChange={handleExtendDialogOpenChange}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Extend Stay</DialogTitle>
              <DialogDescription>
                Adjust the check-out date for the selected booking.
              </DialogDescription>
            </DialogHeader>
            {extendLookupMutation.isPending && !extendBooking ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Fetching booking details…
              </div>
            ) : extendError ? (
              <p className="text-sm text-destructive">{extendError}</p>
            ) : !extendBooking ? (
              <p className="text-sm text-muted-foreground">
                No active booking is currently assigned to this room.
              </p>
            ) : (
              <form onSubmit={handleSubmitExtension} className="space-y-4">
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-base">{extendBooking.guest_name ?? "Guest"}</p>
                  <p className="text-muted-foreground">
                    Booking code: {extendBooking.booking_code ?? "—"}
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div>
                      <p>Check-in</p>
                      <p className="font-medium text-foreground">{formatDisplayDate(extendBooking.check_in_date)}</p>
                    </div>
                    <div>
                      <p>Current check-out</p>
                      <p className="font-medium text-foreground">{formatDisplayDate(extendBooking.check_out_date)}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="extend-date">New check-out date</Label>
                  <Input
                    id="extend-date"
                    type="date"
                    value={extendDate}
                    min={extendBooking.check_out_date ? toDateInput(addDays(new Date(extendBooking.check_out_date), 1)) : undefined}
                    onChange={(event) => setExtendDate(event.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Choose a date after the current check-out to extend the stay.
                  </p>
                </div>
                {extendSummary && (
                  <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center justify-between text-foreground">
                      <span>Previous check-out</span>
                      <span>{formatDisplayDate(extendSummary.previousCheckOut)}</span>
                    </div>
                    <div className="flex items-center justify-between text-foreground">
                      <span>New check-out</span>
                      <span>{formatDisplayDate(extendSummary.newCheckOut)}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between">
                      <span>Total nights</span>
                      <span>{extendSummary.previousNights} → {extendSummary.newNights}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Room total</span>
                      <span>
                        ₹{Number(extendSummary.previousTotal).toFixed(2)} → ₹{Number(extendSummary.newTotal).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-semibold text-foreground">
                      <span>Additional amount</span>
                      <span>₹{Number(extendSummary.additionalAmount).toFixed(2)}</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => handleExtendDialogOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={extendStayMutation.isPending}>
                    {extendStayMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating…
                      </>
                    ) : (
                      "Update Booking"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        <Card className="mt-8">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-xl">Dynamic Pricing Adjustments</CardTitle>
              <CardDescription>
                Apply temporary price adjustments to rooms or entire outlets.
              </CardDescription>
            </div>
            <Dialog open={showPricingDialog} onOpenChange={setShowPricingDialog}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setPricingForm((prev) => ({
                      ...prev,
                      start_date: prev.start_date || new Date().toISOString().slice(0, 10),
                    }));
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Pricing Rule
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Pricing Rule</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Outlet *</Label>
                    <Select
                      value={pricingForm.outlet_id}
                      onValueChange={(value) => setPricingForm((prev) => ({ ...prev, outlet_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select outlet" />
                      </SelectTrigger>
                      <SelectContent>
                        {outlet_ids_list.map((outletId) => (
                          <SelectItem key={outletId} value={outletId}>
                            {outletId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Rooms (optional)</Label>
                    <p className="text-xs text-muted-foreground">
                      Leave blank to apply to all rooms in the selected outlet.
                    </p>
                    <ScrollArea className="h-40 border rounded-md p-3">
                      <div className="space-y-2">
                        {rooms
                          .filter((room) => room.type === "ROOM" && (!pricingForm.outlet_id || room.outlet_id === pricingForm.outlet_id))
                          .map((room) => {
                            const id = room._id ?? room.id ?? "";
                            if (!id) return null;
                            const checked = pricingForm.room_ids.includes(id);
                            return (
                              <label key={id} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(state) => handleToggleRoomInPricing(id, Boolean(state))}
                                />
                                <span>{room.code}</span>
                              </label>
                            );
                          })}
                        {rooms.filter((room) => room.type === "ROOM" && (!pricingForm.outlet_id || room.outlet_id === pricingForm.outlet_id)).length === 0 && (
                          <p className="text-sm text-muted-foreground">No rooms found for the outlet.</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Adjustment Type</Label>
                      <Select
                        value={pricingForm.mode}
                        onValueChange={(value) =>
                          setPricingForm((prev) => ({
                            ...prev,
                            mode: value as "PERCENT" | "FIXED",
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PERCENT">Percentage Markup</SelectItem>
                          <SelectItem value="FIXED">Set Fixed Rate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {pricingForm.mode === "PERCENT" ? (
                      <div className="space-y-2">
                        <Label>Markup (%) *</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={pricingForm.percent_increase}
                          onChange={(event) =>
                            setPricingForm((prev) => ({
                              ...prev,
                              percent_increase: Number(event.target.value),
                            }))
                          }
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>New Nightly Rate (₹) *</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={pricingForm.fixed_rate}
                          onChange={(event) =>
                            setPricingForm((prev) => ({
                              ...prev,
                              fixed_rate: event.target.value,
                            }))
                          }
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Starts *</Label>
                      <Input
                        type="date"
                        value={pricingForm.start_date}
                        onChange={(event) =>
                          setPricingForm((prev) => ({ ...prev, start_date: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Ends</Label>
                      <Input
                        type="date"
                        value={pricingForm.end_date}
                        onChange={(event) =>
                          setPricingForm((prev) => ({ ...prev, end_date: event.target.value }))
                        }
                        min={pricingForm.start_date}
                      />
                      <p className="text-xs text-muted-foreground">Leave blank for open-ended rule.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={pricingForm.notes}
                      onChange={(event) => setPricingForm((prev) => ({ ...prev, notes: event.target.value }))}
                      placeholder="Optional details about this adjustment"
                    />
                  </div>
                </div>
                <DialogFooter className="mt-4">
                  <Button
                    onClick={handleCreatePricingRule}
                    disabled={pricingMutation.isPending}
                    className="w-full"
                  >
                    {pricingMutation.isPending ? "Saving..." : "Save Pricing Rule"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {isPricingLoading ? (
              <p className="text-sm text-muted-foreground">Loading pricing rules…</p>
            ) : sortedPricingRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pricing adjustments defined.</p>
            ) : (
              <div className="space-y-3">
                {sortedPricingRules.map((rule: any) => {
                  const roomCodes = (rule.room_ids ?? [])
                    .map((id: string) => roomCodeMap.get(id) ?? id)
                    .filter(Boolean);
                  return (
                    <div
                      key={rule.id}
                      className="border rounded-md p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="space-y-1 text-sm">
                        <div className="font-semibold">{rule.outlet_id}</div>
                        <div className="text-muted-foreground">
                          {rule.mode === "FIXED"
                            ? `Fixed rate: ₹${Number(rule.fixed_rate ?? 0).toFixed(2)}`
                            : `Markup: ${Number(rule.percent_increase ?? 0).toFixed(2)}%`}
                        </div>
                        <div className="text-muted-foreground">
                          {rule.start_date ? new Date(rule.start_date).toLocaleDateString() : "Immediate"}
                          {" "}–{" "}
                          {rule.end_date ? new Date(rule.end_date).toLocaleDateString() : "Open"}
                        </div>
                        <div className="text-muted-foreground">
                          Scope: {roomCodes.length ? roomCodes.join(", ") : "All rooms"}
                        </div>
                        {rule.notes && <div className="text-muted-foreground text-xs">{rule.notes}</div>}
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeletePricingRule(rule.id)}
                        disabled={pricingMutation.isPending}
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ManageRooms;
