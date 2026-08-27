import { API_URL } from './config';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /**
     * Cuerpo de error ya parseado, cuando la respuesta trajo JSON. El 409 de
     * POST /customers pone ahi el cliente en conflicto, para poder ofrecerlo
     * en vez de mostrar un error y nada mas.
     */
    public body?: unknown,
  ) {
    super(message);
  }
}

export type ApiClient = {
  get<T>(path: string, opts?: { auth?: boolean; cache?: RequestCache }): Promise<T>;
  post<T>(path: string, body: unknown, opts?: { auth?: boolean }): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  postForm<T>(path: string, form: FormData): Promise<T>;
};

const buildAuthHeader = (
  getToken: () => string | null,
  auth: boolean,
): Record<string, string> => {
  if (!auth) {
    return {};
  }

  const token = getToken();
  if (!token) {
    throw new ApiError(401, 'auth required');
  }

  return { Authorization: `Bearer ${token}` };
};

/**
 * Nest serializa sus excepciones como JSON. Sin parsearlo, ese JSON crudo
 * termina siendo el `message` -- y las pantallas lo muestran tal cual al
 * chofer, que se comeria una llave en medio del reparto.
 */
const parseErrorBody = (text: string): unknown => {
  try {
    return text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
};

/** El `message` legible que Nest pone dentro del cuerpo, si hay alguno. */
const messageFrom = (body: unknown): string | undefined => {
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return undefined;
  }

  const { message } = body as { message: unknown };
  return typeof message === 'string' ? message : undefined;
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const text = await response.text();
    const body = parseErrorBody(text);

    throw new ApiError(
      response.status,
      // `??` no alcanza: un cuerpo vacio es cadena vacia, no null.
      messageFrom(body) ?? (text || `API ${response.status}`),
      body,
    );
  }

  return response.json() as Promise<T>;
};

export const createApiClient = (getToken: () => string | null): ApiClient => ({
  async get<T>(path: string, opts: { auth?: boolean; cache?: RequestCache } = {}): Promise<T> {
    const auth = opts.auth ?? true;
    const headers = buildAuthHeader(getToken, auth);

    const response = await fetch(`${API_URL}${path}`, {
      method: 'GET',
      headers,
      ...(opts.cache ? { cache: opts.cache } : {}),
    });

    return handleResponse<T>(response);
  },

  async post<T>(path: string, body: unknown, opts: { auth?: boolean } = {}): Promise<T> {
    const auth = opts.auth ?? true;
    const headers = { 'Content-Type': 'application/json', ...buildAuthHeader(getToken, auth) };

    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    return handleResponse<T>(response);
  },

  async patch<T>(path: string, body: unknown): Promise<T> {
    const headers = { 'Content-Type': 'application/json', ...buildAuthHeader(getToken, true) };

    const response = await fetch(`${API_URL}${path}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });

    return handleResponse<T>(response);
  },

  async postForm<T>(path: string, form: FormData): Promise<T> {
    const headers = buildAuthHeader(getToken, true);

    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: form,
    });

    return handleResponse<T>(response);
  },
});
