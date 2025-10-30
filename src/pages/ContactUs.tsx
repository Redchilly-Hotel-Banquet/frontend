import { FC, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, Phone, MapPin, Clock, Send } from "lucide-react";
import logo from "@/assets/red-chilly-logo.jpeg";
import { apiGet } from "@/lib/apiClient";

const NAME = "Arpit Dubey";
const PHONE_DISPLAY = "+91 96701 00139";
const PHONE_TEL = "+919670100139";
const EMAIL = "contact@redchilly.in";

type OutletLocation = {
  id: string;
  location_key: string;
  name?: string;
  address?: string;
  google_maps_url?: string;
  contact_number?: string;
  contact_email?: string;
};

const DEFAULT_ADDRESS = "Red Chilly The Restaurant & Banquet Hall, Near LIC Office, Taramandal, Gorakhpur, Uttar Pradesh 2730016";

const resolveString = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value && typeof value === "object") {
    const maybeOid = (value as { $oid?: unknown }).$oid;
    if (typeof maybeOid === "string") return maybeOid.trim();
    if (typeof (value as { toString?: () => string }).toString === "function") {
      const candidate = (value as { toString: () => string }).toString();
      if (candidate && candidate !== "[object Object]") return candidate;
    }
  }
  return "";
};

const normaliseOutlet = (raw: any): OutletLocation => {
  const id = resolveString(raw?._id ?? raw?.id);
  const locationKey =
    resolveString(raw?.location_key) ||
    resolveString(raw?.code) ||
    resolveString(raw?.outlet_id) ||
    id ||
    "";

  return {
    id: id || locationKey || crypto.randomUUID?.() || Math.random().toString(36).slice(2),
    location_key: locationKey || "unknown-location",
    name:
      typeof raw?.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : typeof raw?.display_name === "string"
        ? raw.display_name.trim()
        : "",
    address:
      typeof raw?.address === "string"
        ? raw.address.trim()
        : typeof raw?.address_line === "string"
        ? raw.address_line.trim()
        : undefined,
    google_maps_url:
      typeof raw?.google_maps_url === "string"
        ? raw.google_maps_url.trim()
        : typeof raw?.map_url === "string"
        ? raw.map_url.trim()
        : typeof raw?.maps_url === "string"
        ? raw.maps_url.trim()
        : undefined,
    contact_number:
      typeof raw?.contact_number === "string"
        ? raw.contact_number.trim()
        : typeof raw?.contact === "string"
        ? raw.contact.trim()
        : typeof raw?.phone === "string"
        ? raw.phone.trim()
        : undefined,
    contact_email:
      typeof raw?.contact_email === "string"
        ? raw.contact_email.trim()
        : typeof raw?.email === "string"
        ? raw.email.trim()
        : undefined,
  };
};

const toMapEmbedSrc = (url: string): string => {
  if (!url) return "";
  const trimmed = url.trim();
  if (/^https:\/\/www\.google\.com\/maps\/embed/i.test(trimmed)) return trimmed;
  if (trimmed.includes("output=embed")) return trimmed;
  const encoded = encodeURIComponent(trimmed);
  return `https://www.google.com/maps?q=${encoded}&output=embed`;
};

