import { InternalServerErrorException } from '@nestjs/common';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

// Imported after jest.mock so the mocked module is wired in.
import { createClient } from '@supabase/supabase-js';
import { StorageService } from './storage.service';

const createClientMock = createClient as jest.Mock;
const uploadMock = jest.fn();
const getPublicUrlMock = jest.fn();
const fromMock = jest.fn(() => ({
  upload: uploadMock,
  getPublicUrl: getPublicUrlMock,
}));

describe('StorageService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    createClientMock.mockReturnValue({ storage: { from: fromMock } });
    process.env = {
      ...ORIGINAL_ENV,
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      SUPABASE_STORAGE_BUCKET: 'receipts',
    };
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: 'https://project.supabase.co/storage/v1/object/public/receipts/x.jpg' },
    });
    uploadMock.mockResolvedValue({ data: { path: 'x.jpg' }, error: null });
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('throws on construction when SUPABASE_URL is missing', () => {
    delete process.env.SUPABASE_URL;
    expect(() => new StorageService()).toThrow(/SUPABASE_URL/);
  });

  it('throws on construction when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => new StorageService()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('creates the Supabase client with the service-role key and no session persistence', () => {
    new StorageService();

    expect(createClientMock).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'service-role-key',
      expect.objectContaining({
        auth: expect.objectContaining({ persistSession: false }),
      }),
    );
  });

  it('uploads the buffer to the configured bucket with a randomized object name preserving the extension', async () => {
    const service = new StorageService();

    await service.uploadReceipt({
      buffer: Buffer.from('bytes'),
      originalname: 'photo.png',
      mimetype: 'image/png',
    });

    expect(fromMock).toHaveBeenCalledWith('receipts');
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [objectPath, body, options] = uploadMock.mock.calls[0];
    expect(objectPath).toMatch(/^receipt_\d+_[a-z0-9]+\.png$/);
    expect(body).toBeInstanceOf(Buffer);
    expect(options).toEqual(
      expect.objectContaining({ contentType: 'image/png', upsert: false }),
    );
  });

  it('falls back to a .jpg extension when the original name has none', async () => {
    const service = new StorageService();

    await service.uploadReceipt({
      buffer: Buffer.from('bytes'),
      originalname: 'nOextEnsion',
      mimetype: 'image/jpeg',
    });

    const [objectPath] = uploadMock.mock.calls[0];
    expect(objectPath).toMatch(/\.jpg$/);
  });

  it('defaults the bucket to "receipts" when SUPABASE_STORAGE_BUCKET is unset', async () => {
    delete process.env.SUPABASE_STORAGE_BUCKET;
    const service = new StorageService();

    await service.uploadReceipt({
      buffer: Buffer.from('bytes'),
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
    });

    expect(fromMock).toHaveBeenCalledWith('receipts');
  });

  it('returns the public URL and the stored object path', async () => {
    const service = new StorageService();

    const result = await service.uploadReceipt({
      buffer: Buffer.from('bytes'),
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
    });

    expect(result.url).toBe(
      'https://project.supabase.co/storage/v1/object/public/receipts/x.jpg',
    );
    expect(result.path).toMatch(/^receipt_\d+_[a-z0-9]+\.jpg$/);
    expect(getPublicUrlMock).toHaveBeenCalledWith(result.path);
  });

  it('raises InternalServerErrorException when Supabase returns an upload error', async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: 'bucket not found' } });
    const service = new StorageService();

    await expect(
      service.uploadReceipt({
        buffer: Buffer.from('bytes'),
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
