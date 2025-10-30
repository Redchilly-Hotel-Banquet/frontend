import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CalendarPlus, Loader2 } from "lucide-react";
import {
  getAdminOutlets,
  getAdminScopes,
  hasAdminScope,
  useRequireAdminAccess,
} from "@/hooks/useAdminAccess";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import SignatureCanvas from "react-signature-canvas";
import { apiGet, apiPost, ApiError } from "@/lib/apiClient";

const statusOptions = [
  { value: "PENDING", label: "Pending", color: "bg-yellow-500" },
  { value: "CONFIRMED", label: "Confirmed", color: "bg-blue-500" },
  { value: "CHECKED_IN", label: "Checked In", color: "bg-green-500" },
  { value: "CHECKED_OUT", label: "Checked Out", color: "bg-gray-500" },
  { value: "CANCELLED", label: "Cancelled", color: "bg-red-500" },
];

type ExtensionSummary = {
  previousCheckOut: string | Date;
  newCheckOut: string | Date;
  previousTotal: number;
  newTotal: number;
  additionalAmount: number;
  previousNights: number;
  newNights: number;
};

type CheckinGuestRecord = {
  full_name: string;
  document_type: string;
  document_number: string;
  document_image?: {
    data_url: string;
    file_name?: string;
    mime_type?: string;
  };
};

type CheckinDetailsRecord = {
  status?: string;
  expected_arrival_time?: string | null;
  needs_special_assistance?: boolean;
  special_assistance_details?: string | null;
  other_requests?: string | null;
  guests?: CheckinGuestRecord[];
  signature?: {
    data_url: string;
    file_name?: string;
    mime_type?: string;
  } | null;
  assigned_room?: {
    id: string;
    code?: string | null;
    type?: string | null;
    assigned_at?: string;
  } | null;
  assigned_rooms?: Array<{
    id: string;
    code?: string | null;
    type?: string | null;
    assigned_at?: string | null;
  }>;
};

type AdminRoomOption = {
  id: string;
  code: string;
  type?: string;
  room_type?: string;
  occupancy?: number;
  price_per_night?: number;
  isAssignedToBooking: boolean;
  isOccupiedByAnother: boolean;
  level?: string;
};

type CheckinModalPayload = {
  booking: any;
  checkinDetails: CheckinDetailsRecord | null;
  availableRooms: AdminRoomOption[];
};

