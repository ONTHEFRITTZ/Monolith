import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AaModule } from './modules/aa/aa.module';
import { BridgeModule } from './modules/bridge/bridge.module';
import { RampModule } from './modules/ramp/ramp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/api/.env', '.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    AaModule,
    BridgeModule,
    RampModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
