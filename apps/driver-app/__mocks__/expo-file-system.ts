/**
 * Manual mock for `expo-file-system`, used by ExpensesScreen/LoadManifestScreen/
 * NewSaleScreen to upload a locally-picked photo via `File.upload()` (a native
 * multipart task) -- both `fetch(uri)` and RN's own FormData/Blob machinery
 * proved unreliable for this on-device (see driver-ux-polish's upload-bug
 * follow-up fix). Placed under `<rootDir>/__mocks__/` so Jest auto-substitutes
 * it for every test that imports the real module.
 *
 * `mockUpload` is shared across all `File` instances so a single test can
 * configure/assert on it regardless of which screen constructed the `File`.
 */
export enum UploadType {
  BINARY_CONTENT = 0,
  MULTIPART = 1,
}

export const mockUpload = jest.fn(async () => ({
  body: JSON.stringify({ url: 'https://cdn.test/mock-upload.jpg' }),
  status: 200,
  headers: {},
}));

export const File = jest.fn().mockImplementation((uri: string) => ({
  uri,
  size: 16,
  upload: mockUpload,
}));
