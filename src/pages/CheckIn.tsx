import { useCallback, useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  FileCheck2,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  UserPlus,
} from "lucide-react";
import { apiPost, ApiError } from "@/lib/apiClient";

type LookupFormValues = {
  bookingCode: string;
  lastName: string;
};

type GuestFormValues = {
  fullName: string;
  documentType: string;
  documentNumber: string;
  documentImageDataUrl?: string;
  documentImageName?: string;
  documentImageType?: string;
};

type CheckinFormValues = {
  guests: GuestFormValues[];
  expectedArrivalTime: string;
  needsSpecialAssistance: boolean;
  specialAssistanceDetails?: string;
  otherRequests?: string;
};

type BookingRecord = {
  id: string;
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  check_in_date?: string;
  check_out_date?: string;
  booking_code?: string;
  status?: string;
  number_of_guests?: number;
  outlet_id?: string;
  room_id?: string;
  room_ids?: string[];
  rooms_allocated?: Array<Record<string, unknown>>;
};

type CheckinDetails = {
  status?: string;
  expected_arrival_time?: string | null;
  needs_special_assistance?: boolean;
  special_assistance_details?: string | null;
  other_requests?: string | null;
  guests?: Array<{
    full_name: string;
    document_type: string;
    document_number: string;
    document_image?: {
      data_url: string;
      file_name?: string;
      mime_type?: string;
    };
  }>;
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
};

type RoomOption = {
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

const DOCUMENT_TYPES = [
  { value: "Aadhar Card", label: "Aadhar Card", placeholder: "Enter Aadhar number" },
  { value: "Driver's Licence", label: "Driver's Licence", placeholder: "Enter licence number" },
  { value: "Passport", label: "Passport", placeholder: "Enter passport number" },
  { value: "Voter ID", label: "Voter ID", placeholder: "Enter voter ID number" },
  { value: "PAN Card", label: "PAN Card", placeholder: "Enter PAN number" },
  { value: "Other", label: "Other Document", placeholder: "Enter document number" },
];

const MAX_GUESTS = 6;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const formatDate = (value?: string) => {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const toDateTimeLocalInput = (value?: string | null) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file. Please try again."));
    reader.readAsDataURL(file);
  });

