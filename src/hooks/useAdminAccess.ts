import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AdminUser,
  clearAdminSession,
  getAdminToken,
  getAdminUser,
} from "@/lib/authSession";

export type AdminScope = "admin" | "rooms" | "kitchen";

const SCOPES: AdminScope[] = ["admin", "rooms", "kitchen"];

const normaliseOutletId = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const normaliseScopes = (user: AdminUser | null): AdminScope[] => {
  if (!user) return [];
  return user.roles
    .map((role) => role.trim().toLowerCase())
    .filter((role): role is AdminScope => (SCOPES as string[]).includes(role));
};

export const getAdminScopes = (): AdminScope[] => {
  return normaliseScopes(getAdminUser());
};

export const hasAdminScope = (
  scopes: AdminScope[],
  required: AdminScope | AdminScope[],
): boolean => {
  const list = Array.isArray(required) ? required : [required];
  if (scopes.includes("admin")) return true;
  return list.some((scope) => scopes.includes(scope));
};

export const getAdminOutlets = (): string[] => {
  const user = getAdminUser();
  if (!user || !Array.isArray(user.outlets) || user.outlets.length === 0) {
    return ["all"];
  }
  const cleaned = user.outlets
    .map((entry) => (typeof entry === "string" ? entry.trim() : null))
    .filter((entry): entry is string => Boolean(entry));
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : ["all"];
};

export const hasOutletAccess = (allowedOutlets: string[], outletId?: string | null) => {
  const normalisedAllowed = new Set(allowedOutlets.map(normaliseOutletId));
  if (normalisedAllowed.has("all")) return true;
  const normalisedOutlet = normaliseOutletId(outletId ?? "");
  if (!normalisedOutlet) return normalisedAllowed.size === 0;
  return normalisedAllowed.has(normalisedOutlet);
};

export const useRequireAdminAccess = (required: AdminScope | AdminScope[]) => {
  const navigate = useNavigate();
  const depsKey = Array.isArray(required) ? required.join(",") : required;

  useEffect(() => {
    const requirement = Array.isArray(required) ? required : [required];
    const token = getAdminToken();
    const user = getAdminUser();

    if (!token || !user) {
      clearAdminSession();
      navigate("/admin/login", { replace: true });
      return;
    }

    const scopes = getAdminScopes();
    if (!hasAdminScope(scopes, requirement)) {
      toast.error("You do not have permission to view this section.");
      navigate("/admin/dashboard", { replace: true });
    }
  }, [navigate, depsKey]);
};