const ManageBookings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  useRequireAdminAccess(["admin", "rooms"]);
  const scopes = getAdminScopes();
  const canEditAmounts = hasAdminScope(scopes, ["admin", "rooms"]);
  const [showCreateBooking, setShowCreateBooking] = useState(false);
  const initialCreateForm = useMemo(
    () => ({
      outlet_id: "",
      guest_name: "",
      guest_email: "",
      guest_phone: "",
      check_in_date: "",
      check_out_date: "",
      guests: "1",
      rooms_requested: "1",
      preferred_room_type: "",
      special_requests: "",
      total_amount: "",
    }),
    [],
  );
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [createTouchedTotal, setCreateTouchedTotal] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showBilling, setShowBilling] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [billingSummary, setBillingSummary] = useState<any>(null);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [checkinContext, setCheckinContext] = useState<CheckinModalPayload | null>(null);
  const [checkinBooking, setCheckinBooking] = useState<any>(null);
  const [isCheckinLoading, setIsCheckinLoading] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [selectedCheckinRooms, setSelectedCheckinRooms] = useState<string[]>([]);
  const [markCheckinComplete, setMarkCheckinComplete] = useState(false);
  const [isSavingCheckin, setIsSavingCheckin] = useState(false);
  const signaturePadRef = useRef<SignatureCanvas | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>("");

  // NEW: search state for "Assign Rooms"
  const [roomSearchTerm, setRoomSearchTerm] = useState("");
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustBooking, setAdjustBooking] = useState<any>(null);
  const [adjustDate, setAdjustDate] = useState("");
  const [adjustSummary, setAdjustSummary] = useState<{
    previousCheckOut: string | Date;
    newCheckOut: string | Date;
    previousTotal: number;
    newTotal: number;
    additionalAmount: number;
    previousNights: number;
    newNights: number;
  } | null>(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState<{ id: string; value: string } | null>(null);

  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => {
      return apiPost<{ bookings: any[] }>("/admin/bookings/manage", { action: "list" }, true);
    },
    refetchInterval: 10000,
  });

  const { data: outletsData } = useQuery({
    queryKey: ["outlets"],
    queryFn: async () => {
      return apiGet("/public/outlets");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiPost("/admin/bookings/manage", { action: "update_status", id, status }, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      toast({
        title: "Success",
        description: "Booking status updated successfully",
      });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
          ? error.message
          : "Failed to update status";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  const updateAmountMutation = useMutation({
    mutationFn: async ({ id, totalAmount }: { id: string; totalAmount: number }) => {
      return apiPost(
        "/admin/bookings/manage",
        { action: "update_amount", id, totalAmount },
        true,
      );
    },
    onSuccess: () => {
      setEditingAmount(null);
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      toast({
        title: "Amount updated",
        description: "Room charges adjusted successfully.",
      });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
          ? error.message
          : "Unable to update booking amount.";
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const adjustStayMutation = useMutation<{ booking: any; summary?: ExtensionSummary } | undefined, Error, { bookingId: string; newCheckOutDate: string }>({
    mutationFn: async ({ bookingId, newCheckOutDate }) => {
      return apiPost<{ booking: any; summary?: ExtensionSummary }>(
        "/admin/bookings/extensions",
        { action: "extend", bookingId, newCheckOutDate },
        true,
      );
    },
    onSuccess: (data) => {
      setAdjustSummary(data?.summary ?? null);
      setAdjustError(null);
      if (data?.booking) {
        setAdjustBooking(data.booking);
        setAdjustDate(toDateInput(data.booking.check_out_date));
        if (checkinBooking?.id === data.booking.id) {
          setCheckinBooking(data.booking);
        }
        if (selectedBooking?.id === data.booking.id) {
          setSelectedBooking(data.booking);
        }
      }
      toast({
        title: "Booking updated",
        description: "Stay dates recalculated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
    onError: (err: any) => {
      const message = err?.message ?? "Unable to update stay.";
      setAdjustError(message);
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const resetAdjustModal = () => {
    setShowAdjustModal(false);
    setAdjustBooking(null);
    setAdjustDate("");
    setAdjustSummary(null);
    setAdjustError(null);
    adjustStayMutation.reset();
  };

  const handleOpenAdjust = (booking: any) => {
    setAdjustBooking(booking);
    setAdjustDate(toDateInput(booking?.check_out_date));
    setAdjustSummary(null);
    setAdjustError(null);
    setShowAdjustModal(true);
  };

  const handleAdjustModalChange = (open: boolean) => {
    if (!open) {
      resetAdjustModal();
    } else {
      setShowAdjustModal(true);
    }
  };

  const handleAdjustSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adjustBooking?.id) {
      setAdjustError("Booking not found. Please close and try again.");
      return;
    }
    if (!adjustDate) {
      setAdjustError("Please select a new check-out date.");
      return;
    }

    const checkInDate = adjustBooking?.check_in_date ? new Date(adjustBooking.check_in_date) : null;
    const requestedCheckOut = new Date(adjustDate);

    if (!checkInDate || Number.isNaN(checkInDate.getTime())) {
      setAdjustError("Booking has an invalid check-in date.");
      return;
    }
    if (Number.isNaN(requestedCheckOut.getTime())) {
      setAdjustError("Please choose a valid date.");
      return;
    }
    if (requestedCheckOut <= checkInDate) {
      setAdjustError("Check-out must be at least one day after check-in.");
      return;
    }

    setAdjustError(null);
    setAdjustSummary(null);

    adjustStayMutation.mutate({
      bookingId: adjustBooking.id,
      newCheckOutDate: adjustDate,
    });
  };

  const startEditingAmount = (booking: any) => {
    const current = Number(booking.total_amount ?? booking.room_total ?? 0);
    setEditingAmount({ id: booking.id, value: current > 0 ? current.toFixed(2) : "0" });
  };

  const handleAmountInputChange = (value: string) => {
    setEditingAmount((prev) => (prev ? { ...prev, value } : prev));
  };

  const handleSaveAmount = () => {
    if (!editingAmount) return;
    const parsed = Number(editingAmount.value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a valid amount before saving.",
        variant: "destructive",
      });
      return;
    }
    updateAmountMutation.mutate({
      id: editingAmount.id,
      totalAmount: Number(parsed.toFixed(2)),
    });
  };

  const handleCreateBookingSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const {
      outlet_id,
      guest_name,
      guest_email,
      guest_phone,
      check_in_date,
      check_out_date,
      guests,
      rooms_requested,
      preferred_room_type,
      special_requests,
      total_amount,
    } = createForm;

    if (!outlet_id || !guest_name || !guest_phone || !check_in_date || !check_out_date) {
      toast({
        title: "Missing details",
        description: "Outlet, guest info, and stay dates are required.",
        variant: "destructive",
      });
      return;
    }

    const checkInDate = new Date(check_in_date);
    const checkOutDate = new Date(check_out_date);
    if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
      toast({
        title: "Invalid dates",
        description: "Please provide valid check-in and check-out dates.",
        variant: "destructive",
      });
      return;
    }
    if (checkOutDate <= checkInDate) {
      toast({
        title: "Adjust stay",
        description: "Check-out must be after the check-in date.",
        variant: "destructive",
      });
      return;
    }

    const guestsCount = Number.parseInt(guests, 10) || 1;
    const roomsRequested = Number.parseInt(rooms_requested, 10) || 1;
    if (roomsRequested <= 0) {
      toast({
        title: "Invalid rooms",
        description: "Rooms requested must be at least one.",
        variant: "destructive",
      });
      return;
    }

    let parsedTotal: number | undefined;
    const trimmedTotal = total_amount.trim();
    if (trimmedTotal.length > 0) {
      const parsed = Number(trimmedTotal);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast({
          title: "Invalid amount",
          description: "Enter a valid negotiated total or leave the field blank.",
          variant: "destructive",
        });
        return;
      }
      parsedTotal = Number(parsed.toFixed(2));
    }

    const payload: Record<string, unknown> = {
      outlet_id,
      rooms_requested: roomsRequested,
      preferred_room_type: preferred_room_type || null,
      guest_name,
      guest_email: guest_email || null,
      guest_phone,
      check_in_date,
      check_out_date,
      number_of_guests: guestsCount,
      special_requests: special_requests || null,
    };

    if (parsedTotal !== undefined) {
      payload.total_amount = parsedTotal;
    }

    createBookingMutation.mutate(payload);
  };

  const handleStatusChange = (bookingId: string, newStatus: string) => {
    updateStatusMutation.mutate({ id: bookingId, status: newStatus });
  };

  const openBilling = async (booking: any, action?: "checkout") => {
    setSelectedBooking(booking);
    setIsBillingLoading(true);
    setBillingError(null);
    setShowBilling(true);

    try {
      const requestBody: Record<string, unknown> = {
        bookingId: booking.id,
      };
      if (action) requestBody.action = action;

      const data = await apiPost("/admin/bookings/billing", requestBody, true);
      setBillingSummary(data);
      if (data?.booking) {
        setSelectedBooking(data.booking);
      }

      if (action === "checkout") {
        toast({
          title: "Checkout completed",
          description: "Booking checked out and folio updated.",
        });
        queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      }
    } catch (err: unknown) {
      console.error("Failed to load billing", err);
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Unable to fetch billing details.";
      setBillingError(message);
      toast({
        title: "Billing error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsBillingLoading(false);
    }
  };

  const resetCheckinModal = () => {
    setShowCheckinModal(false);
    setCheckinContext(null);
    setCheckinBooking(null);
    setCheckinError(null);
    setIsCheckinLoading(false);
    setSelectedCheckinRooms([]);
    setMarkCheckinComplete(false);
    setIsSavingCheckin(false);
    setRoomSearchTerm(""); // reset room search when closing
    signaturePadRef.current?.clear();
    setSignatureDataUrl("");
  };

  const openCheckinManager = async (booking: any) => {
    setShowCheckinModal(true);
    setCheckinBooking(booking);
    setIsCheckinLoading(true);
    setCheckinError(null);
    try {
      const payload = await apiPost<CheckinModalPayload>(
        "/admin/bookings/checkin",
        {
          action: "admin-fetch",
          bookingId: booking.id,
        },
        true,
      );

      if (!payload) {
        throw new Error("No check-in data returned.");
      }

      setCheckinContext(payload);
      setSignatureDataUrl(payload.checkinDetails?.signature?.data_url ?? "");
      const assignedIds = Array.isArray(payload.checkinDetails?.assigned_rooms)
        ? payload.checkinDetails?.assigned_rooms
            .map((room) => room?.id)
            .filter((value): value is string => Boolean(value))
        : payload.checkinDetails?.assigned_room?.id
        ? [payload.checkinDetails.assigned_room.id]
        : Array.isArray(payload.booking?.room_ids)
        ? payload.booking.room_ids
            .map((value: any) => (typeof value === "string" ? value : value?.toString?.()))
            .filter((value: any): value is string => Boolean(value))
        : [];

      setSelectedCheckinRooms(assignedIds);
      setMarkCheckinComplete(
        (payload.booking?.status ?? booking.status) === "CHECKED_IN" ||
          payload.checkinDetails?.status === "COMPLETED",
      );
    } catch (err: unknown) {
      console.error("Failed to load check-in data", err);
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Unable to fetch check-in details.";
      setCheckinError(message);
      toast({
        title: "Check-in error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsCheckinLoading(false);
    }
  };

  const toggleCheckinRoom = (roomId: string, checked: CheckedState) => {
    setSelectedCheckinRooms((prev) => {
      const next = new Set(prev);
      if (checked === true) {
        next.add(roomId);
      } else {
        next.delete(roomId);
      }
      return Array.from(next);
    });
  };

  const handleSignatureCapture = () => {
    const pad = signaturePadRef.current;
    if (!pad) return;
    if (pad.isEmpty()) {
      setSignatureDataUrl("");
      return;
    }
    try {
      const dataUrl = pad.toDataURL("image/png");
      setSignatureDataUrl(dataUrl);
    } catch (error) {
      console.error("Unable to capture signature", error);
      setSignatureDataUrl("");
    }
  };

  const clearSignatureCanvas = () => {
    signaturePadRef.current?.clear();
    setSignatureDataUrl("");
  };

  const restoreStoredSignature = () => {
    const stored = checkinContext?.checkinDetails?.signature?.data_url ?? "";
    setSignatureDataUrl(stored);
  };

  useEffect(() => {
    if (!showCheckinModal) return;
    const pad = signaturePadRef.current;
    if (!pad) return;
    pad.clear();
    if (!signatureDataUrl) return;
    try {
      pad.fromDataURL(signatureDataUrl);
    } catch (error) {
      console.error("Unable to load signature preview", error);
    }
  }, [showCheckinModal, signatureDataUrl]);

  const handleSaveCheckin = async () => {
    if (!checkinBooking || !checkinContext) return;

    const details = checkinContext.checkinDetails;
    if (!details || !details.guests || details.guests.length === 0) {
      toast({
        title: "Guest details missing",
        description: "Capture guest documents before completing the check-in.",
        variant: "destructive",
      });
      return;
    }

    if (markCheckinComplete && selectedCheckinRooms.length === 0) {
      toast({
        title: "Assign a room",
        description: "Allocate at least one room before marking the booking as checked in.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingCheckin(true);
    try {
      const storedSignature = details.signature?.data_url ?? "";
      const isSignatureModified = signatureDataUrl !== storedSignature;
      const signatureToSubmit = signatureDataUrl;
      const signatureName = signatureToSubmit
        ? isSignatureModified
          ? "admin-checkin-signature.png"
          : details.signature?.file_name ?? "admin-checkin-signature.png"
        : "";
      const signatureType = signatureToSubmit
        ? isSignatureModified
          ? "image/png"
          : details.signature?.mime_type ?? "image/png"
        : "";

      const payload = {
        action: "submit" as const,
        bookingId: checkinBooking.id,
        bookingCode: String(checkinBooking.booking_code ?? ""),
        checkinData: {
          guests: details.guests.map((guest) => ({
            fullName: guest.full_name,
            documentType: guest.document_type,
            documentNumber: guest.document_number,
            documentImageDataUrl: guest.document_image?.data_url,
            documentImageName: guest.document_image?.file_name,
            documentImageType: guest.document_image?.mime_type,
          })),
          expectedArrivalTime: details.expected_arrival_time ?? "",
          needsSpecialAssistance: Boolean(details.needs_special_assistance),
          specialAssistanceDetails: details.special_assistance_details ?? "",
          otherRequests: details.other_requests ?? "",
          assignedRoomIds: selectedCheckinRooms,
          digitalSignature: signatureToSubmit,
          digitalSignatureName: signatureName,
          digitalSignatureType: signatureType,
        },
        markAsCheckedIn: markCheckinComplete,
      };

      const data = await apiPost<CheckinModalPayload>(
        "/admin/bookings/checkin",
        payload,
        true,
      );

      if (!data) throw new Error("No response received from server.");

      setCheckinContext(data);
      setCheckinBooking(data.booking);
      setSignatureDataUrl(data.checkinDetails?.signature?.data_url ?? "");
      const assignedIds = Array.isArray(data.checkinDetails?.assigned_rooms)
        ? data.checkinDetails.assigned_rooms
            .map((room) => room?.id)
            .filter((value): value is string => Boolean(value))
        : data.checkinDetails?.assigned_room?.id
        ? [data.checkinDetails.assigned_room.id]
        : Array.isArray(data.booking?.room_ids)
        ? data.booking.room_ids
            .map((value: any) => (typeof value === "string" ? value : value?.toString?.()))
            .filter((value: any): value is string => Boolean(value))
        : [];
      setSelectedCheckinRooms(assignedIds);
      setMarkCheckinComplete(
        (data.booking?.status ?? "PENDING") === "CHECKED_IN" ||
          data.checkinDetails?.status === "COMPLETED",
      );

      toast({
        title: "Check-in updated",
        description: markCheckinComplete
          ? "Booking marked as checked in successfully."
          : "Check-in preferences updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    } catch (err: unknown) {
      console.error("Failed to update check-in", err);
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "An unexpected error occurred.";
      toast({
        title: "Unable to save check-in",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSavingCheckin(false);
    }
  };

  const filteredBookings = (bookingsData?.bookings ?? []).filter((booking: any) => {
    const outletMatches = selectedOutlet === "all" || booking.outlet_id === selectedOutlet;
    if (!outletMatches) return false;

    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;

    const haystack = [
      booking.guest_name,
      booking.guest_email,
      booking.guest_phone,
      booking.booking_code,
      booking.status,
      ...(booking.rooms_allocated ?? []).flatMap((r: any) => [
        r.code,
        r.room_type,
        r.type,
      ]),
    ]
      .filter(Boolean)
      .map((s: string) => s.toLowerCase())
      .join(" ");

    return haystack.includes(q);
  });

  // ---- NEW: memoized filtered rooms for "Assign Rooms" section ----
  const filteredAvailableRooms = useMemo(() => {
    if (!checkinContext?.availableRooms) return [];
    const q = roomSearchTerm.trim().toLowerCase();
    if (!q) return checkinContext.availableRooms;

    // If user types only numbers (e.g., "105"), also match by numeric part of codes like "A105".
    const isNumericQuery = /^\d+$/.test(q);

    return checkinContext.availableRooms.filter((room) => {
      const code = (room.code ?? "").toString();
      const codeLc = code.toLowerCase();

      if (codeLc.includes(q)) return true;
      if (isNumericQuery) {
        const numericInCode = code.replace(/\D+/g, "");
        if (numericInCode.includes(q)) return true;
      }

      // Fallbacks: try id or level/room_type for completeness
      return (
        (room.id ?? "").toLowerCase().includes(q) ||
        (room.level ?? "").toLowerCase().includes(q) ||
        (room.room_type ?? room.type ?? "").toLowerCase().includes(q)
      );
    });
  }, [checkinContext?.availableRooms, roomSearchTerm]);

  const signaturePreview = signatureDataUrl;

  const addDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  };

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

  const formatCurrency = (value?: number) => {
    const amount = Number(value ?? 0);
    const prefix = amount < 0 ? "-" : "";
    return `${prefix}₹${Math.abs(amount).toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin/dashboard")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <span className="text-xl font-semibold">Manage Bookings</span>
              <div className="flex flex-col md:flex-row gap-2 md:items-center">
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search guest, booking code, status..."
                  className="md:w-64"
                />
                <Select value={selectedOutlet} onValueChange={setSelectedOutlet}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select outlet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Outlets</SelectItem>
                    {outletsData?.outlets?.map((outlet: any) => (
                      <SelectItem key={outlet.location_key} value={outlet.location_key}>
                        {outlet.location_key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => {
                    resetCreateForm();
                    setShowCreateBooking(true);
                  }}
                  className="whitespace-nowrap"
                >
                  Book Room
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p>Loading bookings...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Rooms</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Rooms Booked</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((booking: any) => (
                    <TableRow key={booking.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{booking.guest_name}</div>
                          <div className="text-sm text-muted-foreground">{booking.guest_email}</div>
                          <div className="text-sm text-muted-foreground">{booking.guest_phone}</div>
                          <div className="text-xs text-muted-foreground mt-1">{booking.booking_code}</div>
                          <div className="text-xs text-muted-foreground">Guests: {booking.number_of_guests ?? "—"}</div>
                        </div>
                      </TableCell>
                      <TableCell>{booking.outlets?.name ?? booking.outlet_id}</TableCell>
                      <TableCell>
                        <div className="text-sm space-y-1">
                          {(booking.rooms_allocated ?? []).map((room: any, index: number) => {
                            const label =
                              room.code ??
                              room.room_type ??
                              room.type ??
                              `Room ${index + 1}`;
                            const nightly = Number(
                              room.effective_rate_per_night ??
                                room.effective_rate ??
                                room.base_rate ??
                                0,
                            );
                            const key =
                              room.room_id ??
                              room.id ??
                              `${booking.id}-room-${index}`;
                            return (
                              <div key={key} className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2">
                                  {label}
                                  {!room.code && (
                                    <Badge variant="outline" className="text-xs">
                                      Pending
                                    </Badge>
                                  )}
                                </span>
                                {nightly > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    ₹{nightly.toFixed(2)}/night
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {(!booking.rooms_allocated || booking.rooms_allocated.length === 0) && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{new Date(booking.check_in_date).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(booking.check_out_date).toLocaleDateString()}</TableCell>
                      <TableCell>{booking.rooms_requested ?? (booking.room_ids?.length || 1)}</TableCell>
                      <TableCell>
                        {canEditAmounts ? (
                          editingAmount?.id === booking.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                className="w-28"
                                value={editingAmount.value}
                                onChange={(event) => handleAmountInputChange(event.target.value)}
                                disabled={updateAmountMutation.isPending}
                              />
                              <Button
                                size="sm"
                                onClick={handleSaveAmount}
                                disabled={updateAmountMutation.isPending}
                              >
                                {updateAmountMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Save"
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingAmount(null)}
                                disabled={updateAmountMutation.isPending}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>₹{Number(booking.total_amount ?? 0).toFixed(2)}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditingAmount(booking)}
                              >
                                Edit
                              </Button>
                            </div>
                          )
                        ) : (
                          <span>₹{Number(booking.total_amount ?? 0).toFixed(2)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusOptions.find(s => s.value === booking.status)?.color}>
                          {statusOptions.find(s => s.value === booking.status)?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                        <Select
                          value={booking.status}
                          onValueChange={(value) => handleStatusChange(booking.id, value)}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openCheckinManager(booking)}
                        >
                          Manage Check-in
                        </Button>
                        {booking.status !== "CHECKED_OUT" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenAdjust(booking)}
                          >
                            <CalendarPlus className="w-4 h-4 mr-2" />
                            Adjust Stay
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openBilling(booking)}
                        >
                            View Details
                          </Button>
                          {booking.status === "CHECKED_IN" && (
                            <Button
                              size="sm"
                              className="gradient-primary"
                              onClick={() => openBilling(booking, "checkout")}
                            >
                              Complete Checkout
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={showCreateBooking}
          onOpenChange={(open) => {
            setShowCreateBooking(open);
            if (!open) resetCreateForm();
          }}
        >
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Create Booking</DialogTitle>
              <DialogDescription>Record a new reservation on behalf of a guest.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateBookingSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="create-outlet">Outlet *</Label>
                  <Select
                    value={createForm.outlet_id}
                    onValueChange={(value) => handleCreateInputChange("outlet_id", value)}
                  >
                    <SelectTrigger id="create-outlet">
                      <SelectValue placeholder="Select outlet" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedOutletOptions.map((outlet: any) => (
                        <SelectItem key={outlet.location_key} value={outlet.location_key}>
                          {outlet.location_key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-rooms">Rooms Requested *</Label>
                  <Input
                    id="create-rooms"
                    type="number"
                    min={1}
                    value={createForm.rooms_requested}
                    onChange={(event) => handleCreateInputChange("rooms_requested", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-guest-name">Guest Name *</Label>
                  <Input
                    id="create-guest-name"
                    value={createForm.guest_name}
                    onChange={(event) => handleCreateInputChange("guest_name", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-phone">Phone *</Label>
                  <Input
                    id="create-phone"
                    value={createForm.guest_phone}
                    onChange={(event) => handleCreateInputChange("guest_phone", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-email">Email</Label>
                  <Input
                    id="create-email"
                    type="email"
                    value={createForm.guest_email}
                    onChange={(event) => handleCreateInputChange("guest_email", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-guests">Guests *</Label>
                  <Input
                    id="create-guests"
                    type="number"
                    min={1}
                    value={createForm.guests}
                    onChange={(event) => handleCreateInputChange("guests", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-checkin">Check-in *</Label>
                  <Input
                    id="create-checkin"
                    type="date"
                    value={createForm.check_in_date}
                    onChange={(event) => handleCreateInputChange("check_in_date", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-checkout">Check-out *</Label>
                  <Input
                    id="create-checkout"
                    type="date"
                    value={createForm.check_out_date}
                    onChange={(event) => handleCreateInputChange("check_out_date", event.target.value)}
                    required
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="create-room-type">Preferred Room Type</Label>
                  <Input
                    id="create-room-type"
                    value={createForm.preferred_room_type}
                    onChange={(event) => handleCreateInputChange("preferred_room_type", event.target.value)}
                    placeholder="e.g., Deluxe, Suite"
                  />
                </div>
                {canEditAmounts && (
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="create-total">Negotiated Total (₹)</Label>
                    <Input
                      id="create-total"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={createForm.total_amount}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setCreateTouchedTotal(nextValue.trim().length > 0);
                        handleCreateInputChange("total_amount", nextValue);
                      }}
                      placeholder="Enter agreed total"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use standard nightly totals.
                    </p>
                  </div>
                )}
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="create-notes">Special Requests</Label>
                  <Textarea
                    id="create-notes"
                    value={createForm.special_requests}
                    onChange={(event) => handleCreateInputChange("special_requests", event.target.value)}
                    placeholder="Note any special requirements for this stay"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateBooking(false);
                    resetCreateForm();
                  }}
                  disabled={createBookingMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createBookingMutation.isPending}>
                  {createBookingMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Create Booking"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={showBilling}
          onOpenChange={(val) => {
            setShowBilling(val);
            if (!val) {
              setBillingSummary(null);
              setBillingError(null);
              setSelectedBooking(null);
            }
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Booking Details</DialogTitle>
              <DialogDescription>
                Comprehensive summary of the stay and in-room dining.
              </DialogDescription>
            </DialogHeader>

            {billingError ? (
              <p className="text-sm text-destructive">{billingError}</p>
            ) : isBillingLoading || !billingSummary ? (
              <p>Loading billing information...</p>
            ) : (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Guest</p>
                    <p className="font-semibold">{selectedBooking?.guest_name}</p>
                    <p className="text-muted-foreground">
                      {selectedBooking?.guest_email || "No email"}
                    </p>
                    <p className="text-muted-foreground">
                      {selectedBooking?.guest_phone || "No phone"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Booking Code</p>
                    <p className="font-mono text-sm">{selectedBooking?.booking_code}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Stay</p>
                    <p>
                      {new Date(selectedBooking?.check_in_date).toLocaleDateString()} –{" "}
                      {new Date(selectedBooking?.check_out_date).toLocaleDateString()}
                    </p>
                    <div className="text-muted-foreground text-xs mt-1 space-y-1">
                      {(selectedBooking?.rooms_allocated ?? []).map((room: any, index: number) => {
                        const label =
                          room.code ??
                          room.room_type ??
                          room.type ??
                          `Room ${index + 1}`;
                        const nightly = Number(
                          room.effective_rate_per_night ??
                            room.effective_rate ??
                            room.base_rate ??
                            0,
                        );
                        const nightsStayed =
                          room.perNight?.length ?? selectedBooking?.nights ?? 1;
                        const key =
                          room.room_id ??
                          room.id ??
                          `stay-room-${selectedBooking?.id ?? "unknown"}-${index}`;
                        return (
                          <div key={key} className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                              {label}
                              {!room.code && (
                                <Badge variant="outline" className="text-xs">
                                  Pending
                                </Badge>
                              )}
                            </span>
                            {nightly > 0 && (
                              <span>
                                ₹{nightly.toFixed(2)} × {nightsStayed} night{nightsStayed > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {(!selectedBooking?.rooms_allocated || selectedBooking.rooms_allocated.length === 0) && (
                        <span>{selectedBooking?.rooms_tables?.code ?? "Room allocated on arrival"}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge className="mt-1">
                      {statusOptions.find((s) => s.value === selectedBooking?.status)?.label ??
                        selectedBooking?.status}
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="rounded-lg border p-4 bg-muted/40">
                    <p className="text-xs text-muted-foreground uppercase">Room Charges</p>
                    <p className="text-xl font-semibold">₹{billingSummary.roomTotal}</p>
                  </div>
                  <div className="rounded-lg border p-4 bg-muted/40">
                    <p className="text-xs text-muted-foreground uppercase">Food & Beverages</p>
                    <p className="text-xl font-semibold">₹{billingSummary.foodTotal}</p>
                  </div>
                  <div className="rounded-lg border p-4 bg-primary/10 border-primary/40">
                    <p className="text-xs text-muted-foreground uppercase">Grand Total</p>
                    <p className="text-2xl font-bold text-primary">₹{billingSummary.grandTotal}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Orders</h3>
                  {billingSummary.orders?.length ? (
                    <ScrollArea className="h-48 rounded-md border">
                      <div className="divide-y">
                        {billingSummary.orders.map((order: any) => (
                          console.log("Rendering order:", order),
                          <div key={order.id ?? order._id} className="p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <p className="font-semibold">
                                Order #{(order.id ?? order._id).slice(0, 8)}
                              </p>
                              <Badge variant="outline" className="capitalize">
                                {order.status?.replace(/_/g, " ").toLowerCase()}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-xs">
                              {order.created_at
                                ? new Date(order.created_at).toLocaleString()
                                : "No timestamp"}
                            </p>
                            <p className="mt-1 font-medium">Total: ₹{Number(order.total ?? 0)}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-sm text-muted-foreground">No in-room orders logged.</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  {selectedBooking?.status === "CHECKED_IN" && (
                    <Button
                      className="gradient-primary"
                      onClick={() => openBilling(selectedBooking, "checkout")}
                    >
                      Complete Checkout
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setShowBilling(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showAdjustModal} onOpenChange={handleAdjustModalChange}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Adjust Stay Dates</DialogTitle>
              <DialogDescription>
                Extend or shorten the guest's stay and automatically recalculate room charges.
              </DialogDescription>
            </DialogHeader>
            {!adjustBooking ? (
              <p className="text-sm text-muted-foreground">No booking selected.</p>
            ) : (
              <form onSubmit={handleAdjustSubmit} className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-base">{adjustBooking.guest_name}</p>
                      <p className="text-muted-foreground text-xs">Booking code: {adjustBooking.booking_code}</p>
                    </div>
                    <Badge variant="secondary">{statusOptions.find((s) => s.value === adjustBooking.status)?.label ?? adjustBooking.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div>
                      <p>Check-in</p>
                      <p className="font-medium text-foreground">{formatDisplayDate(adjustBooking.check_in_date)}</p>
                    </div>
                    <div>
                      <p>Current check-out</p>
                      <p className="font-medium text-foreground">{formatDisplayDate(adjustBooking.check_out_date)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adjust-date">New check-out date</Label>
                  <Input
                    id="adjust-date"
                    type="date"
                    value={adjustDate}
                    min={adjustBooking.check_in_date ? toDateInput(addDays(new Date(adjustBooking.check_in_date), 1)) : undefined}
                    onChange={(event) => setAdjustDate(event.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    The guest can be checked out early or extended beyond the original schedule.
                  </p>
                </div>

                {adjustError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    {adjustError}
                  </div>
                )}

                {adjustSummary && (
                  <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center justify-between text-foreground">
                      <span>Previous check-out</span>
                      <span>{formatDisplayDate(adjustSummary.previousCheckOut)}</span>
                    </div>
                    <div className="flex items-center justify-between text-foreground">
                      <span>New check-out</span>
                      <span>{formatDisplayDate(adjustSummary.newCheckOut)}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between">
                      <span>Total nights</span>
                      <span>{adjustSummary.previousNights} → {adjustSummary.newNights}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Room total</span>
                      <span>
                        {formatCurrency(adjustSummary.previousTotal)} → {formatCurrency(adjustSummary.newTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-semibold text-foreground">
                      <span>Difference</span>
                      <span className={adjustSummary.additionalAmount >= 0 ? "text-emerald-600" : "text-red-600"}>
                        {adjustSummary.additionalAmount >= 0 ? "+" : ""}{formatCurrency(adjustSummary.additionalAmount)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" type="button" onClick={() => resetAdjustModal()}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={adjustStayMutation.isPending}>
                    {adjustStayMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating…
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={showCheckinModal}
          onOpenChange={(val) => {
            if (!val) {
              resetCheckinModal();
            } else {
              setShowCheckinModal(true);
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage Check-in</DialogTitle>
              <DialogDescription>
                Review guest documents, assign rooms, and complete the check-in.
              </DialogDescription>
            </DialogHeader>

            {checkinError ? (
              <p className="text-sm text-destructive">{checkinError}</p>
            ) : isCheckinLoading ? (
              <p>Loading check-in details...</p>
            ) : checkinContext && checkinBooking ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 text-sm">
                  <div>
                    <p className="text-muted-foreground uppercase text-xs tracking-wide">Guest</p>
                    <p className="font-semibold">{checkinBooking.guest_name}</p>
                    <p className="text-muted-foreground">{checkinBooking.guest_email || "No email"}</p>
                    <p className="text-muted-foreground">{checkinBooking.guest_phone || "No phone"}</p>
                    {checkinBooking.preferred_categories && (
                      <div className="mt-1">
                        <p className="text-muted-foreground uppercase text-xs tracking-wide">Preferred Categories</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {Object.entries(checkinBooking.preferred_categories).map(([category, count]) => (
                            <Badge key={category} variant="secondary" className="text-xs">
                              {category}: {String(count)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground uppercase text-xs tracking-wide">Booking Code</p>
                    <p className="font-mono text-sm">{checkinBooking.booking_code}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {statusOptions.find((s) => s.value === checkinBooking.status)?.label ??
                          checkinBooking.status}
                      </Badge>
                      {checkinContext.checkinDetails?.status && (
                        <Badge className="bg-emerald-600">
                          {checkinContext.checkinDetails.status === "COMPLETED"
                            ? "Check-in Complete"
                            : "Check-in Pending"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <p className="text-sm font-semibold">Guest Documents</p>
                  {checkinContext.checkinDetails?.guests?.length ? (
                    <ScrollArea className="h-52 rounded border">
                      <div className="divide-y">
                        {checkinContext.checkinDetails.guests.map((guest, index) => (
                          <div key={`${guest.document_number}-${index}`} className="p-3 text-sm space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">Guest {index + 1}</p>
                                <p className="text-muted-foreground text-xs">{guest.full_name}</p>
                              </div>
                              <Badge variant="outline">{guest.document_type}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Document No: <span className="font-mono">{guest.document_number}</span>
                            </p>
                            {guest.document_image?.data_url ? (
                              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <img
                                  src={guest.document_image.data_url}
                                  alt={`${guest.full_name} document`}
                                  className="h-24 w-36 object-cover rounded border bg-background"
                                />
                                <a
                                  href={guest.document_image.data_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-medium text-primary hover:underline"
                                >
                                  View full document
                                </a>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">No document uploaded.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No guest documents uploaded yet. Ask the guest to complete the digital check-in form.
                    </p>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold">Arrival Preferences</p>
                    <p className="text-muted-foreground">
                      Expected Arrival:{" "}
                      {checkinContext.checkinDetails?.expected_arrival_time
                        ? new Date(checkinContext.checkinDetails.expected_arrival_time).toLocaleString()
                        : "Not provided"}
                    </p>
                    <p className="text-muted-foreground">
                      Special Assistance:{" "}
                      {checkinContext.checkinDetails?.needs_special_assistance
                        ? checkinContext.checkinDetails.special_assistance_details || "Requested"
                        : "No"}
                    </p>
                    <p className="text-muted-foreground">
                      Other Requests:{" "}
                      {checkinContext.checkinDetails?.other_requests || "None"}
                    </p>
                  </div>
                  <div className="space-y-3 text-sm lg:col-span-2 w-full">
                    <Label className="font-semibold">Capture Digital Signature</Label>
                    <div className="space-y-4">
                      <div className="rounded-lg border bg-background shadow-inner">
                        <SignatureCanvas
                          ref={(instance) => {
                            signaturePadRef.current = instance;
                          }}
                          penColor="#111"
                          backgroundColor="#fff"
                          canvasProps={{
                            className:
                              "w-full h-48 sm:h-60 lg:h-72 xl:h-80 rounded",
                          }}
                          onEnd={handleSignatureCapture}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={clearSignatureCanvas}
                        >
                          Clear
                        </Button>
                        {checkinContext.checkinDetails?.signature?.data_url && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={restoreStoredSignature}
                          >
                            Restore Saved
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ask the guest to sign here during verification at the front desk.
                      </p>
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Preview
                        </p>
                        {signaturePreview ? (
                          <div className="rounded border bg-muted/30 p-2 inline-flex items-center justify-center">
                            <img
                              src={signaturePreview}
                              alt="Digital signature preview"
                              className="h-24 w-full max-w-sm object-contain bg-white rounded"
                            />
                          </div>
                        ) : (
                          <p className="text-muted-foreground">Signature not captured yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Assign Rooms</Label>

                    {/* NEW: search input for rooms */}
                    <div className="flex items-center gap-2">
                      <Input
                        value={roomSearchTerm}
                        onChange={(e) => setRoomSearchTerm(e.target.value)}
                        placeholder="Search room number or code (e.g., 105 or A105)"
                        className="max-w-sm"
                      />
                      {roomSearchTerm && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRoomSearchTerm("")}
                        >
                          Clear
                        </Button>
                      )}
                    </div>

                    {filteredAvailableRooms.length ? (
                      <div className="rounded-lg border bg-muted/20 p-3 space-y-3 max-h-60 overflow-y-auto">
                        {filteredAvailableRooms.map((room) => {
                          const isDisabled = room.isOccupiedByAnother && !room.isAssignedToBooking;
                          const isSelected = selectedCheckinRooms.includes(room.id);
                          return (
                            <label
                              key={room.id}
                              className="flex items-start gap-3 rounded-lg border bg-background p-3 text-sm"
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => toggleCheckinRoom(room.id, checked)}
                                disabled={isDisabled}
                              />
                              <div className="flex-1">
                                <p className="font-semibold flex items-center gap-2">
                                  {room.code}
                                  {room.isAssignedToBooking && (
                                    <Badge variant="outline">Current</Badge>
                                  )}
                                  {isDisabled && (
                                    <Badge variant="destructive">Occupied</Badge>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {room.room_type ?? room.type ?? "Room"}
                                  {room.occupancy ? ` • Sleeps ${room.occupancy}` : ""}
                                  {room.price_per_night != null
                                    ? ` • ₹${Number(room.price_per_night).toFixed(2)}/night`
                                    : ""}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {checkinContext.availableRooms.length
                          ? "No rooms match your search."
                          : "No available rooms found for this booking window."}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Select every room allocated to this reservation. Rooms marked occupied cannot be assigned until they are freed.
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                    <div>
                      <p className="text-sm font-medium">Mark booking as checked in</p>
                      <p className="text-xs text-muted-foreground">
                        Updates booking status to CHECKED_IN and locks the room for QR ordering.
                      </p>
                    </div>
                    <Switch
                      checked={markCheckinComplete}
                      onCheckedChange={setMarkCheckinComplete}
                    />
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={resetCheckinModal}>
                      Close
                    </Button>
                    <Button
                      onClick={handleSaveCheckin}
                      disabled={
                        isSavingCheckin ||
                        !(checkinContext.checkinDetails?.guests?.length ?? 0)
                      }
                    >
                      {isSavingCheckin ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Check-in"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <p>Select a booking to manage its check-in.</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ManageBookings;
  const resetCreateForm = () => {
    setCreateForm(initialCreateForm);
    setCreateTouchedTotal(false);
  };

  const createBookingMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      return apiPost("/public/bookings", payload);
    },
    onSuccess: () => {
      toast({
        title: "Booking created",
        description: "Reservation recorded successfully.",
      });
      resetCreateForm();
      setShowCreateBooking(false);
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
          ? error.message
          : "Unable to create booking.";
      toast({
        title: "Creation failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const allowedOutletOptions = useMemo(
    () => (Array.isArray(outletsData?.outlets) ? outletsData.outlets : []),
    [outletsData],
  );

  useEffect(() => {
    if (!showCreateBooking) return;
    setCreateForm((prev) => {
      if (prev.outlet_id && prev.outlet_id.length > 0) return prev;
      if (selectedOutlet && selectedOutlet !== "all") {
        return { ...prev, outlet_id: selectedOutlet };
      }
      const fallbackOutlet = allowedOutletOptions[0]?.location_key;
      return fallbackOutlet ? { ...prev, outlet_id: fallbackOutlet } : prev;
    });
  }, [showCreateBooking, selectedOutlet, allowedOutletOptions]);

  const handleCreateInputChange = (field: keyof typeof createForm, value: string) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  };
