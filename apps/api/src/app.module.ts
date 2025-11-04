import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AaModule } from './modules/aa/aa.module';

@Module({
  imports: [AaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