const ContactUs: FC = () => {
  const navigate = useNavigate();
  const {
    data: outletsResponse,
    isLoading: isOutletsLoading,
    isError: isOutletsError,
    error: outletsError,
  } = useQuery({
    queryKey: ["contact-outlets"],
    queryFn: async () => {
      return apiGet("/public/outlets");
    },
    staleTime: 60 * 1000,
  });

  const outlets = useMemo<OutletLocation[]>(() => {
    const rawList = Array.isArray((outletsResponse as any)?.outlets)
      ? (outletsResponse as any).outlets
      : Array.isArray(outletsResponse)
      ? outletsResponse
      : [];
    return rawList.map(normaliseOutlet).filter((outlet) => outlet.location_key);
  }, [outletsResponse]);

  const outletsWithMaps = useMemo(
    () =>
      outlets
        .map((outlet) => ({
          ...outlet,
          google_maps_url: outlet.google_maps_url ? toMapEmbedSrc(outlet.google_maps_url) : undefined,
        }))
        .filter((outlet) => outlet.google_maps_url),
    [outlets],
  );

  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent("Inquiry: Red Chilly");
    const body = encodeURIComponent(
      `Hi Red Chilly Team,\n\nI’d like to know more about...\n\nThanks,\n`
    );
    return `mailto:${EMAIL}?subject=${subject}&body=${body}`;
  }, []);

  const whatsappHref = useMemo(
    () => `https://wa.me/${PHONE_TEL.replace("+", "")}`,
    []
  );

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Contact Us</h1>
              <p className="text-sm text-muted-foreground">
                We’d love to hear from you
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 grid gap-6 md:grid-cols-2">
        {/* Left: Contact details */}
        <Card className="shadow-elegant hover:shadow-elegant-selected transition-shadow">
          <CardHeader>
            <CardTitle>Reach Out</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 mt-0.5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <a
                  href={`tel:${PHONE_TEL}`}
                  className="font-semibold hover:underline"
                >
                  {PHONE_DISPLAY}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 mt-0.5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <a
                  href={mailtoHref}
                  className="font-semibold hover:underline break-all"
                >
                  {EMAIL}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 mt-0.5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Our Locations</p>
                {isOutletsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading addresses…</p>
                ) : outlets.length > 0 ? (
                  <div className="mt-2 space-y-3">
                    {outlets.map((outlet) => (
                      <div key={outlet.id} className="rounded-md border border-border/60 bg-muted/40 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">
                            {outlet.name || outlet.location_key}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {outlet.location_key}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {outlet.address || DEFAULT_ADDRESS}
                        </p>
                        {(outlet.contact_number || outlet.contact_email) && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {outlet.contact_number && (
                              <span>
                                Phone: <span className="font-medium">{outlet.contact_number}</span>
                              </span>
                            )}
                            {outlet.contact_number && outlet.contact_email && " • "}
                            {outlet.contact_email && (
                              <span>
                                Email: <span className="font-medium">{outlet.contact_email}</span>
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : isOutletsError ? (
                  <p className="text-sm text-red-600">
                    {(outletsError as Error)?.message ?? "Failed to load locations."}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Location details will be available shortly.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 mt-0.5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Hours</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  <Badge variant="outline">Mon–Sun</Badge>
                  <Badge variant="secondary">9:00 AM – 10:00 PM</Badge>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap gap-3">
              <Button asChild className="gradient-primary shadow-elegant">
                <a href={mailtoHref}>
                  <Mail className="w-4 h-4 mr-2" />
                  Send Email
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  <Phone className="w-4 h-4 mr-2" />
                  WhatsApp
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right: Quick message form (client-side only; opens mail client) */}
        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle>Quick Message</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                // Basic client-side mailto submit using current field values
                const form = e.currentTarget as HTMLFormElement;
                const fd = new FormData(form);
                const name = (fd.get("name") as string) || "";
                const phone = (fd.get("phone") as string) || "";
                const message = (fd.get("message") as string) || "";
                const subject = encodeURIComponent(
                  `New inquiry from ${name || "Guest"}`
                );
                const body = encodeURIComponent(
                  `Name: ${name}\nPhone: ${phone}\n\nMessage:\n${message}\n`
                );
                window.location.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`;
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-muted-foreground">Your Name</label>
                  <Input name="name" placeholder="John Doe" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Phone</label>
                  <Input name="phone" placeholder="+91 9XXXXXXXXX" />
                </div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">Message</label>
                <Textarea
                  name="message"
                  placeholder="How can we help you?"
                  rows={5}
                />
              </div>

              <Button type="submit" className="gradient-accent shadow-elegant">
                <Send className="w-4 h-4 mr-2" />
                Send Message
              </Button>
            </form>
          </CardContent>
        </Card>
        
        {/* Map */}
        <div className="container mx-auto px-2 py-6 md:col-span-2">
          {isOutletsLoading ? (
            <p className="text-sm text-muted-foreground">Loading maps…</p>
          ) : outletsWithMaps.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {outletsWithMaps.map((outlet) => (
                <Card key={`map-${outlet.id}`} className="shadow-elegant">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">
                      {outlet.name || `Location: ${outlet.location_key}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <iframe
                      title={`Map for ${outlet.name || outlet.location_key}`}
                      className="w-full h-64 md:h-96 rounded-b-xl"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={outlet.google_maps_url}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : isOutletsError ? (
            <Card className="shadow-elegant">
              <CardContent className="p-6 text-sm text-red-600">
                {(outletsError as Error)?.message ?? "Failed to load location maps."}
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-elegant">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Map links will appear here once locations are updated.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactUs;
