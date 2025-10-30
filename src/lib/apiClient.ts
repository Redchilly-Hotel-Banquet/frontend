import { clearAdminSession, getAdminToken } from "./authSession";

const detectApiBase = (): string => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    const fallbackPort =
      port && port !== "5173" && port !== "4173"
        ? port
        : "4000";
    return `${protocol}//${hostname}:${fallbackPort}/api`;
  }

  return "http://127.0.0.1:4000/api";
};

const API_BASE_URL = detectApiBase();

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type RequestOptions<TBody> = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: TBody;
  auth?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
};

const buildUrl = (path: string) => {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalised}`;
};

const buildHeaders = (
  auth: boolean,
  extra?: Record<string, string>,
): HeadersInit => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extra ?? {}),
  };

  if (auth) {
    const token = getAdminToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return headers;
};

const parseResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const apiRequest = async <TResponse, TBody = unknown>(
  path: string,
  options: RequestOptions<TBody> = {},
): Promise<TResponse> => {
  const {
    method = "POST",
    body,
    auth = false,
    signal,
    headers,
    credentials = "omit",
  } = options;
  const response = await fetch(buildUrl(path), {
    method,
    headers: buildHeaders(auth, headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
    credentials,
  });

  const parsed = await parseResponse(response);
  if (!response.ok) {
    if (response.status === 401 && auth) {
      clearAdminSession();
    }
    const message =
      typeof parsed === "object" && parsed && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : response.statusText || "Request failed";
    throw new ApiError(response.status, message, parsed);
  }

  return parsed as TResponse;
};

export const apiGet = async <TResponse>(path: string, auth = false) => {
  return apiRequest<TResponse>(path, { method: "GET", auth });
};

export const apiPost = async <TResponse, TBody = unknown>(
  path: string,
  body?: TBody,
  auth = false,
) => {
  return apiRequest<TResponse, TBody>(path, { method: "POST", body, auth });
};
