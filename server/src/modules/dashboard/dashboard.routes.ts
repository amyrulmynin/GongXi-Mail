import { type FastifyPluginAsync } from 'fastify';
import { dashboardService } from './dashboard.service.js';
import { systemLogService } from './system-log.service.js';
import { z } from 'zod';

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
    // All routes require JWT authentication
    fastify.addHook('preHandler', fastify.authenticateJwt);

    // Statistics
    fastify.get('/stats', async () => {
        const stats = await dashboardService.getStats();
        return { success: true, data: stats };
    });

    // API call trend
    fastify.get('/api-trend', async (request) => {
        const { days } = z.object({ days: z.coerce.number().default(7) }).parse(request.query);
        const trend = await dashboardService.getApiTrend(days);
        return { success: true, data: trend };
    });

    // Operation logs
    fastify.get('/logs', async (request) => {
        const input = z.object({
            page: z.coerce.number().default(1),
            pageSize: z.coerce.number().default(20),
            action: z.string().optional(),
        }).parse(request.query);

        const logs = await dashboardService.getLogs(input);
        return { success: true, data: logs };
    });

    fastify.get('/system-logs', async (request) => {
        const input = z.object({
            level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
            keyword: z.string().trim().optional(),
            lines: z.coerce.number().int().min(50).max(1000).default(200),
        }).parse(request.query);

        const logs = await systemLogService.getLogs(input);
        return { success: true, data: logs };
    });
};

export default dashboardRoutes;
