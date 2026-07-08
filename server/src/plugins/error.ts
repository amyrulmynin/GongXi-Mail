import { type FastifyPluginAsync, type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

export class AppError extends Error {
    constructor(
        public code: string,
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'AppError';
    }
}

const errorPlugin: FastifyPluginAsync = async (fastify) => {
    fastify.setErrorHandler((error: FastifyError | AppError | ZodError, request: FastifyRequest, reply: FastifyReply) => {
        logger.error({ err: error, path: request.url, method: request.method, requestId: request.id }, 'Request error');

        // Zod validation error
        if (error instanceof ZodError) {
            return reply.status(400).send({
                success: false,
                requestId: request.id,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid request data',
                    details: error.errors,
                },
            });
        }

        // Custom application error
        if (error instanceof AppError) {
            return reply.status(error.statusCode).send({
                success: false,
                requestId: request.id,
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        // Fastify validation error
        if (error.validation) {
            return reply.status(400).send({
                success: false,
                requestId: request.id,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: error.message,
                },
            });
        }

        // Unknown error
        const statusCode = error.statusCode || 500;
        return reply.status(statusCode).send({
            success: false,
            requestId: request.id,
            error: {
                code: 'INTERNAL_ERROR',
                message: statusCode === 500 ? 'Internal server error' : error.message,
            },
        });
    });

    // Note: 404 handling has been moved to app.ts to support SPA routing
};

export default fp(errorPlugin, { name: 'error' });
