import { API_URL } from './config';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
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

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text || `API ${response.status}`);
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
