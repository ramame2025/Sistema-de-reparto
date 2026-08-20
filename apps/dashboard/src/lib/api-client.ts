import { API_URL } from "./config";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`API ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type ApiClient = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
  remove: (path: string) => Promise<void>;
};

/**
 * Unico lugar donde el dashboard habla con la API: adjunta el bearer token,
 * traduce cualquier respuesta no-OK en `ApiError` y avisa al manejador de
 * sesion para que un 401/403 devuelva al login.
 */
export function createApiClient(
  token: string | null,
  onAuthFailure: (response: Response) => void,
): ApiClient {
  const request = async <T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
  ): Promise<T> => {
    if (!token) {
      throw new ApiError(401);
    }

    const hasBody = body !== undefined;
    const response = await fetch(`${API_URL}${path}`, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      onAuthFailure(response);
      throw new ApiError(response.status);
    }

    // Los 204 (baja de usuario, cambio de password) no traen cuerpo que parsear.
    const text = await response.text();
    return (text.length > 0 ? JSON.parse(text) : undefined) as T;
  };

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    patch: (path, body) => request("PATCH", path, body),
    remove: async (path) => {
      await request("DELETE", path);
    },
  };
}

/** Los comprobantes llegan como URL absoluta o como path servido por la API. */
export function resolveReceiptUrl(receiptRef?: string) {
  if (!receiptRef) {
    return null;
  }

  if (receiptRef.startsWith("http://") || receiptRef.startsWith("https://")) {
    return receiptRef;
  }

  if (receiptRef.startsWith("/")) {
    return `${API_URL}${receiptRef}`;
  }

  return null;
}