const CheckIn = () => {
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [checkinDetails, setCheckinDetails] = useState<CheckinDetails | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [lookupContext, setLookupContext] = useState<LookupFormValues | null>(null);

  const lookupForm = useForm<LookupFormValues>({
    defaultValues: {
      bookingCode: "",
      lastName: "",
    },
  });

  const checkinForm = useForm<CheckinFormValues>({
    defaultValues: {
      guests: [{ fullName: "", documentType: "", documentNumber: "" }],
      expectedArrivalTime: "",
      needsSpecialAssistance: false,
      specialAssistanceDetails: "",
      otherRequests: "",
    },
  });

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    resetField,
    formState: { errors },
  } = checkinForm;

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "guests",
  });

  const needsAssistance = watch("needsSpecialAssistance");

  const applyDefaults = useCallback(
    (bookingData: BookingRecord, details: CheckinDetails | null) => {
      const existingGuests =
        details?.guests?.map((guest) => ({
          fullName: guest.full_name ?? "",
          documentType: guest.document_type ?? DOCUMENT_TYPES[0].value,
          documentNumber: guest.document_number ?? "",
          documentImageDataUrl: guest.document_image?.data_url ?? "",
          documentImageName: guest.document_image?.file_name ?? "",
          documentImageType: guest.document_image?.mime_type ?? "",
        })) ?? [];

      const fallbackCount = Math.max(Number(bookingData?.number_of_guests ?? 1), 1);
      const baseGuests =
        existingGuests.length > 0
          ? existingGuests
          : Array.from({ length: fallbackCount }).map(() => ({
              fullName: "",
              documentType: DOCUMENT_TYPES[0].value,
              documentNumber: "",
              documentImageDataUrl: "",
              documentImageName: "",
              documentImageType: "",
            }));

      replace(baseGuests);

      setValue("expectedArrivalTime", toDateTimeLocalInput(details?.expected_arrival_time ?? ""));
      setValue("needsSpecialAssistance", Boolean(details?.needs_special_assistance));
      setValue("specialAssistanceDetails", details?.special_assistance_details ?? "");
      setValue("otherRequests", details?.other_requests ?? "");
    },
    [replace, setValue],
  );

  useEffect(() => {
    if (!needsAssistance) {
      resetField("specialAssistanceDetails");
    }
  }, [needsAssistance, resetField]);

  const handleLookup = lookupForm.handleSubmit(async (values) => {
    setLookupLoading(true);
    try {
      const payload = {
        action: "lookup",
        bookingCode: values.bookingCode.trim().toUpperCase(),
        lastName: values.lastName.trim(),
      };

      const data = await apiPost<{
        booking: BookingRecord;
        checkinDetails: CheckinDetails | null;
        availableRooms: RoomOption[];
      }>(
        "/admin/bookings/checkin",
        payload,
        true,
      );

      if (!data?.booking) {
        throw new Error("Booking not found. Please verify the details and try again.");
      }

      setBooking(data.booking);
      setCheckinDetails(data.checkinDetails ?? null);
      setLookupContext({
        bookingCode: payload.bookingCode,
        lastName: payload.lastName,
      });
      applyDefaults(data.booking, data.checkinDetails ?? null);

      toast.success("Booking located. Please complete the guest check-in form.");
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Unable to locate the booking.";
      toast.error(message);
    } finally {
      setLookupLoading(false);
    }
  });

  const handleGuestIdUpload = async (index: number, file?: File | null) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size exceeds 5MB. Please choose a smaller image.");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setValue(`guests.${index}.documentImageDataUrl`, dataUrl, {
        shouldTouch: true,
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue(`guests.${index}.documentImageName`, file.name, { shouldDirty: true });
      setValue(`guests.${index}.documentImageType`, file.type, { shouldDirty: true });
      toast.success(`Uploaded identity proof for guest ${index + 1}.`);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message ?? "Unable to process the selected file.");
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    if (!booking || !lookupContext) {
      toast.error("Please locate a booking before submitting check-in details.");
      return;
    }

    const missingGuestIndex = values.guests.findIndex(
      (guest) => !guest.documentImageDataUrl,
    );
    if (missingGuestIndex >= 0) {
      toast.error(`Guest ${missingGuestIndex + 1} is missing an identity document image.`);
      return;
    }

    setSubmitLoading(true);
    try {
      const payload = {
        action: "submit",
        bookingId: booking.id,
        bookingCode: lookupContext.bookingCode,
        lastName: lookupContext.lastName,
        checkinData: {
          guests: values.guests.map((guest) => ({
            fullName: guest.fullName.trim(),
            documentType: guest.documentType,
            documentNumber: guest.documentNumber.trim(),
            documentImageDataUrl: guest.documentImageDataUrl,
            documentImageName: guest.documentImageName,
            documentImageType: guest.documentImageType,
          })),
          expectedArrivalTime: values.expectedArrivalTime,
          needsSpecialAssistance: values.needsSpecialAssistance,
          specialAssistanceDetails: values.needsSpecialAssistance
            ? values.specialAssistanceDetails?.trim()
            : "",
          otherRequests: values.otherRequests?.trim(),
        },
      };

      const data = await apiPost<{
        booking: BookingRecord;
        checkinDetails: CheckinDetails | null;
        availableRooms: RoomOption[];
      }>(
        "/admin/bookings/checkin",
        payload,
        true,
      );

      if (!data?.booking) {
        throw new Error("Unable to save check-in data. Please try again.");
      }

      setBooking(data.booking);
      setCheckinDetails(data.checkinDetails ?? null);
      applyDefaults(data.booking, data.checkinDetails ?? null);

      toast.success("Check-in details saved successfully.");
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to save check-in details.";
      toast.error(message);
    } finally {
      setSubmitLoading(false);
    }
  });

  const resetWorkflow = () => {
    setBooking(null);
    setCheckinDetails(null);
    setLookupContext(null);
    lookupForm.reset();
    checkinForm.reset();
  };

  // const selectedRoom = selectableRooms.find((room) => room.id === selectedRoomId);

  return (
    <div className="min-h-screen bg-muted/20 py-10 overflow-y-auto">
      <div className="container mx-auto px-4 max-w-5xl space-y-8 pb-24">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Guest Check-in</h1>
            <p className="text-muted-foreground">
              Verify reservations using last name and booking code, capture identity proof, and assign rooms seamlessly.
            </p>
          </div>
          {booking && (
            <Button variant="outline" onClick={resetWorkflow}>
              Start Over
            </Button>
          )}
        </div>

        <Card className="shadow-elegant hover:shadow-elegant-selected transition-shadow">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="w-5 h-5" />
              Locate Booking
            </CardTitle>
            <CardDescription>
              Enter the booking code and the guest&apos;s last name to retrieve reservation details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={handleLookup}
              className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]"
            >
              <div className="space-y-2">
                <Label htmlFor="bookingCode">Booking Code</Label>
                <Input
                  id="bookingCode"
                  placeholder="e.g. RC-ABC123"
                  autoComplete="off"
                  {...lookupForm.register("bookingCode", {
                    required: "Booking code is required",
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="Guest last name"
                  autoComplete="family-name"
                  {...lookupForm.register("lastName", {
                    required: "Last name is required",
                  })}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full sm:w-auto" disabled={lookupLoading}>
                  {lookupLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Find Booking
                    </>
                  )}
                </Button>
              </div>
            </form>
            {lookupForm.formState.errors.bookingCode && (
              <p className="text-sm text-destructive">
                {lookupForm.formState.errors.bookingCode.message}
              </p>
            )}
            {lookupForm.formState.errors.lastName && (
              <p className="text-sm text-destructive">
                {lookupForm.formState.errors.lastName.message}
              </p>
            )}
          </CardContent>
        </Card>

        {booking && (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-2 border-primary/20 shadow-elegant hover:shadow-elegant-selected transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    Reservation Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="text-muted-foreground uppercase text-xs tracking-wide">Primary Guest</p>
                    <p className="font-semibold text-base">{booking.guest_name}</p>
                    <div className="text-muted-foreground space-y-1 mt-1">
                      {booking.guest_email && <p>{booking.guest_email}</p>}
                      {booking.guest_phone && <p>{booking.guest_phone}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border bg-muted/40 p-3">
                      <p className="flex items-center gap-1 text-xs text-muted-foreground uppercase">
                        <CalendarDays className="w-3 h-3" />
                        Check-in
                      </p>
                      <p className="font-medium">{formatDate(booking.check_in_date)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-3">
                      <p className="flex items-center gap-1 text-xs text-muted-foreground uppercase">
                        <CalendarDays className="w-3 h-3" />
                        Check-out
                      </p>
                      <p className="font-medium">{formatDate(booking.check_out_date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                    <span>Booking Code</span>
                    <span className="font-mono text-sm text-foreground">{booking.booking_code}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4" />
                      {booking.status ?? "PENDING"}
                    </Badge>
                    {checkinDetails?.status && (
                      <Badge
                        className={cn(
                          "flex items-center gap-1",
                          checkinDetails.status === "COMPLETED" ? "bg-green-600" : "bg-amber-500",
                        )}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {checkinDetails.status === "COMPLETED" ? "Checked-in" : "Pending"}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-elegant hover:shadow-elegant-selected transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    Room Assignment
                  </CardTitle>
                  <CardDescription>
                    Our front desk will assign rooms once your documents are verified in person.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(() => {
                    const assignedRooms = Array.isArray(checkinDetails?.assigned_room)
                      ? checkinDetails?.assigned_room
                      : checkinDetails?.assigned_room
                      ? [checkinDetails.assigned_room]
                      : [];
                    if (assignedRooms.length === 0) {
                      return (
                        <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground flex items-start gap-3">
                          <MapPin className="w-4 h-4 mt-0.5 text-primary" />
                          <div>
                            <p className="font-medium text-foreground">Room to be allotted on arrival</p>
                            <p>
                              Our reception team will allocate the best available room once the identity
                              documents are verified.
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3">
                        {assignedRooms.map((room, index) => (
                          <div
                            key={`${room?.id ?? index}`}
                            className="rounded-lg border bg-muted/40 p-4 flex items-center justify-between gap-4"
                          >
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                Assigned Room {assignedRooms.length > 1 ? index + 1 : ""}
                              </p>
                              <p className="text-xl font-semibold">
                                {room?.code ?? "TBD"}
                              </p>
                              {room?.type && (
                                <p className="text-xs text-muted-foreground">{room.type}</p>
                              )}
                            </div>
                            <Badge variant="outline" className="flex items-center gap-1">
                              <ShieldCheck className="w-4 h-4" />
                              Confirmed
                            </Badge>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <p className="text-xs text-muted-foreground">
                    Have a room preference? Mention it under other requests and the team will do
                    their best to accommodate it.
                  </p>
                </CardContent>
              </Card>
            </div>

            <form onSubmit={onSubmit} className="space-y-6">
              <Card className="shadow-elegant hover:shadow-elegant-selected transition-shadow">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <UserPlus className="w-5 h-5" />
                    Guest Details
                  </CardTitle>
                  <CardDescription>
                    Capture the identity proof for each guest staying under this reservation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {fields.map((field, index) => {
                    const docType = watch(`guests.${index}.documentType`);
                    const docImage = watch(`guests.${index}.documentImageDataUrl`);
                    const docTypeConfig =
                      DOCUMENT_TYPES.find((item) => item.value === docType) ?? DOCUMENT_TYPES[0];
                    const guestErrors = (errors.guests?.[index] ?? {}) as Record<string, any>;

                    return (
                      <div key={field.id} className="rounded-lg border bg-card/60 p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <User className="w-4 h-4" />
                            Guest {index + 1}
                          </div>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-destructive border-destructive/40"
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Remove
                            </Button>
                          )}
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor={`guest-name-${index}`}>Full Name</Label>
                            <Input
                              id={`guest-name-${index}`}
                              placeholder="Enter guest name"
                              autoComplete="name"
                              {...register(`guests.${index}.fullName` as const, {
                                required: "Guest name is required",
                              })}
                            />
                            {guestErrors?.fullName?.message && (
                              <p className="text-xs text-destructive">{guestErrors.fullName.message}</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label>Document Type</Label>
                            <Select
                              value={docType ?? ""}
                              onValueChange={(value) =>
                                setValue(`guests.${index}.documentType`, value, {
                                  shouldDirty: true,
                                  shouldTouch: true,
                                  shouldValidate: true,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select document" />
                              </SelectTrigger>
                              <SelectContent>
                                {DOCUMENT_TYPES.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <input
                              type="hidden"
                              {...register(`guests.${index}.documentType` as const, {
                                required: "Document type is required",
                              })}
                            />
                            {guestErrors?.documentType?.message && (
                              <p className="text-xs text-destructive">{guestErrors.documentType.message}</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`guest-doc-${index}`}>Document Number</Label>
                            <Input
                              id={`guest-doc-${index}`}
                              placeholder={docTypeConfig.placeholder}
                              autoComplete="off"
                              {...register(`guests.${index}.documentNumber` as const, {
                                required: "Document number is required",
                              })}
                            />
                            {guestErrors?.documentNumber?.message && (
                              <p className="text-xs text-destructive">{guestErrors.documentNumber.message}</p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Upload Identity Proof</Label>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(event) => handleGuestIdUpload(index, event.target.files?.[0])}
                              className="text-sm"
                            />
                            {docImage ? (
                              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                                <FileCheck2 className="w-4 h-4 text-emerald-500" />
                                Image attached
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                                <Upload className="w-4 h-4" />
                                Accepted formats: JPG, PNG (max 5MB)
                              </span>
                            )}
                          </div>
                          <input
                            type="hidden"
                            {...register(`guests.${index}.documentImageDataUrl` as const, {
                              required: "Identity proof image is required",
                            })}
                          />
                          {guestErrors?.documentImageDataUrl?.message && (
                            <p className="text-xs text-destructive">
                              {guestErrors.documentImageDataUrl.message}
                            </p>
                          )}
                          {docImage && (
                            <div className="rounded-lg border bg-muted/30 p-2 inline-flex items-center gap-3">
                              <img
                                src={docImage}
                                alt={`Guest ${index + 1} document`}
                                className="h-16 w-16 object-cover rounded"
                              />
                              <p className="text-xs text-muted-foreground">
                                Preview of the uploaded document. Ensure details are legible.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        append({
                          fullName: "",
                          documentType: DOCUMENT_TYPES[0].value,
                          documentNumber: "",
                          documentImageDataUrl: "",
                          documentImageName: "",
                          documentImageType: "",
                        })
                      }
                      disabled={fields.length >= MAX_GUESTS}
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Add Guest
                      <span className="ml-2 text-xs text-muted-foreground">
                        {fields.length}/{MAX_GUESTS}
                      </span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-elegant hover:shadow-elegant-selected transition-shadow">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CalendarDays className="w-5 h-5" />
                    Stay Preferences
                  </CardTitle>
                  <CardDescription>
                    Share the expected arrival and any special assistance requests ahead of time.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="expectedArrivalTime">Expected Arrival</Label>
                      <Input
                        id="expectedArrivalTime"
                        type="datetime-local"
                        {...register("expectedArrivalTime")}
                      />
                      <p className="text-xs text-muted-foreground">
                        Helps the front desk prepare the room and welcome amenities.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center justify-between">
                        Special Assistance Needed?
                        <Switch
                          checked={needsAssistance}
                          onCheckedChange={(checked) => setValue("needsSpecialAssistance", checked, { shouldDirty: true })}
                        />
                      </Label>
                      <Textarea
                        placeholder="Describe any mobility, dietary, or medical assistance requirements."
                        disabled={!needsAssistance}
                        {...register("specialAssistanceDetails")}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="otherRequests">Other Requests</Label>
                    <Textarea
                      id="otherRequests"
                      placeholder="Late check-out, floor preference, celebrations, etc."
                      {...register("otherRequests")}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-elegant hover:shadow-elegant-selected transition-shadow">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    Verification & Confirmation
                  </CardTitle>
                  <CardDescription>
                    Upload the necessary documents now. Our reception team will capture signatures during in-person check-in.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3 text-sm text-muted-foreground">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <p>
                      Once you arrive, our reception team will verify the identity proofs, record the
                      physical documents, and collect the guest signature before marking the booking
                      as checked in from their console.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center">
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Ensure all guest details are verified before final submission.
                </div>
                <Button type="submit" size="lg" className="sm:w-auto" disabled={submitLoading}>
                  {submitLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Submit Check-in Details
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckIn;
