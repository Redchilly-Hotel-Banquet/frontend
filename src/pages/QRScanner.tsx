import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, QrCode, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { getGuestSession, saveGuestSession } from "@/lib/guestSession";
import { apiPost, ApiError } from "@/lib/apiClient";

type ValidateLocationResponse =
  | {
      valid: true;
      location: {
        id: string;
        code: string;
        type: string;
        outlet_id?: string;
      };
      outlet?: {
        id: string;
        name?: string;
        location_key?: string;
      } | null;
      booking?: {
        id?: string;
        booking_code?: string;
        status?: string;
        check_out_date?: string;
        guest_name?: string;
      } | null;
    }
  | {
      valid: false;
      message?: string;
    }
  | {
      outlet: Array<{ id: string; location_key?: string }>;
    };

const QRScanner = () => {
  const navigate = useNavigate();
  const [isValid, setIsValid] = useState(true);
  const [searchParams] = useSearchParams();
  
  const roomCode = searchParams.get("room");
  const tableCode = searchParams.get("table");
  const outletId = searchParams.get("outlet");

  useEffect(() => {
    if (!roomCode && !tableCode) return;

    const validateLocation = async () => {
      try {
        const code = roomCode || tableCode;
        const type = roomCode ? 'ROOM' : 'TABLE';

        const data = await apiPost<ValidateLocationResponse, { code: string | null; type: string; outletId: string | null }>(
          "/public/locations/validate",
          { code, type, outletId },
        );

        if (!("valid" in data) || !data.valid) {
          setIsValid(false);
          return;
        }

        const location = data.location;
        const resolvedOutletId = location.outlet_id ?? outletId ?? "";

        const existingSession = getGuestSession();
        const shouldReuseBooking =
          existingSession &&
          existingSession.outletId === resolvedOutletId &&
          existingSession.id === location.id;

        const booking =
          type === "ROOM"
            ? data.booking ?? (shouldReuseBooking ? null : null)
            : undefined;
        if (type === "ROOM" && !booking && !shouldReuseBooking) {
          toast.error("No active booking found");
        }
        const resolvedBookingId = booking?.id || (shouldReuseBooking ? existingSession?.bookingId : undefined);
        const resolvedBookingCode = booking?.booking_code || (shouldReuseBooking ? existingSession?.bookingCode : undefined);
        const resolvedBookingStatus = booking?.status || (shouldReuseBooking ? existingSession?.bookingStatus : undefined);
        const resolvedCheckout = booking?.check_out_date || (shouldReuseBooking ? existingSession?.checkOutDate : undefined);

        const locationInfo = {
          id: location.id,
          code: location.code,
          type: location.type,
          outletId: resolvedOutletId,
          outletName: data.outlet?.name ?? data.outlet?.id ?? resolvedOutletId,
          assignedAt: new Date().toISOString(),
          bookingId: resolvedBookingId,
          bookingCode: resolvedBookingCode,
          bookingStatus: resolvedBookingStatus,
          checkOutDate: resolvedCheckout,
        };

        saveGuestSession(locationInfo);
        
        toast.success(
          booking?.guest_name
            ? `Welcome ${booking.guest_name}! (${location.type === "ROOM" ? "Room" : "Table"} ${location.code})`
            : `Welcome to ${location.type === "ROOM" ? "Room" : "Table"} ${location.code}!`
        );

        setTimeout(() => {
          navigate('/menu');
        }, 1000);
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
            ? error.message
            : "Unable to validate location";
        console.error('Error validating location:', error);
        toast.error(message);
        setIsValid(false);
      }
    };

    validateLocation();
  }, [roomCode, tableCode, outletId, navigate]);

  if (!roomCode && !tableCode) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-2 border-destructive/50">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto" />
            <h2 className="text-2xl font-bold">Invalid QR Code</h2>
            <Alert variant="destructive">
              <AlertDescription>
                This QR code is missing required information. Please scan a valid room or table QR code.
              </AlertDescription>
            </Alert>
            
            <div className="bg-muted rounded-lg p-4 text-left text-sm space-y-2">
              <p className="font-semibold">Valid QR Code Formats:</p>
              <code className="block bg-background p-2 rounded">
                ?room=101
              </code>
              <code className="block bg-background p-2 rounded">
                ?table=A1
              </code>
              <p className="text-muted-foreground text-xs mt-2">
                Example: {window.location.origin}/qr?room=101
              </p>
            </div>
            
            <Button onClick={() => navigate("/")} variant="outline" className="w-full">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-2 shadow-elegant">
        <CardContent className="pt-6 text-center space-y-6">
          <div className="w-20 h-20 rounded-full gradient-primary mx-auto flex items-center justify-center shadow-glow animate-pulse">
            <QrCode className="w-10 h-10 text-white" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">QR Code Scanned!</h2>
            <p className="text-muted-foreground">
              Welcome to Red Chilly
            </p>
          </div>

          <div className="bg-primary/10 rounded-lg p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Your Location</p>
            <p className="text-2xl font-bold text-primary">
              {roomCode ? `Room ${roomCode}` : `Table ${tableCode}`}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading menu...
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default QRScanner;
