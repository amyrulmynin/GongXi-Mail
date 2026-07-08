import { type FastifyPluginAsync } from 'fastify';
import { apiKeyService } from './apiKey.service.js';
import { poolService } from '../mail/pool.service.js';
import { createApiKeySchema, updateApiKeySchema, listApiKeySchema } from './apiKey.schema.js';
import { z } from 'zod';

const apiKeyRoutes: FastifyPluginAsync = async (fastify) => {
    // All routes require JWT authentication
    fastify.addHook('preHandler', fastify.authenticateJwt);

    // List
    fastify.get('/', async (request) => {
        const input = listApiKeySchema.parse(request.query);
        const result = await apiKeyService.list(input);
        return { success: true, data: result };
    });

    // Create
    fastify.post('/', async (request) => {
        const input = createApiKeySchema.parse(request.body);
        const apiKey = await apiKeyService.create(input, request.user!.id);
        request.log.info({
            systemEvent: true,
            action: 'api_key.create',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            apiKeyId: apiKey.id,
            name: apiKey.name,
        }, 'API Key created');
        return { success: true, data: apiKey };
    });

    // Details
    fastify.get('/:id', async (request) => {
        const { id } = request.params as { id: string };
        const apiKey = await apiKeyService.getById(parseInt(id));
        return { success: true, data: apiKey };
    });

    // Usage statistics (call count)
    fastify.get('/:id/usage', async (request) => {
        const { id } = request.params as { id: string };
        const { group } = request.query as { group?: string };
        // Get email pool statistics
        const poolStats = await poolService.getStats(parseInt(id), group);
        return { success: true, data: poolStats };
    });

    // Reset email pool
    fastify.post('/:id/reset-pool', async (request) => {
        const { id } = request.params as { id: string };
        const { group } = request.body as { group?: string };
        await poolService.reset(parseInt(id), group);
        request.log.info({
            systemEvent: true,
            action: 'api_key.reset_pool',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            apiKeyId: parseInt(id),
            group: group || null,
        }, 'API Key email pool reset');
        return { success: true, data: { message: 'Email pool reset' } };
    });

    // Update
    fastify.put('/:id', async (request) => {
        const { id } = request.params as { id: string };
        const input = updateApiKeySchema.parse(request.body);
        const apiKey = await apiKeyService.update(parseInt(id), input);
        request.log.info({
            systemEvent: true,
            action: 'api_key.update',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            apiKeyId: apiKey.id,
            name: apiKey.name,
            status: apiKey.status,
        }, 'API Key updated');
        return { success: true, data: apiKey };
    });

    // Delete
    fastify.delete('/:id', async (request) => {
        const { id } = request.params as { id: string };
        await apiKeyService.delete(parseInt(id));
        request.log.info({
            systemEvent: true,
            action: 'api_key.delete',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            apiKeyId: parseInt(id),
        }, 'API Key deleted');
        return { success: true, data: { message: 'API Key deleted' } };
    });

    // Get email list with usage status
    fastify.get('/:id/pool-emails', async (request) => {
        const { id } = request.params as { id: string };
        const { groupId } = request.query as { groupId?: string };
        const emails = await poolService.getEmailsWithUsage(parseInt(id), groupId ? parseInt(groupId) : undefined);
        return { success: true, data: emails };
    });

    // Update email usage status
    fastify.put('/:id/pool-emails', async (request) => {
        const { id } = request.params as { id: string };
        const input = z.object({
            emailIds: z.array(z.number().int().positive()).default([]),
            groupId: z.number().int().positive().optional(),
        }).parse(request.body);
        const result = await poolService.updateEmailUsage(parseInt(id), input.emailIds, input.groupId);
        request.log.info({
            systemEvent: true,
            action: 'api_key.pool_emails_update',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            apiKeyId: parseInt(id),
            groupId: input.groupId ?? null,
            emailIds: input.emailIds,
            count: result.count,
        }, 'API Key email pool usage updated');
        return { success: true, data: result };
    });
};

export default apiKeyRoutes;

