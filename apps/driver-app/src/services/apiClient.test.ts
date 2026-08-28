import { createApiClient, ApiError } from './apiClient';

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

describe('apiClient/ApiError', () => {
  it('carries the status and message', () => {
    const error = new ApiError(404, 'not found');
    expect(error.status).toBe(404);
    expect(error.message).toBe('not found');
  });

  it('carries a parsed body when one is given', () => {
    const body = { message: 'duplicate', customer: { id: 'c1' } };
    expect(new ApiError(409, 'duplicate', body).body).toEqual(body);
  });
});

describe('apiClient error bodies', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  // POST /customers answers 409 with the conflicting customer in a JSON
  // body. Without parsing it, the raw JSON string ends up as `message` --
  // which every screen shows verbatim to the driver.
  it('parses a JSON error body onto the error', async () => {
    const payload = { message: 'A customer with this name already exists', customer: { id: 'c1' } };
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(payload),
    } as Response);
    const client = createApiClient(() => 'tok123');

    await expect(client.post('/customers', {})).rejects.toMatchObject({
      status: 409,
      body: payload,
    });
  });

  it('uses the body message as the error message, never the raw JSON', async () => {
    const payload = { message: 'Ya existe ese cliente', customer: { id: 'c1' } };
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify(payload),
    } as Response);
    const client = createApiClient(() => 'tok123');

    await expect(client.post('/customers', {})).rejects.toMatchObject({
      message: 'Ya existe ese cliente',
    });
  });

  it('leaves a plain-text error body as the message, with no parsed body', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server exploded',
    } as Response);
    const client = createApiClient(() => 'tok123');

    await expect(client.get('/sales')).rejects.toMatchObject({
      status: 500,
      message: 'server exploded',
      body: undefined,
    });
  });
});

describe('apiClient/get', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  it('injects Authorization: Bearer <token> when a token is available', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse({ ok: true }));
    const client = createApiClient(() => 'tok123');

    await client.get('/sales');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/sales',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok123' }),
      }),
    );
  });

  it('does NOT inject Authorization when opts.auth is false', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse({ ok: true }));
    const client = createApiClient(() => 'tok123');

    await client.get('/public', { auth: false });

    const [, requestInit] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(requestInit.headers?.Authorization).toBeUndefined();
  });

  it('throws ApiError(401, "auth required") without calling fetch when a token is required but missing', async () => {
    const client = createApiClient(() => null);

    await expect(client.get('/sales')).rejects.toEqual(new ApiError(401, 'auth required'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('throws ApiError(status, message) on a non-2xx response, using response text', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server exploded',
    } as Response);
    const client = createApiClient(() => 'tok123');

    await expect(client.get('/sales')).rejects.toEqual(new ApiError(500, 'server exploded'));
  });

  it('falls back to `API {status}` when the response body is empty', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    } as Response);
    const client = createApiClient(() => 'tok123');

    await expect(client.get('/sales')).rejects.toEqual(new ApiError(503, 'API 503'));
  });

  it('propagates network failures untouched (no wrapping)', async () => {
    const networkError = new TypeError('Network request failed');
    (globalThis.fetch as jest.Mock).mockRejectedValue(networkError);
    const client = createApiClient(() => 'tok123');

    await expect(client.get('/sales')).rejects.toBe(networkError);
  });
});

describe('apiClient/post', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  it('sends Content-Type: application/json and the serialized body', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse({ id: '1' }));
    const client = createApiClient(() => 'tok123');

    await client.post('/sales', { total: 10 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/sales',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok123',
        }),
        body: JSON.stringify({ total: 10 }),
      }),
    );
  });

  it('supports auth: false for login (no Authorization header)', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse({ accessToken: 'x' }));
    const client = createApiClient(() => null);

    await client.post('/auth/login', { username: 'u', password: 'p' }, { auth: false });

    const [, requestInit] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(requestInit.headers?.Authorization).toBeUndefined();
  });
});

describe('apiClient/patch', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  it('sends method PATCH with JSON body and auth header', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse({ ok: true }));
    const client = createApiClient(() => 'tok123');

    await client.patch('/sales/1', { reason: 'fix' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/sales/1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok123',
        }),
        body: JSON.stringify({ reason: 'fix' }),
      }),
    );
  });
});

describe('apiClient/postForm', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  it('does NOT set an explicit Content-Type header for FormData (RN sets the multipart boundary itself)', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse({ url: 'x' }));
    const client = createApiClient(() => 'tok123');
    const form = new FormData();

    await client.postForm('/uploads/receipt', form);

    const [, requestInit] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(requestInit.headers?.['Content-Type']).toBeUndefined();
    expect(requestInit.headers?.Authorization).toBe('Bearer tok123');
    expect(requestInit.body).toBe(form);
  });
});
