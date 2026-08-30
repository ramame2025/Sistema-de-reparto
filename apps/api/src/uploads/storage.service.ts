import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { extname } from 'path';

export interface UploadableFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface StoredObject {
  /** Object key inside the bucket. Persist this if you ever need to delete it. */
  path: string;
  /** Directly loadable URL — the mobile client stores it as the receipt ref. */
  url: string;
}

/**
 * Wraps Supabase Storage. Replaces the previous local-disk (`multer.diskStorage`)
 * strategy: Railway's filesystem is ephemeral, so anything written to disk is
 * gone on the next deploy or restart.
 */
@Injectable()
export class StorageService {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) {
      throw new Error('SUPABASE_URL is required to use Supabase Storage');
    }
    if (!serviceRoleKey) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY is required to use Supabase Storage',
      );
    }

    this.bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'receipts';
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async uploadReceipt(file: UploadableFile): Promise<StoredObject> {
    const extension = extname(file.originalname ?? '') || '.jpg';
    const objectPath = `receipt_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}${extension}`;

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to upload receipt to storage: ${error.message}`,
      );
    }

    const { data } = this.client.storage
      .from(this.bucket)
      .getPublicUrl(objectPath);

    return { path: objectPath, url: data.publicUrl };
  }
}
