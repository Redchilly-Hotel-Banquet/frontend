export type AdminUser = {
  id: string;
  name: string;
  roles: string[];
  outlets: string[];
};

const TOKEN_KEY = "adminJwt";
const USER_KEY = "adminUser";

type StoragePair = {
  session: Storage | null;
  local: Storage | null;
};

const getStorages = (): StoragePair => {
  if (typeof window === "undefined") return { session: null, local: null };
  return {
    session: window.sessionStorage ?? null,
    local: window.localStorage ?? null,
  };
};

const writeSafely = (storage: Storage | null, key: string, value: string) => {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    /* no-op */
  }
};

const removeSafely = (storage: Storage | null, key: string) => {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* no-op */
  }
};

const readSafely = (storage: Storage | null, key: string): string | null => {
  if (!storage) return null;
  try {
    const value = storage.getItem(key);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
};

export const saveAdminSession = (token: string, user: AdminUser) => {
  const { session, local } = getStorages();
  const serialisedUser = JSON.stringify(user);
  writeSafely(session, TOKEN_KEY, token);
  writeSafely(local, TOKEN_KEY, token);
  writeSafely(session, USER_KEY, serialisedUser);
  writeSafely(local, USER_KEY, serialisedUser);
};

export const clearAdminSession = () => {
  const { session, local } = getStorages();
  removeSafely(session, TOKEN_KEY);
  removeSafely(local, TOKEN_KEY);
  removeSafely(session, USER_KEY);
  removeSafely(local, USER_KEY);
};

export const getAdminToken = (): string | null => {
  const { session, local } = getStorages();
  const fromSession = readSafely(session, TOKEN_KEY);
  if (fromSession) return fromSession;

  const fromLocal = readSafely(local, TOKEN_KEY);
  if (fromLocal) {
    writeSafely(session, TOKEN_KEY, fromLocal);
  }
  return fromLocal;
};

export const getAdminUser = (): AdminUser | null => {
  const { session, local } = getStorages();
  const rawSession = readSafely(session, USER_KEY);
  const rawLocal = rawSession ?? readSafely(local, USER_KEY);
  if (!rawLocal) return null;
  try {
    const parsed = JSON.parse(rawLocal);
    if (!parsed || typeof parsed !== "object") return null;
    const roles = Array.isArray(parsed.roles)
      ? parsed.roles
          .map((role: unknown) => (typeof role === "string" ? role.trim() : null))
          .filter((role): role is string => Boolean(role))
      : [];
    const outlets = Array.isArray(parsed.outlets)
      ? parsed.outlets
          .map((entry: unknown) => (typeof entry === "string" ? entry.trim() : null))
          .filter((entry): entry is string => Boolean(entry))
      : [];
    const normalised: AdminUser = {
      id: typeof parsed.id === "string" ? parsed.id : "",
      name: typeof parsed.name === "string" ? parsed.name : "Admin",
      roles: roles.length > 0 ? roles : ["admin"],
      outlets: outlets.length > 0 ? outlets : ["all"],
    };
    const { session } = getStorages();
    const serialised = JSON.stringify(normalised);
    const token = getAdminToken();
    if (token) writeSafely(session, TOKEN_KEY, token);
    writeSafely(session, USER_KEY, serialised);
    return normalised;
  } catch {
    return null;
  }
};

export const isAdminAuthenticated = () => Boolean(getAdminToken());
