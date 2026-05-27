import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

export interface AuthenticatedAdmin {
  adminId: string;
  email: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    if (!req.user) {
      throw new Error('CurrentUser used on unauthenticated route');
    }
    return req.user;
  },
);

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { admin?: AuthenticatedAdmin }>();
    if (!req.admin) {
      throw new Error('CurrentAdmin used on unauthenticated route');
    }
    return req.admin;
  },
);
