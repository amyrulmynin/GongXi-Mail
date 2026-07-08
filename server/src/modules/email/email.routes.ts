import { type FastifyPluginAsync } from 'fastify';
import { emailService } from './email.service.js';
import { mailService } from '../mail/mail.service.js';
import { tokenRefreshService } from './token-refresh.service.js';
import { createEmailSchema, updateEmailSchema, listEmailSchema, importEmailSchema } from './email.schema.js';
import { z } from 'zod';
import { AppError } from '../../plugins/error.js';
import { getTokenRefreshJobNextRunAt, refreshTokenRefreshJobSchedule } from '../../jobs/token-refresh.js';

const emailRoutes: FastifyPluginAsync = async (fastify) => {
    // All routes require JWT authentication
    fastify.addHook('preHandler', fastify.authenticateJwt);

    // List
    fastify.get('/', async (request) => {
        const input = listEmailSchema.parse(request.query);
        const result = await emailService.list(input);
        return { success: true, data: result };
    });

    // Details
    fastify.get('/:id', async (request) => {
        const { id } = request.params as { id: string };
        const { secrets } = request.query as { secrets?: string };
        const email = await emailService.getById(parseInt(id), secrets === 'true');
        return { success: true, data: email };
    });

    // Create
    fastify.post('/', async (request) => {
        const input = createEmailSchema.parse(request.body);
        const email = await emailService.create(input);
        request.log.info({
            systemEvent: true,
            action: 'email.create',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            emailId: email.id,
            email: email.email,
        }, 'Email created');
        return { success: true, data: email };
    });

    // Update
    fastify.put('/:id', async (request) => {
        const { id } = request.params as { id: string };
        const input = updateEmailSchema.parse(request.body);
        const email = await emailService.update(parseInt(id), input);
        request.log.info({
            systemEvent: true,
            action: 'email.update',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            emailId: email.id,
            email: email.email,
            status: email.status,
        }, 'Email updated');
        return { success: true, data: email };
    });

    // Delete
    fastify.delete('/:id', async (request) => {
        const { id } = request.params as { id: string };
        await emailService.delete(parseInt(id));
        request.log.info({
            systemEvent: true,
            action: 'email.delete',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            emailId: parseInt(id),
        }, 'Email deleted');
        return { success: true, data: { message: 'Email account deleted' } };
    });

    // Batch delete
    fastify.post('/batch-delete', async (request) => {
        const { ids } = z.object({ ids: z.array(z.number()) }).parse(request.body);
        const result = await emailService.batchDelete(ids);
        request.log.info({
            systemEvent: true,
            action: 'email.batch_delete',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            emailIds: ids,
            deletedCount: result.deleted,
        }, 'Batch delete emails');
        return { success: true, data: result };
    });

    // Batch import
    fastify.post('/import', async (request) => {
        const input = importEmailSchema.parse(request.body);
        const result = await emailService.import(input);
        request.log.info({
            systemEvent: true,
            action: 'email.import',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            separator: input.separator,
            success: result.success,
            failed: result.failed,
            errorCount: result.errors.length,
        }, 'Batch import emails');
        return { success: true, data: result };
    });

    // Export
    fastify.get('/export', async (request) => {
        const query = z.object({
            ids: z.string().optional(),
            separator: z.string().optional(),
            groupId: z.coerce.number().int().positive().optional(),
        }).parse(request.query);

        const idArray = query.ids?.split(',').map(Number).filter((id: number) => Number.isFinite(id) && id > 0);
        const content = await emailService.export(idArray, query.separator, query.groupId);
        request.log.info({
            systemEvent: true,
            action: 'email.export',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            groupId: query.groupId ?? null,
            emailCount: idArray?.length ?? null,
        }, 'Export emails');
        return { success: true, data: { content } };
    });

    // View emails (admin only)
    fastify.get('/:id/mails', async (request) => {
        const { id } = request.params as { id: string };
        const { mailbox } = request.query as { mailbox?: string };

        const emailData = await emailService.getById(parseInt(id), true);

        const credentials = {
            id: emailData.id,
            email: emailData.email,
            clientId: emailData.clientId,
            refreshToken: emailData.refreshToken!,
            autoAssigned: false,
            fetchStrategy: emailData.group?.fetchStrategy,
        };

        const mails = await mailService.getEmails(credentials, { mailbox: mailbox || 'INBOX' });
        await emailService.touchLastCheckAt(emailData.id);
        return { success: true, data: mails };
    });

    // Clear mailbox (admin only)
    fastify.post('/:id/clear', async (request) => {
        const { id } = request.params as { id: string };
        const { mailbox } = request.body as { mailbox?: string };

        const emailData = await emailService.getById(parseInt(id), true);

        const credentials = {
            id: emailData.id,
            email: emailData.email,
            clientId: emailData.clientId,
            refreshToken: emailData.refreshToken!,
            autoAssigned: false,
            fetchStrategy: emailData.group?.fetchStrategy,
        };

        const result = await mailService.processMailbox(credentials, { mailbox: mailbox || 'INBOX' });
        await emailService.touchLastCheckAt(emailData.id);
        request.log.info({
            systemEvent: true,
            action: 'email.clear_mailbox',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            emailId: emailData.id,
            email: emailData.email,
            mailbox: mailbox || 'INBOX',
        }, 'Clear mailbox');
        return { success: true, data: result };
    });

    // ========================================
    // Token refresh - batch refresh tokens for all non-disabled emails
    // ========================================
    fastify.post('/refresh-tokens', async (request) => {
        const body = z.object({
            groupId: z.number().int().positive().optional(),
        }).optional().parse(request.body);

        if (tokenRefreshService.isRefreshRunning()) {
            throw new AppError('REFRESH_IN_PROGRESS', 'Token refresh is already running', 409);
        }

        request.log.info({
            systemEvent: true,
            action: 'token_refresh.manual_request',
            trigger: 'MANUAL',
            groupId: body?.groupId ?? null,
            requestedById: request.user?.id ?? null,
            requestedByUsername: request.user?.username ?? null,
        }, 'Manual batch token refresh triggered');

        // Execute asynchronously, do not block the request
        void tokenRefreshService.refreshAll({
            groupId: body?.groupId,
            trigger: 'MANUAL',
            requestedBy: request.user ? {
                id: request.user.id,
                username: request.user.username,
            } : null,
        }).catch((err) => {
            request.log.error({
                err,
                systemEvent: true,
                action: 'token_refresh.manual_failed',
                trigger: 'MANUAL',
                groupId: body?.groupId ?? null,
                requestedById: request.user?.id ?? null,
                requestedByUsername: request.user?.username ?? null,
            }, 'Manual batch token refresh failed');
        });
        return { success: true, data: { message: 'Token refresh started' } };
    });

    fastify.put('/refresh-settings', async (request) => {
        const input = z.object({
            enabled: z.boolean(),
            intervalHours: z.coerce.number().int().min(1).max(24 * 30),
            concurrency: z.coerce.number().int().min(1).max(50),
        }).parse(request.body);

        const settings = await tokenRefreshService.updateTokenRefreshConfig(input);
        await refreshTokenRefreshJobSchedule();
        request.log.info({
            systemEvent: true,
            action: 'token_refresh.settings_update',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            enabled: settings.enabled,
            intervalHours: settings.intervalHours,
            concurrency: settings.concurrency,
        }, 'Token auto-refresh settings updated');

        return { success: true, data: settings };
    });

    // ========================================
    // Token refresh - single email
    // ========================================
    fastify.post('/:id/refresh-token', async (request) => {
        const { id } = request.params as { id: string };
        const result = await tokenRefreshService.refreshSingleToken(parseInt(id));
        request.log.info({
            systemEvent: true,
            action: 'token_refresh.single',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            emailId: result.emailId,
            email: result.email || null,
            success: result.success,
        }, result.success ? 'Manual single email token refresh succeeded' : 'Manual single email token refresh failed');
        return { success: true, data: result };
    });

    // ========================================
    // Token refresh status query
    // ========================================
    fastify.get('/refresh-status', async () => {
        const settings = await tokenRefreshService.getTokenRefreshConfig();
        const stats = await tokenRefreshService.getRefreshStats(getTokenRefreshJobNextRunAt());
        return {
            success: true,
            data: {
                enabled: settings.enabled,
                intervalHours: settings.intervalHours,
                concurrency: settings.concurrency,
                lastRunAt: stats.lastRunAt,
                nextRunAt: stats.nextRunAt,
                isRunning: stats.isRunning,
                lastResult: stats.lastResult ? {
                    total: stats.lastResult.total,
                    success: stats.lastResult.success,
                    failed: stats.lastResult.failed,
                    durationMs: stats.lastResult.durationMs,
                } : null,
                currentRun: stats.currentRun ? {
                    trigger: stats.currentRun.trigger,
                    total: stats.currentRun.total,
                    completed: stats.currentRun.completed,
                    success: stats.currentRun.success,
                    failed: stats.currentRun.failed,
                    groupId: stats.currentRun.groupId,
                    requestedByUsername: stats.currentRun.requestedByUsername,
                    startedAt: stats.currentRun.startedAt,
                    durationMs: stats.currentRun.durationMs,
                    recentFailures: stats.currentRun.recentFailures.slice().reverse(),
                } : null,
                recentFailures: stats.recentFailures,
            },
        };
    });
};

export default emailRoutes;
