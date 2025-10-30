import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Utensils, 
  FolderKanban, 
  Hotel, 
  ShoppingCart,
  LogOut,
  Calendar,
  BarChart3
} from "lucide-react";
import { getAdminScopes, hasAdminScope, useRequireAdminAccess } from "@/hooks/useAdminAccess";
import type { AdminScope } from "@/hooks/useAdminAccess";
import { clearAdminSession } from "@/lib/authSession";

const Dashboard = () => {
  const navigate = useNavigate();

  useRequireAdminAccess(["admin", "rooms", "kitchen"]);

  const handleLogout = () => {
    clearAdminSession();
    navigate("/admin/login");
  };

  const adminSections = [
    {
      title: "Manage Orders",
      description: "View and update order status",
      icon: ShoppingCart,
      link: "/admin/orders",
      color: "bg-blue-500",
      requiredScopes: ["kitchen"] as AdminScope[],
    },
    {
      title: "Manage Menu Items",
      description: "Add, edit, or remove menu items",
      icon: Utensils,
      link: "/admin/menu-items",
      color: "bg-green-500",
      requiredScopes: ["kitchen"] as AdminScope[],
    },
    {
      title: "Manage Categories",
      description: "Organize menu categories",
      icon: FolderKanban,
      link: "/admin/categories",
      color: "bg-purple-500",
      requiredScopes: ["admin"] as AdminScope[],
    },
    {
      title: "Manage Rooms/Tables",
      description: "Add or edit room and table details",
      icon: Hotel,
      link: "/admin/rooms",
      color: "bg-orange-500",
      requiredScopes: ["rooms"] as AdminScope[],
    },
    {
      title: "Manage Bookings",
      description: "View and manage hotel bookings",
      icon: Calendar,
      link: "/admin/bookings",
      color: "bg-pink-500",
      requiredScopes: ["rooms"] as AdminScope[],
    },
    {
      title: "Analytics",
      description: "View branch-wise analytics",
      icon: BarChart3,
      link: "/admin/analytics",
      color: "bg-cyan-500",
      requiredScopes: ["admin"] as AdminScope[],
    },
    {
      title: "Manage Branches",
      description: "Add or edit branch details",
      icon: LayoutDashboard,
      link: "/admin/branches",
      color: "bg-red-500",
      requiredScopes: ["admin"] as AdminScope[],
    }
  ];

  const scopes = getAdminScopes();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
          {adminSections
            .filter((section) => hasAdminScope(scopes, section.requiredScopes))
            .map((section) => {
            const Icon = section.icon;
            return (
              <Link key={section.title} to={section.link}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full hover:shadow-elegant-selected shadow-elegant">
                  <CardHeader>
                    <div className={`w-12 h-12 ${section.color} rounded-lg flex items-center justify-center mb-4`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <CardTitle>{section.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{section.description}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
