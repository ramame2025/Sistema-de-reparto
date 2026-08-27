import { ApiError, createApiClient } from "./api-client";

describe("ApiError", () => {
  it("keeps the status", () => {
    expect(new ApiError(404).status).toBe(404);
  });

  // The 409 from POST /customers carries the conflicting customer in its
  // body. Dropping the body would leave the UI with a bare number and no way
  // to offer that customer, which is the entire point of answering 409
  // instead of blocking.
  it("keeps the parsed response body when one is given", () => {
    const body = { message: "duplicate", customer: { id: "c1" } };
    expect(new ApiError(409, body).body).toEqual(body);
  });

  it("leaves body undefined when the response had none", () => {
    expect(new ApiError(500).body).toBeUndefined();
  });
});

describe("createApiClient error handling", () => {
  const onAuthFailure = jest.fn();

  beforeEach(() => {
    onAuthFailure.mockClear();
  });

  const mockFetch = (status: number, payload?: unknown) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status,
      text: async () => (payload === undefined ? "" : JSON.stringify(payload)),
    }) as unknown as typeof fetch;
  };

  it("attaches the parsed error body to the thrown ApiError", async () => {
    const payload = { message: "duplicate", customer: { id: "c1", name: "Don Jose" } };
    mockFetch(409, payload);
    const api = createApiClient("token", onAuthFailure);

    await expect(api.post("/customers", {})).rejects.toMatchObject({
      status: 409,
      body: payload,
    });
  });

  it("still throws when the error body is not JSON", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "<html>boom</html>",
    }) as unknown as typeof fetch;
    const api = createApiClient("token", onAuthFailure);

    await expect(api.get("/customers")).rejects.toMatchObject({
      status: 500,
      body: undefined,
    });
  });

  it("still reports the failure to the session handler", async () => {
    mockFetch(401);
    const api = createApiClient("token", onAuthFailure);

    await expect(api.get("/customers")).rejects.toThrow(ApiError);
    expect(onAuthFailure).toHaveBeenCalled();
  });
});
