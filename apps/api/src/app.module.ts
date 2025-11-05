import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AaModule } from './modules/aa/aa.module';
import { validateEnv } from './config/env.validation';
import { BridgeModule } from './modules/bridge/bridge.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/api/.env', '.env'],
      validate: validateEnv,
    }),
    AaModule,
    BridgeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
