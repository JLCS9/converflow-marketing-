import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@UseGuards(TenantAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.users.list(user.tenantId);
  }

  @Post('invite')
  invite(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.users.invite(body as never, {
      tenantId: user.tenantId,
      currentUserId: user.userId,
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.update(id, body as never, {
      tenantId: user.tenantId,
      currentUserId: user.userId,
      currentUserRole: user.role,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.users.remove(id, {
      tenantId: user.tenantId,
      currentUserId: user.userId,
      currentUserRole: user.role,
    });
    return { ok: true };
  }
}
