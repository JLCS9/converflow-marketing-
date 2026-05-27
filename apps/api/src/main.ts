import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
      logger: env.NODE_ENV === 'development',
    }),
  );

  // Casts work around Fastify plugin type augmentation conflicts across @fastify/* plugins.
  // The runtime is correct; the types are just doubled by parallel `declare module 'fastify'` blocks.
  await app.register(helmet as never, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });
  await app.register(cookie as never, {
    secret: env.AUTH_SECRET,
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: [env.WEB_PUBLIC_URL, env.ADMIN_PUBLIC_URL].filter(Boolean) as string[],
    credentials: true,
  });

  if (env.NODE_ENV !== 'production') {
    const swagger = new DocumentBuilder()
      .setTitle('converflow.ai API')
      .setDescription('Multitenant SaaS platform for AI agents')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  console.info(`API listening on http://0.0.0.0:${env.API_PORT}`);
}

void bootstrap();
