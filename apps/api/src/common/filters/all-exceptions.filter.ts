import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '@converflow/shared';
import { ZodError } from 'zod';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();

    if (exception instanceof AppError) {
      res.status(exception.httpStatus).send({
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      });
      return;
    }

    if (exception instanceof ZodError) {
      res.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: 'Validation failed',
          details: exception.flatten().fieldErrors,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      res.status(status).send({
        error:
          typeof response === 'string'
            ? { code: 'HTTP_ERROR', message: response }
            : response,
      });
      return;
    }

    this.logger.error('Unhandled exception', {
      err: exception,
      path: req.url,
      method: req.method,
    });

    res.status(500).send({
      error: {
        code: 'INTERNAL',
        message: 'Internal server error',
      },
    });
  }
}
