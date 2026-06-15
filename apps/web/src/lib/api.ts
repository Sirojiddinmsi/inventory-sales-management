const API_URL = import.meta.env.VITE_API_URL ?? "/api/v1";
const TOKEN_KEY = "inventory.auth.token";

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function queryString(params?: Record<string, unknown>) {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const result = search.toString();
  return result ? `?${result}` : "";
}

export async function api<T>(
  path: string,
  options: RequestInit & { params?: Record<string, unknown> } = {}
): Promise<T> {
  const { params, headers, ...requestOptions } = options;
  const token = getToken();
  const isFormData = requestOptions.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}${queryString(params)}`, {
    ...requestOptions,
    headers: {
      ...(requestOptions.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  });

  if (response.status === 401 && token) {
    clearToken();
    window.dispatchEvent(new Event("auth:unauthorized"));
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(
      response.status,
      body.error?.message ?? "Server bilan bog‘lanishda xatolik",
      body.error?.code,
      body.error?.details
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function download(path: string, filename: string, params?: Record<string, unknown>) {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}${queryString(params)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) throw new ApiError(response.status, "Faylni yuklab bo‘lmadi");

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadPost(
  path: string,
  filename: string,
  body: Record<string, unknown>
) {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(
      response.status,
      errorBody.error?.message ?? "Faylni yuklab bo'lmadi",
      errorBody.error?.code,
      errorBody.error?.details
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
