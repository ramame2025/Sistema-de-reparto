import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { FileFilterCallback } from 'multer';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { StorageService } from './storage.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Roles('admin', 'chofer')
  @Post('receipt')
  @UseInterceptors(
    FileInterceptor('file', {
      // Buffer in memory, then hand off to Supabase Storage. Nothing touches
      // the local disk — Railway wipes it on every deploy.
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        callback: FileFilterCallback,
      ) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(new Error('Only image files are allowed'));
          return;
        }

        callback(null, true);
      },
    }),
  )
  async uploadReceipt(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const stored = await this.storage.uploadReceipt(file);

    // `filename` kept for backwards compatibility with the mobile client,
    // which reads `url` and stores it verbatim as the receipt reference.
    return {
      filename: stored.path,
      url: stored.url,
    };
  }
}
