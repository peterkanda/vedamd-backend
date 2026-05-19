import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhiFreeLogger } from './phi-free-logger';
import type { AppConfig } from '../../config/configuration';

export const PHI_FREE_LOGGER = Symbol('PHI_FREE_LOGGER');

@Global()
@Module({
  providers: [
    {
      provide: PHI_FREE_LOGGER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new PhiFreeLogger({
          service: 'vedamd-api',
          hashSecret: config.get('audit.hashSecret', { infer: true }),
        }),
    },
  ],
  exports: [PHI_FREE_LOGGER],
})
export class PhiFreeLoggerModule {}
