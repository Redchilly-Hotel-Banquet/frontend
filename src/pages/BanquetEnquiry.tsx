import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Users,
  IndianRupee,
  Clock,
  Mail,
  Phone,
  User2,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/red-chilly-logo.jpeg";
import { apiPost } from "@/lib/apiClient";

type OutletResp = {
  outlet: { _id: string; location_key: string }[];
};

const EMAIL = "contact@redchilly.in";

const BanquetEnquiry = () => {
  const navigate = useNavigate();

  // Fetch branches from edge function (no body required)
  const { data, isLoading, isError, error } = useQuery<OutletResp>({
    queryKey: ["banquet-outlets"],
    queryFn: async () => {
      return apiPost<OutletResp, Record<string, never>>("/public/locations/validate", {});
    },
    staleTime: 10 * 60 * 1000,
    retry: (c) => c < 2,
  });

  const branches = useMemo(() => data?.outlet ?? [], [data]);

  // Form state
  const [branchKey, setBranchKey] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [guests, setGuests] = useState("");
  const [budget, setBudget] = useState("");
  const [occasion, setOccasion] = useState("");
  const [notes, setNotes] = useState("");

  // Auto-select first branch when loaded
  useEffect(() => {
    if (!branchKey && branches.length > 0) {
      setBranchKey(branches[0].location_key);
    }
  }, [branches, branchKey]);

  const disabled =
    !branchKey || !name.trim() || !phone.trim() || !date.trim() || !guests.trim();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) {
      toast.info("Please fill required fields: Branch, Name, Phone, Date, Guests.");
      return;
    }

    const subject = encodeURIComponent(`Banquet enquiry – ${branchKey}`);
    const lines = [
      `Branch (location_key): ${branchKey}`,
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Email: ${email || "-"}`,
      `Occasion: ${occasion || "-"}`,
      `Date: ${date}`,
      `Preferred Time: ${timeSlot || "-"}`,
      `Guests: ${guests}`,
      `Budget (INR): ${budget || "-"}`,
      "",
      "Notes:",
      notes || "-",
      "",
      "— Sent from redchilly.in",
    ];

    const body = encodeURIComponent(lines.join("\n"));
    window.location.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img 
              src={logo} 
              alt="Red Chilly Logo" 
              className="w-12 h-12 object-contain"
            />
            <div>
              <h1 className="text-xl font-bold">Banquet Hall Enquiry</h1>
              <p className="text-sm text-muted-foreground">Tell us about your event</p>
            </div>
          </div>
        </div>
      </header>

      {/* Entire page is a single form so the submit can live under Contact Details */}
      <form onSubmit={onSubmit}>
        {/* Content */}
        <div className="container mx-auto px-4 py-6 grid gap-6 lg:grid-cols-2">
          {/* Left: Branch & Event Details */}
          <Card className="shadow-elegant hover:shadow-elegant-selected transition-shadow">
            <CardHeader>
              <CardTitle>Event Details</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && <p>Loading branches…</p>}
              {isError && (
                <p className="text-red-500">
                  {(error as any)?.message || "Failed to load branches."}
                </p>
              )}

              <div className="space-y-4">
                {/* Branch */}
                <div>
                  <label className="text-sm text-muted-foreground flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Select Branch <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={branchKey}
                    onChange={(e) => setBranchKey(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                    disabled={isLoading || branches.length === 0}
                  >
                    {branches.map((b) => (
                      <option key={b._id} value={b.location_key}>
                        {b.location_key}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Occasion */}
                <div>
                  <label className="text-sm text-muted-foreground">Occasion</label>
                  <Input
                    placeholder="Wedding / Reception / Birthday / Corporate / Other"
                    value={occasion}
                    onChange={(e) => setOccasion(e.target.value)}
                  />
                </div>

                {/* Date & Time */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm text-muted-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Date <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Preferred Time
                    </label>
                    <Input
                      placeholder="e.g., 11 AM – 3 PM"
                      value={timeSlot}
                      onChange={(e) => setTimeSlot(e.target.value)}
                    />
                  </div>
                </div>

                {/* Guests & Budget */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm text-muted-foreground flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Guests <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="e.g., 150"
                      value={guests}
                      onChange={(e) => setGuests(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground flex items-center gap-2">
                      <IndianRupee className="w-4 h-4" />
                      Approx. Budget (INR)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="e.g., 200000"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-sm text-muted-foreground">Notes</label>
                  <Textarea
                    placeholder="Theme, cuisine preferences, AV setup, decorations, special requests…"
                    rows={5}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right: Contact Info + Submit */}
          <Card className="shadow-elegant hover:shadow-elegant-selected transition-shadow">
            <CardHeader>
              <CardTitle>Your Contact Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <User2 className="w-4 h-4" />
                  Full Name <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Phone <span className="text-red-500">*</span>
                </label>
                <Input
                  inputMode="tel"
                  placeholder="+91 9XXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="text-xs text-muted-foreground">
                We’ll use these details to get back to you with availability and packages.
              </div>
            </CardContent>

            {/* Submit moved here */}
            <CardFooter>
              <Button
                type="submit"
                className="w-full gradient-primary shadow-elegant"
                disabled={disabled || isLoading || branches.length === 0}
                title={disabled ? "Fill required fields" : ""}
              >
                <Send className="w-4 h-4 mr-2" />
                Send Enquiry (mentions branch: {branchKey || "—"})
              </Button>
            </CardFooter>
          </Card>
        </div>
      </form>
    </div>
  );
};

export default BanquetEnquiry;
