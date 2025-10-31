import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  CalendarIcon,
  ArrowLeft,
  Wifi,
  Coffee,
  Tv,
  Bed,
  Plus,
  Minus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/red-chilly-logo.jpeg";
import { apiGet, apiPost, ApiError } from "@/lib/apiClient";
import { getAdminScopes, hasAdminScope } from "@/hooks/useAdminAccess";

const BookRoom = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [checkIn, setCheckIn] = useState<Date>();
  const [checkOut, setCheckOut] = useState<Date>();
  const [guests, setGuests] = useState("2");
  const [selectedOutlet, setSelectedOutlet] = useState<string>("");
  const [categorySelections, setCategorySelections] = useState<
    Record<string, number>
  >({});
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [confirmation, setConfirmation] = useState<any>(null);
  const [customTotal, setCustomTotal] = useState("");
  const [customTotalTouched, setCustomTotalTouched] = useState(false);

  const adminScopes = useMemo(() => getAdminScopes(), []);
  const canAdjustPricing = useMemo(
    () => hasAdminScope(adminScopes, ["admin", "rooms"]),
    [adminScopes],
  );

  // -------- Queries --------
  const { data: outletsData } = useQuery({
    queryKey: ["outlets"],
    queryFn: async () => {
      return apiGet("/public/outlets");
    },
  });

  const { data: availability, refetch: refetchRooms } = useQuery({
    queryKey: ["available-rooms", selectedOutlet, checkIn, checkOut],
    queryFn: async () => {
      if (!selectedOutlet || !checkIn || !checkOut) return { rooms: [] };

      return apiPost("/public/rooms/availability", {
        outlet_id: selectedOutlet,
        check_in_date: format(checkIn, "yyyy-MM-dd"),
        check_out_date: format(checkOut, "yyyy-MM-dd"),
      });
    },
    enabled: !!selectedOutlet && !!checkIn && !!checkOut,
  });

  useEffect(() => {
    if (selectedOutlet && checkIn && checkOut) {
      refetchRooms();
    }
  }, [selectedOutlet, checkIn, checkOut, refetchRooms]);

  // -------- Mutations --------
  const bookingMutation = useMutation({
    mutationFn: async (bookingData: any) => {
      return apiPost("/public/bookings", bookingData);
    },
    onSuccess: (data) => {
      const bookingResponse = data as any;
      const booking = bookingResponse?.booking;
      if (booking) {
        booking.allocated_rooms =
          bookingResponse?.allocated_rooms ?? booking.rooms_allocated ?? [];
      }
      setConfirmation(booking ?? null);
      setCategorySelections({});
      toast({
        title: "Booking Successful!",
        description: booking?.booking_code
          ? `Reservation confirmed. Your booking code is ${booking.booking_code}.`
          : "Your room has been booked. We'll send you a confirmation email shortly.",
      });
    },
    onError: (error: Error | ApiError) => {
      toast({
        title: "Booking Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reset selections when critical inputs change
  useEffect(() => {
    setCategorySelections({});
  }, [selectedOutlet, checkIn?.getTime?.(), checkOut?.getTime?.()]);

  // -------- Helpers & Derived --------
  const normalizeCategory = (room: any) => {
    const raw =
      (room?.room_type && String(room.room_type).trim()) ||
      (room?.room_type && String(room.room_type));
    if (raw && raw.length > 0) return raw;
    return room?.type === "ROOM" ? "Standard Room" : (room?.type ?? "Room");
  };

  const sortedRooms = useMemo(() => {
    if (!availability?.rooms) return [];
    return availability.rooms
      .slice()
      .map((room: any) => ({
        ...room,
        __category: normalizeCategory(room),
      }))
      .sort(
        (a: any, b: any) =>
          (a.effective_rate_per_night ?? a.price_per_night) -
          (b.effective_rate_per_night ?? b.price_per_night),
      );
  }, [availability?.rooms]);

  const roomsByCategory = useMemo(() => {
    const map = new Map<string, any[]>();
    sortedRooms.forEach((room: any) => {
      const key = room.__category;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(room);
    });
    return map;
  }, [sortedRooms]);

  const categoryOptions = useMemo(() => {
    if (
      Array.isArray(availability?.categories) &&
      availability.categories.length > 0
    ) {
      return availability.categories.map((entry: any) => ({
        category: entry.category,
        available_count: entry.available_count,
        min_rate: entry.min_rate,
        max_rate: entry.max_rate,
        max_occupancy: entry.max_occupancy,
        amenities: entry.amenities ?? [],
      }));
    }

    return Array.from(roomsByCategory.entries())
      .map(([key, rooms]) => {
        const rates = rooms.map((room: any) =>
          Number(room.effective_rate_per_night ?? room.price_per_night ?? 0),
        );
        const occupancies = rooms.map((room: any) =>
          Number(room.occupancy ?? 2),
        );
        const amenities = Array.from(
          new Set(
            rooms
              .flatMap((room: any) =>
                Array.isArray(room.amenities) ? room.amenities : [],
              )
              .map((item: any) => String(item)),
          ),
        );
        return {
          category: key,
          available_count: rooms.length,
          min_rate: rates.length ? Math.min(...rates) : 0,
          max_rate: rates.length ? Math.max(...rates) : 0,
          max_occupancy: occupancies.length ? Math.max(...occupancies) : 0,
          amenities,
        };
      })
      .sort((a, b) => a.min_rate - b.min_rate);
  }, [availability?.categories, roomsByCategory]);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, any>();
    categoryOptions.forEach((option: any) => {
      map.set(option.category, option);
    });
    return map;
  }, [categoryOptions]);

  // keep only valid categories and clamp counts to available
  useEffect(() => {
    setCategorySelections((prev) => {
      if (categoryOptions.length === 0) return {};

      const updated: Record<string, number> = {};
      let changed = false;

      categoryOptions.forEach((option: any) => {
        const prevCount = prev[option.category] ?? 0;
        if (prevCount > 0) {
          const available = Number(option.available_count ?? 0);
          const allowed = Math.min(prevCount, available);
          if (allowed > 0) {
            updated[option.category] = allowed;
          }
          if (allowed !== prevCount) {
            changed = true;
          }
        }
      });

      const prevKeys = Object.keys(prev);
      if (prevKeys.some((key) => !categoryLookup.has(key))) {
        changed = true;
      }

      if (!changed && prevKeys.length === Object.keys(updated).length) {
        let identical = true;
        for (const key of prevKeys) {
          if (prev[key] !== updated[key]) {
            identical = false;
            break;
          }
        }
        if (identical) {
          return prev;
        }
      }

      return updated;
    });
  }, [categoryOptions, categoryLookup]);

  // if no selection, auto-select the first available
  useEffect(() => {
    setCategorySelections((prev) => {
      if (Object.keys(prev).length > 0 || categoryOptions.length === 0)
        return prev;
      const firstAvailable = categoryOptions.find(
        (o: any) => (o.available_count ?? 0) > 0,
      );
      if (!firstAvailable) return prev;
      return { [firstAvailable.category]: 1 };
    });
  }, [categoryOptions]);

  const totalRoomsSelected = useMemo(
    () =>
      Object.values(categorySelections).reduce((sum, count) => sum + count, 0),
    [categorySelections],
  );

  const roomsForSummary = useMemo(() => {
    const result: any[] = [];
    for (const [category, count] of Object.entries(categorySelections)) {
      if (count <= 0) continue;
      const bucket = roomsByCategory.get(category) ?? [];
      if (bucket.length === 0) continue;
      const chosen = bucket.slice(0, count).map((room: any) => ({
        ...room,
        __selectedCategory: room.__category ?? category,
      }));
      result.push(...chosen);
    }
    return result;
  }, [categorySelections, roomsByCategory]);

  const missingCategory = useMemo(() => {
    for (const [category, count] of Object.entries(categorySelections)) {
      const bucket = roomsByCategory.get(category) ?? [];
      if (count > bucket.length) {
        return category;
      }
    }
    return null;
  }, [categorySelections, roomsByCategory]);

  const fallbackCapacity = useMemo(() => {
    let total = 0;
    for (const [category, count] of Object.entries(categorySelections)) {
      if (count <= 0) continue;
      const option = categoryLookup.get(category);
      const occupancy = option?.max_occupancy ?? 2;
      total += occupancy * count;
    }
    return total;
  }, [categorySelections, categoryLookup]);

  // ---------- Pricing helpers (FIX) ----------
  const nights =
    checkIn && checkOut
      ? Math.max(
          Math.ceil(
            (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
          ),
          1,
        )
      : 0;

  // derive a single room's nightly rate; falls back to dividing total by nights
  const nightlyRateForRoom = (room: any, nightsCount: number) => {
    const direct = room?.effective_rate_per_night ?? room?.price_per_night;
    if (direct != null && !Number.isNaN(Number(direct))) return Number(direct);

    if (nightsCount > 0 && room?.effective_total != null) {
      const perNight = Number(room.effective_total) / nightsCount;
      return Number.isFinite(perNight) ? perNight : 0;
    }
    return 0;
  };

  const indicativeRate =
    roomsForSummary.length > 0
      ? roomsForSummary
          .slice()
          .sort(
            (a: any, b: any) =>
              (a.effective_rate_per_night ?? a.price_per_night) -
              (b.effective_rate_per_night ?? b.price_per_night),
          )[0]
      : sortedRooms.length > 0
        ? sortedRooms[0]
        : null;

  const estimatedTotal = roomsForSummary.reduce(
    (sum: number, room: any) =>
      sum +
      Number(
        room.effective_total ??
          Number(room.price_per_night ?? 0) * (nights || 1),
      ),
    0,
  );

  useEffect(() => {
    if (canAdjustPricing) {
      setCustomTotal((prev) => {
        if (customTotalTouched) return prev;
        return estimatedTotal > 0 ? estimatedTotal.toFixed(2) : "";
      });
    } else if (customTotal !== "" || customTotalTouched) {
      setCustomTotal("");
      setCustomTotalTouched(false);
    }
  }, [canAdjustPricing, estimatedTotal, customTotalTouched, customTotal]);

  const estimatedCapacity = roomsForSummary.reduce(
    (sum: number, room: any) => sum + Number(room.occupancy ?? 2),
    0,
  );

  // NEW: Sum of nightly rates across selected rooms (fixes “Estimated Rate / Night”)
  const estimatedNightlyRateTotal = roomsForSummary.reduce(
    (sum: number, room: any) => sum + nightlyRateForRoom(room, nights || 1),
    0,
  );

  const selectedCount = totalRoomsSelected;

  const parsedCustomTotal = Number(customTotal);
  const hasCustomOverride =
    canAdjustPricing &&
    customTotal.trim().length > 0 &&
    Number.isFinite(parsedCustomTotal);
  const finalTotalAmount = hasCustomOverride
    ? Number(parsedCustomTotal.toFixed(2))
    : Number(estimatedTotal.toFixed(2));
  const finalTotalDisplay = Number.isFinite(finalTotalAmount)
    ? finalTotalAmount
    : estimatedTotal;

  // -------- Actions --------
  const increaseCategory = (category: string) => {
    const option = categoryLookup.get(category);
    if (!option) return;
    const maxAvailable = Number(option.available_count ?? 0);
    setCategorySelections((prev) => {
      const current = prev[category] ?? 0;
      if (current >= maxAvailable) return prev;
      return { ...prev, [category]: current + 1 };
    });
  };

  const decreaseCategory = (category: string) => {
    setCategorySelections((prev) => {
      const current = prev[category] ?? 0;
      if (current <= 0) return prev;
      const nextCount = current - 1;
      const nextSelections = { ...prev };
      if (nextCount <= 0) {
        delete nextSelections[category];
      } else {
        nextSelections[category] = nextCount;
      }
      return nextSelections;
    });
  };

  const handleBooking = () => {
    if (!selectedOutlet || !checkIn || !checkOut || !guestName || !guestPhone) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (!availability?.rooms || availability.rooms.length === 0) {
      toast({
        title: "No rooms available",
        description: "We couldn't find available rooms for the selected dates.",
        variant: "destructive",
      });
      return;
    }

    if (missingCategory) {
      toast({
        title: "Update selections",
        description: `${missingCategory} no longer has enough rooms. Adjust your selection.`,
        variant: "destructive",
      });
      return;
    }

    if (selectedCount <= 0) {
      toast({
        title: "Select a room category",
        description:
          "Choose the room classes and quantities you wish to reserve.",
        variant: "destructive",
      });
      return;
    }

    const roomsToBook = roomsForSummary;
    if (roomsToBook.length === 0) {
      toast({
        title: "Category unavailable",
        description:
          "The selected room category is no longer available. Please pick another option.",
        variant: "destructive",
      });
      return;
    }

    if (roomsToBook.length !== selectedCount) {
      toast({
        title: "Update room quantity",
        description:
          "Fewer rooms are available than you selected. Adjust the counts and try again.",
        variant: "destructive",
      });
      return;
    }

    const computedNights = Math.max(
      Math.ceil(
        (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
      ),
      1,
    );

    const totalAmount = roomsToBook.reduce(
      (sum: number, room: any) =>
        sum +
        Number(
          room.effective_total ??
            Number(room.price_per_night ?? 0) * computedNights,
        ),
      0,
    );

    let finalAmount = totalAmount;
    if (canAdjustPricing) {
      const trimmed = customTotal.trim();
      if (trimmed.length > 0) {
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) {
          toast({
            title: "Invalid amount",
            description: "Enter a valid negotiated total before submitting.",
            variant: "destructive",
          });
          return;
        }
        finalAmount = Number(parsed.toFixed(2));
      } else {
        finalAmount = Number(totalAmount.toFixed(2));
      }
    } else {
      finalAmount = Number(totalAmount.toFixed(2));
    }

    const capacity = roomsToBook.reduce(
      (sum: number, room: any) => sum + Number(room.occupancy ?? 2),
      0,
    );

    const guestCount = Number.parseInt(guests, 10) || 0;
    if (guestCount > capacity) {
      toast({
        title: "Adjust room count",
        description: `The selected rooms fit up to ${capacity} guest(s). Increase rooms or reduce guest count.`,
        variant: "destructive",
      });
      return;
    }

    const categoryEntries = Object.entries(categorySelections).filter(
      ([, count]) => count > 0,
    );
    const categoriesPayload = categoryEntries.length
      ? Object.fromEntries(categoryEntries)
      : undefined;
    const dominantCategory =
      categoryEntries.length === 1 ? categoryEntries[0][0] : undefined;

    bookingMutation.mutate({
      outlet_id: selectedOutlet,
      rooms_requested: selectedCount,
      preferred_room_type: dominantCategory ?? null,
      preferred_categories: categoriesPayload,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone,
      check_in_date: format(checkIn, "yyyy-MM-dd"),
      check_out_date: format(checkOut, "yyyy-MM-dd"),
      number_of_guests:
        Number.parseInt(guests, 10) || fallbackCapacity || estimatedCapacity,
      total_amount: finalAmount,
      special_requests: specialRequests,
    });
  };

  // -------- UI --------
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b print:bg-transparent print:border-none print:shadow-none">
        <div className="container mx-auto px-4 py-4 print:max-w-3xl print:px-0 print:py-6">
          <div className="flex items-center gap-4 print:gap-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="print:hidden"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img
              src={logo}
              alt="Red Chilly Logo"
              className="w-12 h-12 object-contain print:w-16 print:h-16"
            />
            <div className="text-left">
              <h1 className="text-2xl font-bold print:text-3xl">
                Book Your Room
              </h1>
              <p className="text-sm text-muted-foreground print:text-base print:text-gray-600">
                Red Chilly The Restaurant & Banquet Hall
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6 print:max-w-3xl print:px-0 print:py-6 print:space-y-4">
        {confirmation && (
          <Card className="border-2 border-primary/40 shadow-elegant hover:shadow-elegant-selected transition-shadow print:border print:border-gray-300 print:shadow-none print:bg-white print:text-gray-900 print:rounded-md print:break-inside-avoid print:mt-4">
            <CardHeader className="print:p-0 print:pb-4 print:mb-6 print:border-b print:border-gray-200">
              <CardTitle className="print:text-3xl">
                Reservation Confirmed
              </CardTitle>
              <CardDescription className="print:text-base print:text-gray-600">
                Present these details at check-in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 print:space-y-6 print:p-0">
              <div className="grid sm:grid-cols-2 gap-3 text-sm print:text-base print:gap-y-4">
                <div>
                  <p className="text-muted-foreground print:text-gray-600">
                    Booking Code
                  </p>
                  <p className="text-lg font-semibold tracking-wide">
                    {confirmation.booking_code}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground print:text-gray-600">
                    Check-in
                  </p>
                  <p className="font-semibold">
                    {new Date(confirmation.check_in_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground print:text-gray-600">
                    Check-out
                  </p>
                  <p className="font-semibold">
                    {new Date(confirmation.check_out_date).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {(confirmation.guest_name ||
                confirmation.guest_email ||
                confirmation.guest_phone ||
                confirmation.number_of_guests ||
                confirmation.total_amount != null) && (
                <div className="grid gap-3 sm:grid-cols-2 text-sm print:text-base print:gap-y-4">
                  {(confirmation.guest_name ||
                    confirmation.number_of_guests) && (
                    <div>
                      <p className="text-muted-foreground print:text-gray-600">
                        Guest
                      </p>
                      <p className="font-semibold">
                        {confirmation.guest_name ?? "—"}
                        {confirmation.number_of_guests
                          ? ` · ${confirmation.number_of_guests} guest${
                              confirmation.number_of_guests > 1 ? "s" : ""
                            }`
                          : ""}
                      </p>
                    </div>
                  )}
                  {confirmation.guest_phone && (
                    <div>
                      <p className="text-muted-foreground print:text-gray-600">
                        Phone
                      </p>
                      <p className="font-semibold">
                        {confirmation.guest_phone}
                      </p>
                    </div>
                  )}
                  {confirmation.guest_email && (
                    <div>
                      <p className="text-muted-foreground print:text-gray-600">
                        Email
                      </p>
                      <p className="font-semibold break-words">
                        {confirmation.guest_email}
                      </p>
                    </div>
                  )}
                  {confirmation.total_amount != null && (
                    <div>
                      <p className="text-muted-foreground print:text-gray-600">
                        Total Amount
                      </p>
                      <p className="font-semibold">
                        {Number.isFinite(Number(confirmation.total_amount))
                          ? `₹${Number(confirmation.total_amount).toFixed(2)}`
                          : confirmation.total_amount}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {(confirmation.allocated_rooms ?? confirmation.rooms_allocated)
                ?.length > 0 && (
                <div className="rounded-lg border bg-muted/40 p-3 space-y-2 print:bg-white print:border print:border-gray-200 print:p-4">
                  <div>
                    <p className="text-sm font-semibold print:text-base">
                      Reserved Room Categories
                    </p>
                    <p className="text-xs text-muted-foreground print:text-sm print:text-gray-600">
                      Specific room numbers will be allotted by the front desk
                      during check-in.
                    </p>
                  </div>
                  <ul className="space-y-1 text-sm print:space-y-2 print:text-base">
                    {(
                      confirmation.allocated_rooms ??
                      confirmation.rooms_allocated
                    ).map((room: any, index: number) => {
                      const label =
                        room.room_type ??
                        room.category ??
                        room.roomClass ??
                        `Room ${index + 1}`;
                      const stayNights =
                        room.perNight?.length ?? confirmation.nights ?? 1;
                      const nightly = Number(
                        room.effective_rate_per_night ??
                          room.effective_rate ??
                          room.base_rate ??
                          0,
                      );
                      return (
                        <li
                          key={room.room_id ?? `reserved-${index}`}
                          className="flex items-center justify-between"
                        >
                          <span>{label}</span>
                          <span className="text-muted-foreground print:text-gray-600">
                            ₹{nightly.toFixed(2)} × {stayNights} night
                            {stayNights > 1 ? "s" : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {confirmation.special_requests?.trim() && (
                <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-sm print:border-gray-300 print:bg-white print:p-4 print:text-base">
                  <p className="font-semibold text-primary print:text-gray-900">
                    Special Requests
                  </p>
                  <p className="mt-1 text-muted-foreground whitespace-pre-line print:text-gray-700">
                    {confirmation.special_requests.trim()}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 print:hidden">
                <Button
                  onClick={() => navigate("/")}
                  className="gradient-primary shadow-elegant"
                >
                  Go to Home
                </Button>
                <Button variant="outline" onClick={() => window.print?.()}>
                  Print Details
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!confirmation && (
          <>
            <Card className="mb-6 shadow-elegant hover:shadow-elegant-selected transition-shadow">
              <CardHeader>
                <CardTitle>Book Your Stay</CardTitle>
                <CardDescription>
                  Select your hotel branch, dates, and room
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Outlet + Guests */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Select Branch/Outlet</Label>
                    <Select
                      value={selectedOutlet}
                      onValueChange={setSelectedOutlet}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {outletsData?.outlets?.map((outlet: any) => (
                          <SelectItem
                            key={outlet.location_key}
                            value={outlet.location_key}
                          >
                            {outlet.location_key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Number of Guests</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={guests}
                      onChange={(e) => setGuests(e.target.value)}
                      placeholder="Number of guests"
                    />
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Check-in Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !checkIn && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {checkIn ? format(checkIn, "PPP") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={checkIn}
                          onSelect={setCheckIn}
                          disabled={(date) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            return date < today;
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Check-out Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !checkOut && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {checkOut ? format(checkOut, "PPP") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={checkOut}
                          onSelect={setCheckOut}
                          disabled={(date) => !checkIn || date <= checkIn}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Empty state */}
                {selectedOutlet &&
                  checkIn &&
                  checkOut &&
                  (!availability?.rooms || availability.rooms.length === 0) && (
                    <p className="text-muted-foreground text-center py-4">
                      No rooms available for selected dates. Please try
                      different dates.
                    </p>
                  )}

                {/* Room selection */}
                {selectedOutlet &&
                  checkIn &&
                  checkOut &&
                  availability?.rooms &&
                  availability.rooms.length > 0 && (
                    <>
                      {/* Selection summary (includes FIX) */}
                      <div className="space-y-2">
                        <Label>Your Selection</Label>
                        <div className="rounded-lg border p-4 bg-muted/40 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm text-muted-foreground">
                                Rooms selected
                              </p>
                              <p className="text-lg font-semibold">
                                {selectedCount > 0
                                  ? `${selectedCount} room${selectedCount === 1 ? "" : "s"}`
                                  : "None"}
                              </p>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {selectedCount > 0
                                ? "Adjust room counts by category below."
                                : "Pick a room class below to begin."}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <p className="text-muted-foreground">Nights</p>
                              <p className="font-semibold">{nights || 1}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Estimated Rate / Night
                              </p>
                              <p className="font-semibold">
                                ₹
                                {(selectedCount > 0
                                  ? estimatedNightlyRateTotal
                                  : Number(
                                      indicativeRate?.effective_rate_per_night ??
                                        indicativeRate?.price_per_night ??
                                        0,
                                    )
                                ).toFixed(2)}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Estimated Total
                              </p>
                              <p className="font-semibold">
                                ₹{estimatedTotal.toFixed(2)}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Capacity</p>
                              <p className="font-semibold">
                                {selectedCount > 0
                                  ? `Up to ${estimatedCapacity || fallbackCapacity || selectedCount * 2} guests`
                                  : "Select a category to view capacity"}
                              </p>
                            </div>
                          </div>

                          {Object.entries(categorySelections).filter(
                            ([, count]) => count > 0,
                          ).length > 0 && (
                            <div className="border-t pt-3 text-xs text-muted-foreground">
                              <p className="font-semibold text-foreground mb-2">
                                Breakdown
                              </p>
                              <div className="space-y-1">
                                {Object.entries(categorySelections)
                                  .filter(([, count]) => count > 0)
                                  .map(([category, count]) => (
                                    <div
                                      key={category}
                                      className="flex items-center justify-between"
                                    >
                                      <span>{category}</span>
                                      <span>
                                        {count} room{count === 1 ? "" : "s"}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Category pickers */}
                      <div className="space-y-3">
                        <Label>Choose Your Room Categories</Label>
                        <p className="text-xs text-muted-foreground">
                          Set how many rooms you need from each class.
                          Availability updates automatically with your date
                          selection.
                        </p>
                        <div className="space-y-2">
                          {categoryOptions.map((category: any) => {
                            const count =
                              categorySelections[category.category] ?? 0;
                            const isActive = count > 0;
                            const maxForCategory = Number(
                              category.available_count ?? 0,
                            );
                            return (
                              <div
                                key={category.category}
                                className={cn(
                                  "w-full rounded-lg border p-4 transition-colors",
                                  isActive
                                    ? "border-primary bg-primary/10 shadow-sm"
                                    : "border-border bg-background",
                                )}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="font-semibold text-base">
                                      {category.category}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Up to {category.max_occupancy || 2} guests
                                      · {category.available_count} room
                                      {category.available_count === 1
                                        ? ""
                                        : "s"}{" "}
                                      available
                                    </p>
                                    {category.available_count === 0 && (
                                      <p className="text-xs text-destructive">
                                        Not available for the selected dates.
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() =>
                                        decreaseCategory(category.category)
                                      }
                                      disabled={count <= 0}
                                      aria-label={`Remove one ${category.category} room`}
                                    >
                                      <Minus className="h-4 w-4" />
                                    </Button>
                                    <span className="w-8 text-center font-semibold">
                                      {count}
                                    </span>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() =>
                                        increaseCategory(category.category)
                                      }
                                      disabled={count >= maxForCategory}
                                      aria-label={`Add one ${category.category} room`}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>

                                {count >= maxForCategory &&
                                  maxForCategory > 0 && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      All available rooms for this category are
                                      selected.
                                    </p>
                                  )}

                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                                  <div className="text-muted-foreground">
                                    From ₹
                                    {Number(category.min_rate ?? 0).toFixed(2)}{" "}
                                    per night
                                  </div>
                                  {category.max_rate &&
                                    category.max_rate !== category.min_rate && (
                                      <div className="text-muted-foreground text-xs">
                                        Peaks at ₹
                                        {Number(category.max_rate).toFixed(2)}
                                      </div>
                                    )}
                                </div>

                                {Array.isArray(category.amenities) &&
                                  category.amenities.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-1 text-xs text-muted-foreground">
                                      {category.amenities.map(
                                        (amenity: string) => (
                                          <span
                                            key={`${category.category}-${amenity}`}
                                            className="rounded-full border px-2 py-1"
                                          >
                                            {amenity}
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  )}
                              </div>
                            );
                          })}

                          {categoryOptions.length === 0 && (
                            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                              No room categories available for the selected
                              dates.
                            </div>
                          )}

                          {missingCategory && (
                            <p className="text-xs text-destructive">
                              {missingCategory} no longer has enough rooms for
                              your selection. Please adjust the count.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Guest details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Full Name *</Label>
                          <Input
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            placeholder="Enter your full name"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input
                            type="email"
                            value={guestEmail}
                            onChange={(e) => setGuestEmail(e.target.value)}
                            placeholder="your@email.com"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Phone Number *</Label>
                        <Input
                          type="tel"
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          placeholder="+91 1234567890"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Special Requests</Label>
                        <Textarea
                          value={specialRequests}
                          onChange={(e) => setSpecialRequests(e.target.value)}
                          placeholder="Any special requests or requirements?"
                        />
                      </div>

                      {/* Price summary */}
                      <div className="bg-muted p-4 rounded-lg space-y-3">
                        <div className="flex justify-between items-center">
                          <span>Rooms selected:</span>
                          <span className="font-semibold">{selectedCount}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Category:</span>
                          <span className="font-semibold">
                            {Object.entries(categorySelections)
                              .filter(([, count]) => count > 0)
                              .map(([category]) => category)
                              .join(", ") || "Choose a category"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Nights:</span>
                          <span className="font-semibold">{nights || 1}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Estimated total:</span>
                          <span className="font-semibold">
                            ₹{estimatedTotal.toFixed(2)}
                          </span>
                        </div>
                        {canAdjustPricing && (
                          <div className="space-y-2">
                            <Label htmlFor="negotiated-total">
                              Negotiated total (₹)
                            </Label>
                            <Input
                              id="negotiated-total"
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              value={customTotal}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setCustomTotalTouched(
                                  nextValue.trim().length > 0,
                                );
                                setCustomTotal(nextValue);
                              }}
                              placeholder={
                                estimatedTotal > 0
                                  ? estimatedTotal.toFixed(2)
                                  : "0.00"
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Leave blank to use the estimated amount above.
                            </p>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span>
                            {canAdjustPricing ? "Final total:" : "Total:"}
                          </span>
                          <span className="font-semibold">
                            ₹{finalTotalDisplay.toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Final allocation and pricing are confirmed after
                          booking. You will receive a detailed breakdown in your
                          confirmation receipt.
                        </p>
                      </div>

                      {/* Selected rooms list */}
                      {roomsForSummary.length > 0 && (
                        <div className="rounded-lg border p-4 space-y-2">
                          <p className="text-sm font-semibold">
                            Your reserved rooms
                          </p>
                          <div className="space-y-2 text-sm">
                            {roomsForSummary.map((room: any, index: number) => {
                              const categoryLabel =
                                room.__selectedCategory ??
                                room.__category ??
                                room.room_type ??
                                `Room ${index + 1}`;
                              const perNight = nightlyRateForRoom(
                                room,
                                nights || 1,
                              );
                              const subtotal = Number(
                                room.effective_total ??
                                  Number(room.price_per_night ?? 0) *
                                    (nights || 1),
                              );
                              return (
                                <div
                                  key={room.id ?? index}
                                  className="flex items-center justify-between"
                                >
                                  <div>
                                    <span className="font-medium">
                                      {categoryLabel}
                                    </span>
                                    <span className="text-muted-foreground ml-2">
                                      Room {index + 1} · Occupancy:{" "}
                                      {room.occupancy ?? "2"} guests
                                    </span>
                                  </div>
                                  <div className="text-right text-muted-foreground">
                                    <div>₹{perNight.toFixed(2)}/night</div>
                                    <div className="text-xs">
                                      Subtotal: ₹{subtotal.toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <Button
                        onClick={handleBooking}
                        className="w-full"
                        disabled={
                          bookingMutation.isPending ||
                          !availability?.rooms ||
                          availability.rooms.length === 0 ||
                          roomsForSummary.length === 0 ||
                          !!missingCategory
                        }
                      >
                        {bookingMutation.isPending
                          ? "Processing..."
                          : "Confirm Booking"}
                      </Button>
                    </>
                  )}
              </CardContent>
            </Card>

            {/* Amenities */}
            <Card className="shadow-elegant hover:shadow-elegant-selected transition-shadow">
              <CardHeader>
                <CardTitle>Hotel Amenities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-primary mx-auto mb-3 flex items-center justify-center">
                      <Wifi className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <p className="font-semibold">Free Wi-Fi</p>
                    <p className="text-sm text-muted-foreground">
                      High-speed internet
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-primary mx-auto mb-3 flex items-center justify-center">
                      <Coffee className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <p className="font-semibold">Restaurant</p>
                    <p className="text-sm text-muted-foreground">
                      In-room dining
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-primary mx-auto mb-3 flex items-center justify-center">
                      <Tv className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <p className="font-semibold">Entertainment</p>
                    <p className="text-sm text-muted-foreground">
                      Smart TV in rooms
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-primary mx-auto mb-3 flex items-center justify-center">
                      <Bed className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <p className="font-semibold">Comfort</p>
                    <p className="text-sm text-muted-foreground">
                      Premium bedding
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default BookRoom;
