import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { env } from './config/env.js';
import errorPlugin from './plugins/error.js';
import authPlugin from './plugins/auth.js';
import { isApiOrAdminPath, shouldServeSpaIndex } from './lib/http.js';
import { ensurePrecompressedAssets } from './lib/static-compression.js';
import { logger } from './lib/logger.js';

// Routes
import authRoutes from './modules/auth/auth.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import apiKeyRoutes from './modules/api-key/apiKey.routes.js';
import emailRoutes from './modules/email/email.routes.js';
import groupRoutes from './modules/email/group.routes.js';
import mailRoutes from './modules/mail/mail.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
    const fastify = Fastify({
        requestIdHeader: 'x-request-id',
        requestIdLogLabel: 'requestId',
        disableRequestLogging: true,
        loggerInstance: logger,
    });

    const parsedCorsOrigins = (env.CORS_ORIGIN || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    const corsOrigin = parsedCorsOrigins.length > 0
        ? parsedCorsOrigins
        : env.NODE_ENV === 'development';

    // Plugins
    await fastify.register(fastifyCors, {
        origin: corsOrigin,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
    });

    await fastify.register(fastifyHelmet, {
        contentSecurityPolicy: false, // Allow the frontend to load
    });

    await fastify.register(fastifyCookie);

    // Custom plugins
    await fastify.register(errorPlugin);
    await fastify.register(authPlugin);

    fastify.addHook('onRequest', async (request, reply) => {
        reply.header('x-request-id', request.id);
    });

    // Health check
    fastify.get('/health', async () => {
        return {
            success: true,
            data: {
                status: 'ok',
            },
        };
    });

    // Static files (frontend) - disable fastify-static's default 404 handling
    const staticRoot = join(__dirname, '../../public');
    if (env.NODE_ENV === 'production') {
        try {
            const compressionResult = await ensurePrecompressedAssets(staticRoot);
            fastify.log.info({
                staticFiles: compressionResult.files,
                generatedCompressedFiles: compressionResult.generated,
            }, 'Static precompression ready');
        } catch (err) {
            fastify.log.warn({ err }, 'Failed to precompress static assets');
        }
    }

    await fastify.register(fastifyStatic, {
        root: staticRoot,
        prefix: '/',
        wildcard: false, // Disable wildcard so we can handle SPA fallback ourselves
        preCompressed: true,
    });

    // API routes
    await fastify.register(authRoutes, { prefix: '/admin/auth' });
    await fastify.register(adminRoutes, { prefix: '/admin/admins' });
    await fastify.register(apiKeyRoutes, { prefix: '/admin/api-keys' });
    await fastify.register(emailRoutes, { prefix: '/admin/emails' });
    await fastify.register(groupRoutes, { prefix: '/admin/email-groups' });
    await fastify.register(dashboardRoutes, { prefix: '/admin/dashboard' });

    // External API
    await fastify.register(mailRoutes, { prefix: '/api' });

    // SPA fallback - safe to use setNotFoundHandler now
    fastify.setNotFoundHandler(async (request, reply) => {
        const path = request.url.split('?')[0];
        const accepts = request.headers.accept;

        // If this is an API route, return a 404 JSON response
        if (isApiOrAdminPath(path)) {
            return reply.status(404).send({
                success: false,
                requestId: request.id,
                error: { code: 'NOT_FOUND', message: 'Route not found' },
            });
        }

        // Non-page request, return a 404 JSON response
        if (!shouldServeSpaIndex({ method: request.method, path, accept: accepts })) {
            return reply.status(404).send({
                success: false,
                requestId: request.id,
                error: { code: 'NOT_FOUND', message: 'Route not found' },
            });
        }

        // Otherwise fall back to index.html (SPA)
        return reply.sendFile('index.html');
    });

    return fastify;
}

export default buildApp;
