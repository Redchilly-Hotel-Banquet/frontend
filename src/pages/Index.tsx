import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  QrCode,
  Smartphone,
  Clock,
  CheckCircle2,
  Utensils,
  Bed,
  Hotel,
  PartyPopper,
  ShieldCheck,
  Star,
  Users,
  MapPin,
  CalendarDays,
  X,
} from "lucide-react";
import logo from "@/assets/red-chilly-logo.jpeg";
import { getGuestSession } from "@/lib/guestSession";

const Index = () => {
  const [showBookingBanner, setShowBookingBanner] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return sessionStorage.getItem("hideBookingBanner") !== "true";
    } catch {
      return true;
    }
  });
  const [hasGuestSession, setHasGuestSession] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const session = getGuestSession();
    return Boolean(session?.bookingId);
  });

  const handleDismissBookingBanner = () => {
    setShowBookingBanner(false);
    try {
      sessionStorage.setItem("hideBookingBanner", "true");
    } catch {
      /* no-op */
    }
  };

  useEffect(() => {
    const syncSession = () => {
      const session = getGuestSession();
      setHasGuestSession(Boolean(session?.bookingId));
    };
    syncSession();
    if (typeof window !== "undefined") {
      window.addEventListener("storage", syncSession);
      window.addEventListener("focus", syncSession);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", syncSession);
        window.removeEventListener("focus", syncSession);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HERO */}
      <section className="relative isolate overflow-hidden">
        {/* background media/texture */}
        <div className="absolute inset-0 -z-10">
          {/* drop your cover image/video in CSS as bg-[url('...')] or keep gradient */}
          <div className="h-full w-full bg-gradient-to-br from-primary/15 via-transparent to-accent/20" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,_rgba(255,255,255,.5),_transparent_40%),_radial-gradient(circle_at_90%_10%,_rgba(255,255,255,.4),_transparent_35%)] pointer-events-none" />
        </div>

        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="max-w-5xl mx-auto text-center">
            <div className="flex justify-center mb-8">
              <img 
                src={logo} 
                alt="Red Chilly The Restaurant Logo" 
                className="w-48 h-48 md:w-64 md:h-64 object-contain"
              />
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
              <Hotel className="w-4 h-4" />
              <span className="text-sm font-medium">Hotel · Restaurant · Banquet Hall</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-extrabold mb-4 leading-[1.05] tracking-tight">
              Red Chilly — Hotel, Restaurant &amp; Banquet
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Premium rooms, authentic cuisine, and a modern banquet experience in Gorakhpur.
              Book in seconds. Order by QR. Relax like you mean it.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" className="gradient-accent shadow-elegant hover:scale-[1.02] transition-transform" asChild>
                <Link to="/book-room">
                  <Bed className="w-5 h-5 mr-2" />
                  Book a Room
                </Link>
              </Button>
              <Button size="lg" variant="secondary" className="shadow-elegant hover:scale-[1.02] transition-transform" asChild>
                <Link to="/check-in">
                  <ShieldCheck className="w-5 h-5 mr-2" />
                  Guest Check-in
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10" asChild>
                <Link to="/menu">
                  <Utensils className="w-5 h-5 mr-2" />
                  Explore Menu
                </Link>
              </Button>
              <Button size="lg" className="gradient-primary shadow-elegant hover:scale-[1.02] transition-transform" asChild>
                <Link to="/banquet">
                  <PartyPopper className="w-5 h-5 mr-2" />
                  Banquet Enquiry
                </Link>
              </Button>
              {/* {hasGuestSession && (
                <Button size="lg" variant="secondary" className="shadow-elegant hover:scale-[1.02] transition-transform" asChild>
                  <Link to="/my-orders">
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    View Orders
                  </Link>
                </Button>
              )} */}
            </div>

            {/* trust row */}
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
              <div className="flex items-center justify-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" />
                <span>4.8/5 Guest Rating</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Hygiene First</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span>Events up to 500+</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <MapPin className="w-4 h-4 text-rose-600" />
                <span>Prime Gorakhpur</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VALUE STRIP */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-background border flex items-center justify-center">
                <Bed className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Luxury Rooms</p>
                <p className="text-xs text-muted-foreground">King/Twin · 24/7 Service</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-background border flex items-center justify-center">
                <Utensils className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Authentic Cuisine</p>
                <p className="text-xs text-muted-foreground">North Indian · Continental</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-background border flex items-center justify-center">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">QR Ordering</p>
                <p className="text-xs text-muted-foreground">In-room &amp; Table</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-background border flex items-center justify-center">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Banquet Ready</p>
                <p className="text-xs text-muted-foreground">Weddings · Corporate</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Hotel &amp; Restaurant Services</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Red Chilly blends stay, taste and celebration—without friction.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <Card className="border-2 hover:border-primary/50 hover:shadow-elegant transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                    <Bed className="w-5 h-5 text-white" />
                  </div>
                  Luxury Rooms
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-muted-foreground">
                Spacious rooms, plush bedding, fast Wi-Fi, and concierge-on-call.
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/50 hover:shadow-elegant transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg gradient-accent flex items-center justify-center">
                    <Utensils className="w-5 h-5 text-white" />
                  </div>
                  Authentic Cuisine
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-muted-foreground">
                From signature kebabs to comfort classics—crafted by chefs, served hot.
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/50 hover:shadow-elegant transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                    <QrCode className="w-5 h-5 text-white" />
                  </div>
                  QR Code Ordering
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-muted-foreground">
                Scan. Browse. Order. Track status in real-time from bed or table.
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/50 hover:shadow-elegant transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  Real-Time Updates
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-muted-foreground">
                Live order progress, ETA, and delivery alerts without the guesswork.
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/50 hover:shadow-elegant transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg gradient-accent flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-white" />
                  </div>
                  Easy Booking
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-muted-foreground">
                Availability in seconds. Instant confirmation. Zero friction.
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/50 hover:shadow-elegant transition">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  </div>
                  24/7 Service
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-muted-foreground">
                Night or noon—we’re around. Housekeeping, room service, support.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* BANQUET HIGHLIGHT */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="order-2 md:order-1">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">The Banquet, Upgraded</h2>
              <p className="text-muted-foreground mb-6">
                Weddings, sangeet, corporate offsites, or a 50th that actually feels like one—
                our banquet halls scale with your guest list and your vision.
              </p>
              <ul className="text-sm text-muted-foreground space-y-2 mb-6">
                <li>• Configurable halls · 200–500+ guests</li>
                <li>• Decor &amp; AV partners on request</li>
                <li>• Curated set menus &amp; live counters</li>
                <li>• Dedicated event coordinator</li>
              </ul>
              <div className="flex gap-3">
                <Button className="gradient-primary" asChild>
                  <Link to="/banquet">Enquire Now</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/gallery">View Gallery</Link>
                </Button>
              </div>
            </div>

            {/* image mosaic placeholder — replace bg images via CSS for production */}
            <div className="order-1 md:order-2 grid grid-cols-3 gap-2 h-64 md:h-80">
              <div className="col-span-2 rounded-xl bg-card border shadow-sm" />
              <div className="rounded-xl bg-card border shadow-sm" />
              <div className="rounded-xl bg-card border shadow-sm" />
              <div className="col-span-2 rounded-xl bg-card border shadow-sm" />
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS / SOCIAL PROOF */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Guests Who Stayed, Stayed Happy</h2>
            <p className="text-muted-foreground">A few kind words (we’re blushing).</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              {
                quote:
                  "Seamless check-in, spotless rooms, and the food… unreal. QR ordering spoiled us.",
                name: "Ananya S.",
              },
              {
                quote:
                  "Hosted our engagement here. Team handled decor, AV, everything. Guests still talk about the dessert.",
                name: "Rahul & Neha",
              },
              {
                quote:
                  "Work trip turned staycation—wifi was fast, bed was faster to put me to sleep.",
                name: "Dev K.",
              },
            ].map((t, i) => (
              <Card key={i} className="border-2">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-1 text-yellow-500 mb-2">
                    <Star className="w-4 h-4" />
                    <Star className="w-4 h-4" />
                    <Star className="w-4 h-4" />
                    <Star className="w-4 h-4" />
                    <Star className="w-4 h-4" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">“{t.quote}”</p>
                  <p className="text-sm font-semibold">{t.name}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Your Journey at Red Chilly</h2>
          </div>

          <div className="max-w-5xl mx-auto grid md:grid-cols-4 gap-8">
            {[
              { step: 1, title: "Book Your Room", text: "Pick a room. Instant confirmation." },
              { step: 2, title: "Check In", text: "Warm welcome. Minimal paperwork." },
              { step: 3, title: "Order Food", text: "Scan QR · track live · devour." },
              { step: 4, title: "Relax & Enjoy", text: "Sleep better. Celebrate harder." },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-16 h-16 rounded-full gradient-primary mx-auto mb-4 flex items-center justify-center text-2xl font-bold text-white shadow-elegant">
                  {s.step}
                </div>
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BIG CTA */}
      <section className="py-16 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 gradient-hero opacity-10" />
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Experience Red Chilly?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Book your room or plan your event—our team will make it effortless.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" className="gradient-accent shadow-elegant hover:scale-[1.02]" asChild>
                <Link to="/book-room">
                  <Bed className="w-5 h-5 mr-2" />
                  Book a Room
                </Link>
              </Button>
              <Button size="lg" className="gradient-primary shadow-elegant hover:scale-[1.02]" asChild>
                <Link to="/banquet">
                  <PartyPopper className="w-5 h-5 mr-2" />
                  Plan a Banquet
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10" asChild>
                <Link to="/menu">
                  <Utensils className="w-5 h-5 mr-2" />
                  Browse Menu
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* STICKY BOOK NOW BAR */}
      {showBookingBanner && (
        <div className="fixed bottom-4 inset-x-0 z-50 px-4">
          <div className="relative mx-auto max-w-3xl rounded-2xl border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-elegant px-4 py-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleDismissBookingBanner}
              className="absolute -top-2 -right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-foreground"
              aria-label="Dismiss booking window announcement"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="text-sm">
              <p className="font-semibold">Booking window is open</p>
              <p className="text-xs text-muted-foreground">Best rates here. No hidden fees.</p>
            </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gradient-accent" asChild>
              <Link to="/book-room">Book Room</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/banquet">Banquet Enquiry</Link>
            </Button>
            {/* {hasGuestSession && (
              <Button size="sm" variant="secondary" asChild>
                <Link to="/my-orders">View Orders</Link>
              </Button>
            )} */}
          </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="border-t py-10 mt-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-6">
            <img 
              src={logo} 
              alt="Red Chilly Logo" 
              className="w-32 h-32 object-contain"
            />
            <p className="text-center font-semibold text-lg">
              Red Chilly — Hotel, Restaurant &amp; Banquet
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 text-sm text-muted-foreground text-center">
              {/* contact us */}
              <a href="tel:+919670100139" className="hover:text-primary transition-colors">📞 +919670100139</a>
              <a href="mailto:contact@redchilly.in" className="hover:text-primary transition-colors">📧 contact@redchilly.in</a>
              <a href="/contact-us" className="hover:text-primary transition-colors">✉️ Contact Us</a>
              <a
                href="https://maps.app.goo.gl/2ANi6DCyhbmoGMVX6"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                📍 Red Chilly, Gorakhpur
              </a>
              <a
                href="https://maps.app.goo.gl/jcZes6U59fq7ybmM7"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                📍 Red Chilly 2.0, Gorakhpur
              </a>
            </div>
            <div className="flex gap-4 text-sm">
              <Link to="/gallery" className="text-muted-foreground hover:text-primary transition-colors">
                Gallery
              </Link>
              <Link to="/banquet" className="text-muted-foreground hover:text-primary transition-colors">
                Banquet
              </Link>
              <Link to="/menu" className="text-muted-foreground hover:text-primary transition-colors">
                Menu
              </Link>
              <Link to="/book-room" className="text-muted-foreground hover:text-primary transition-colors">
                Book Room
              </Link>
            </div>
            <p className="text-center text-muted-foreground text-xs">
              © {new Date().getFullYear()} <a href="https://satyamanand.in" target="_blank">Red Chilly</a>. All rights reserved.
            </p>
            <Link
              to="/admin/login"
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Admin Access
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
