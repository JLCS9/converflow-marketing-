import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { PipelinesService } from './pipelines.service.js';

@ApiTags('pipelines')
@UseGuards(TenantAuthGuard)
@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly svc: PipelinesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.svc.list(user.tenantId, { includeArchived: includeArchived === 'true' });
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.findById(user.tenantId, id);
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.create(user.tenantId, body as never);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.update(user.tenantId, id, body as never);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.svc.remove(user.tenantId, id);
    return { ok: true };
  }
}
