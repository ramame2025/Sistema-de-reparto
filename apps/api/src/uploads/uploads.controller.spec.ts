import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { StorageService } from './storage.service';
import { ROLES_KEY } from '../auth/roles.decorator';

describe('UploadsController', () => {
  let controller: UploadsController;
  let storage: { uploadReceipt: jest.Mock };

  beforeEach(async () => {
    storage = { uploadReceipt: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: StorageService, useValue: storage }],
    }).compile();

    controller = module.get<UploadsController>(UploadsController);
  });

  it('restricts POST /uploads/receipt to admin and chofer roles', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      UploadsController.prototype.uploadReceipt,
    );
    expect(roles).toEqual(['admin', 'chofer']);
  });

  it('throws BadRequestException and never touches storage when no file is provided', async () => {
    await expect(
      controller.uploadReceipt(undefined as unknown as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.uploadReceipt).not.toHaveBeenCalled();
  });

  it('delegates the uploaded file to StorageService', async () => {
    storage.uploadReceipt.mockResolvedValue({ path: 'receipt_1_ab.jpg', url: 'https://cdn/x.jpg' });
    const file = {
      buffer: Buffer.from('bytes'),
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    await controller.uploadReceipt(file);

    expect(storage.uploadReceipt).toHaveBeenCalledWith(file);
  });

  it('returns the legacy { filename, url } shape the mobile client expects', async () => {
    storage.uploadReceipt.mockResolvedValue({
      path: 'receipt_1_ab.jpg',
      url: 'https://cdn/receipt_1_ab.jpg',
    });
    const file = {
      buffer: Buffer.from('bytes'),
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    const result = await controller.uploadReceipt(file);

    expect(result).toEqual({
      filename: 'receipt_1_ab.jpg',
      url: 'https://cdn/receipt_1_ab.jpg',
    });
  });
});
