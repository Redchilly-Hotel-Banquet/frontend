import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRequireAdminAccess } from "@/hooks/useAdminAccess";
import { apiGet, apiPost, ApiError } from "@/lib/apiClient";

const ManageCategories = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useRequireAdminAccess("admin");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    outlet_id: "",
    sort_order: "0",
    is_active: true
  });

  const { data: categories, isLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      return apiPost('/admin/categories/manage', { action: 'list' }, true);
    }
  });

  const {
    data: validatedOutlet,
    isLoading: isOutletLoading,
    isError: isOutletError,
  } = useQuery({
    queryKey: ["validated-location"],
    queryFn: async () => {
      const data = await apiPost<{ outlet?: Array<{ _id?: string; location_key?: string }> }>(
        "/public/locations/validate",
        {},
      );
      const responseData = (data as any)?.outlet;
      return responseData as [{ _id?: string; location_key?: string }];
    },
  });
  const outlet_ids_list = validatedOutlet && validatedOutlet.length > 0
    ? validatedOutlet.map((o) => o.location_key).filter((location_key): location_key is string => typeof location_key === "string")
    : [];

  const mutation = useMutation({
    mutationFn: async ({ action, data, id }: any) => {
      return apiPost('/admin/categories/manage', { action, data, id }, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      setIsDialogOpen(false);
      setEditingCategory(null);
      resetForm();
      toast.success("Category updated successfully!");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
          ? error.message
          : "Failed to update category";
      toast.error(message);
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      outlet_id: "",
      sort_order: "0",
      is_active: true
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      sort_order: parseInt(formData.sort_order)
    };
    
    if (editingCategory) {
      mutation.mutate({ action: 'update', data: submitData, id: editingCategory._id });
    } else {
      mutation.mutate({ action: 'create', data: submitData });
    }
  };

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || "",
      outlet_id: category.outlet_id || "",
      sort_order: category.sort_order.toString(),
      is_active: category.is_active
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this category?")) {
      mutation.mutate({ action: 'delete', id });
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold">Manage Categories</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-end mb-6">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setEditingCategory(null); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCategory ? "Edit" : "Add"} Category</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label id="outlet_label">Outlet</Label>

                  <Select
                    value={formData.outlet_id || ""}
                    onValueChange={(v) => setFormData({ ...formData, outlet_id: v })}
                    disabled={isOutletLoading || outlet_ids_list.length === 0}
                  >
                    <SelectTrigger aria-labelledby="outlet_label" className="h-10 w-full bg-white">
                      <SelectValue placeholder={isOutletLoading ? "Loading outlets..." : "Select Outlet"} />
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
                          {isOutletLoading ? "Loading..." : "No outlets found"}
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sort_order">Sort Order</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: e.target.value })}
                  />
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
        </div>

        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {categories?.map((category: any) => (
              <Card key={category._id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{category.name}</span>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(category)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(category._id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Order: {category.sort_order} • {category.is_active ? "Active" : "Inactive"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageCategories;
