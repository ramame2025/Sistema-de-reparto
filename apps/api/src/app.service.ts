import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'distribuidor-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
