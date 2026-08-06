import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import type { FileFilterCallback } from 'multer';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Roles } from '../auth/roles.decorator';

@Controller('uploads')
export class UploadsController {
  @Roles('admin', 'chofer')
  @Post('receipt')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: 'uploads',
        filename: (
          _req: Request,
          file: Express.Multer.File,
          callback: (error: Error | null, filename: string) => void,
        ) => {
          const extension = extname(file.originalname || '.jpg');
          const unique = `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          callback(null, `${unique}${extension}`);
        },
      }),
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
  uploadReceipt(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol =
      typeof forwardedProto === 'string' && forwardedProto.length > 0
        ? forwardedProto
        : 'http';
    const host = req.headers.host;
    const publicUrl = `${protocol}://${host}/uploads/${file.filename}`;

    return {
      filename: file.filename,
      url: publicUrl,
    };
  }
}
