import { Module } from '@nestjs/common';
import { WoocommerceController } from './woocommerce.controller.js';
import { WoocommerceService } from './woocommerce.service.js';

@Module({
  controllers: [WoocommerceController],
  providers: [WoocommerceService],
})
export class EcommerceModule {}
