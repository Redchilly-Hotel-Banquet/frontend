import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import Index from "./pages/Index";
import Menu from "./pages/Menu";
import Checkout from "./pages/Checkout";
import OrderStatus from "./pages/OrderStatus";
import BookRoom from "./pages/BookRoom";
import QRScanner from "./pages/QRScanner";
import AdminLogin from "./pages/admin/AdminLogin";
import Dashboard from "./pages/admin/Dashboard";
import ManageRooms from "./pages/admin/ManageRooms";
import ManageMenuItems from "./pages/admin/ManageMenuItems";
import ManageCategories from "./pages/admin/ManageCategories";
import ManageOrders from "./pages/admin/ManageOrders";
import ManageBookings from "./pages/admin/ManageBookings";
import ManageBranches from "./pages/admin/ManageBranches.tsx";
import Analytics from "./pages/admin/Analytics";
import NotFound from "./pages/NotFound";
import ContactUs from "./pages/ContactUs";
import BanquetEnquiry from "./pages/BanquetEnquiry";
import GuestOrders from "./pages/GuestOrders";
import CheckIn from "./pages/CheckIn";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ThemeToggle />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/qr" element={<QRScanner />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/banquet" element={<BanquetEnquiry />} />
          <Route path="/check-in" element={<CheckIn />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/contact-us" element={<ContactUs />} />
          <Route path="/order-status/:orderId" element={<OrderStatus />} />
          <Route path="/my-orders" element={<GuestOrders />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<Dashboard />} />
          <Route path="/admin/rooms" element={<ManageRooms />} />
          <Route path="/admin/menu-items" element={<ManageMenuItems />} />
          <Route path="/admin/categories" element={<ManageCategories />} />
          <Route path="/admin/orders" element={<ManageOrders />} />
          <Route path="/admin/bookings" element={<ManageBookings />} />
          <Route path="/admin/analytics" element={<Analytics />} />
          <Route path="/admin/branches" element={<ManageBranches />} />
          <Route path="/book-room" element={<BookRoom />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
