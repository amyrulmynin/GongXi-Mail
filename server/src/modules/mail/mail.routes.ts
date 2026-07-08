import { type FastifyPluginAsync } from 'fastify';
import { mailService } from './mail.service.js';
import { poolService } from './pool.service.js';
import { emailService } from '../email/email.service.js';
import { MAIL_LOG_ACTIONS } from './mail.actions.js';
import { z } from 'zod';
import { AppError } from '../../plugins/error.js';

// Mail request schema
const mailRequestSchema = z.object({
    email: z.string().email(),
    mailbox: z.string().default('inbox'),
    socks5: z.string().optional(),
    http: z.string().optional(),
});

// Plain text mail request schema
const mailTextRequestSchema = z.object({
    email: z.string().email(),
    match: z.string().optional(), // Regex pattern (optional)
});

function getErrorStatusCode(err: unknown): number {
    if (!err || typeof err !== 'object') {
        return 500;
    }

    const errorObj = err as { name?: unknown; statusCode?: unknown };
    if (errorObj.name === 'ZodError') {
        return 400;
    }
    return typeof errorObj.statusCode === 'number' ? errorObj.statusCode : 500;
}

function getErrorMessage(err: unknown): string {
    if (!err || typeof err !== 'object') {
        return 'Unknown error';
    }
    const message = (err as { message?: unknown }).message;
    return typeof message === 'string' && message.trim() ? message : 'Unknown error';
}

function hasErrorCode(err: unknown, code: string): boolean {
    if (!err || typeof err !== 'object') {
        return false;
    }
    return (err as { code?: unknown }).code === code;
}

function getGroupNameFromRequest(method: string, query: unknown, body: unknown): string | undefined {
    const params = (method === 'GET' ? query : body) as Record<string, unknown> | undefined;
    const groupName = params?.group;
    return typeof groupName === 'string' ? groupName : undefined;
}

const mailRoutes: FastifyPluginAsync = async (fastify) => {
    // All routes require API Key authentication
    fastify.addHook('preHandler', fastify.authenticateApiKey);

    // ========================================
    // Get an unused email address (with retry mechanism)
    // ========================================
    fastify.all('/get-email', async (request) => {
        const startTime = Date.now();
        try {
            if (!request.apiKey?.id) {
                throw new AppError('AUTH_REQUIRED', 'API Key required', 401);
            }
            fastify.assertApiPermission(request, MAIL_LOG_ACTIONS.GET_EMAIL);

            const groupName = getGroupNameFromRequest(request.method, request.query, request.body);

            // Retry up to 3 times to prevent concurrency conflicts
            for (let i = 0; i < 3; i++) {
                const email = await poolService.getUnusedEmail(request.apiKey.id, groupName);
                if (!email) {
                    const stats = await poolService.getStats(request.apiKey.id, groupName);
                    throw new AppError(
                        'NO_UNUSED_EMAIL',
                        `No unused emails available${groupName ? ` in group '${groupName}'` : ''}. Used: ${stats.used}/${stats.total}`,
                        400
                    );
                }

                try {
                    await poolService.markUsed(request.apiKey.id, email.id);
                    await mailService.logApiCall(
                        MAIL_LOG_ACTIONS.GET_EMAIL,
                        request.apiKey.id,
                        email.id,
                        request.ip,
                        200,
                        Date.now() - startTime,
                        request.id
                    );
                    return {
                        success: true,
                        data: {
                            email: email.email,
                            id: email.id,
                        },
                    };
                } catch (err: unknown) {
                    if (hasErrorCode(err, 'ALREADY_USED')) {
                        continue;
                    }
                    throw err;
                }
            }

            throw new AppError('CONCURRENCY_LIMIT', 'System busy, please try again', 429);
        } catch (err: unknown) {
            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.GET_EMAIL,
                request.apiKey?.id,
                undefined,
                request.ip,
                getErrorStatusCode(err),
                Date.now() - startTime,
                request.id
            );
            throw err;
        }
    });

    // ========================================
    // Get the latest email (email address required)
    // ========================================
    fastify.all('/mail_new', async (request) => {
        const startTime = Date.now();
        const input = mailRequestSchema.parse(
            request.method === 'GET' ? request.query : request.body
        );

        if (!request.apiKey?.id) {
            throw new AppError('AUTH_REQUIRED', 'API Key required', 401);
        }
        fastify.assertApiPermission(request, MAIL_LOG_ACTIONS.MAIL_NEW);

        // Find the email account
        const emailAccount = await emailService.getByEmail(input.email);
        if (!emailAccount) {
            throw new AppError('EMAIL_NOT_FOUND', 'Email account not found', 404);
        }
        await poolService.assertEmailAccessible(request.apiKey.id, emailAccount.id, emailAccount.groupId ?? null);

        const credentials = {
            id: emailAccount.id,
            email: emailAccount.email,
            clientId: emailAccount.clientId,
            refreshToken: emailAccount.refreshToken!,
            autoAssigned: false,
            fetchStrategy: emailAccount.fetchStrategy,
        };

        try {
            const result = await mailService.getEmails(credentials, {
                mailbox: input.mailbox,
                limit: 1,
                socks5: input.socks5,
                http: input.http,
            });

            await mailService.updateEmailStatus(credentials.id, true);

            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.MAIL_NEW,
                request.apiKey.id,
                credentials.id,
                request.ip,
                200,
                Date.now() - startTime,
                request.id
            );

            return {
                success: true,
                data: result,
                email: credentials.email,
            };
        } catch (err: unknown) {
            await mailService.updateEmailStatus(credentials.id, false, getErrorMessage(err));
            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.MAIL_NEW,
                request.apiKey.id,
                credentials.id,
                request.ip,
                500,
                Date.now() - startTime,
                request.id
            );
            throw err;
        }
    });

    // ========================================
    // Get plain text content of the latest email (script friendly)
    // ========================================
    fastify.all('/mail_text', async (request, reply) => {
        const startTime = Date.now();
        const input = mailTextRequestSchema.parse(
            request.method === 'GET' ? request.query : request.body
        );

        if (!request.apiKey?.id) {
            reply.code(401).type('text/plain').send('Error: API Key required');
            return;
        }
        try {
            fastify.assertApiPermission(request, MAIL_LOG_ACTIONS.MAIL_TEXT);
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            const statusCode = getErrorStatusCode(err);
            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.MAIL_TEXT,
                request.apiKey?.id,
                undefined,
                request.ip,
                statusCode,
                Date.now() - startTime,
                request.id
            );
            reply.code(statusCode).type('text/plain').send(`Error: ${message}`);
            return;
        }

        const emailAccount = await emailService.getByEmail(input.email);
        if (!emailAccount) {
            reply.code(404).type('text/plain').send('Error: Email account not found');
            return;
        }
        await poolService.assertEmailAccessible(request.apiKey.id, emailAccount.id, emailAccount.groupId ?? null);

        const credentials = {
            id: emailAccount.id,
            email: emailAccount.email,
            clientId: emailAccount.clientId,
            refreshToken: emailAccount.refreshToken!,
            autoAssigned: false,
            fetchStrategy: emailAccount.fetchStrategy,
        };

        try {
            const result = await mailService.getEmails(credentials, {
                mailbox: 'inbox',
                limit: 1, // Only fetch the latest email
            });

            await mailService.updateEmailStatus(credentials.id, true);
            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.MAIL_TEXT,
                request.apiKey.id,
                credentials.id,
                request.ip,
                200,
                Date.now() - startTime,
                request.id
            );

            if (!result.messages || result.messages.length === 0) {
                reply.type('text/plain').send('Error: No messages found');
                return;
            }

            const message = result.messages[0];
            // Prefer the text field
            let content = message.text || '';

            // If a regex pattern is specified
            if (input.match) {
                try {
                    const regex = new RegExp(input.match);
                    const match = content.match(regex);
                    if (match) {
                        // If there is a capture group, return the first capture group; otherwise return the entire match
                        content = match[1] || match[0];
                    } else {
                        reply.code(404).type('text/plain').send('Error: No match found');
                        return;
                    }
                } catch (_e) {
                    reply.code(400).type('text/plain').send('Error: Invalid regex pattern');
                    return;
                }
            }

            return reply.type('text/plain').send(content);

        } catch (err: unknown) {
            await mailService.updateEmailStatus(credentials.id, false, getErrorMessage(err));
            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.MAIL_TEXT,
                request.apiKey.id,
                credentials.id,
                request.ip,
                500,
                Date.now() - startTime,
                request.id
            );
            reply.code(500).type('text/plain').send(`Error: ${getErrorMessage(err)}`);
        }
    });

    // ========================================
    // Get all emails (email address required)
    // ========================================
    fastify.all('/mail_all', async (request) => {
        const startTime = Date.now();
        const input = mailRequestSchema.parse(
            request.method === 'GET' ? request.query : request.body
        );

        if (!request.apiKey?.id) {
            throw new AppError('AUTH_REQUIRED', 'API Key required', 401);
        }
        fastify.assertApiPermission(request, MAIL_LOG_ACTIONS.MAIL_ALL);

        const emailAccount = await emailService.getByEmail(input.email);
        if (!emailAccount) {
            throw new AppError('EMAIL_NOT_FOUND', 'Email account not found', 404);
        }
        await poolService.assertEmailAccessible(request.apiKey.id, emailAccount.id, emailAccount.groupId ?? null);

        const credentials = {
            id: emailAccount.id,
            email: emailAccount.email,
            clientId: emailAccount.clientId,
            refreshToken: emailAccount.refreshToken!,
            autoAssigned: false,
            fetchStrategy: emailAccount.fetchStrategy,
        };

        try {
            const result = await mailService.getEmails(credentials, {
                mailbox: input.mailbox,
                socks5: input.socks5,
                http: input.http,
            });

            await mailService.updateEmailStatus(credentials.id, true);

            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.MAIL_ALL,
                request.apiKey.id,
                credentials.id,
                request.ip,
                200,
                Date.now() - startTime,
                request.id
            );

            return {
                success: true,
                data: result,
                email: credentials.email,
            };
        } catch (err: unknown) {
            await mailService.updateEmailStatus(credentials.id, false, getErrorMessage(err));
            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.MAIL_ALL,
                request.apiKey.id,
                credentials.id,
                request.ip,
                500,
                Date.now() - startTime,
                request.id
            );
            throw err;
        }
    });

    // ========================================
    // Clear mailbox (email address required)
    // ========================================
    fastify.all('/process-mailbox', async (request) => {
        const startTime = Date.now();
        const input = mailRequestSchema.parse(
            request.method === 'GET' ? request.query : request.body
        );

        if (!request.apiKey?.id) {
            throw new AppError('AUTH_REQUIRED', 'API Key required', 401);
        }
        fastify.assertApiPermission(request, MAIL_LOG_ACTIONS.PROCESS_MAILBOX);

        const emailAccount = await emailService.getByEmail(input.email);
        if (!emailAccount) {
            throw new AppError('EMAIL_NOT_FOUND', 'Email account not found', 404);
        }
        await poolService.assertEmailAccessible(request.apiKey.id, emailAccount.id, emailAccount.groupId ?? null);

        const credentials = {
            id: emailAccount.id,
            email: emailAccount.email,
            clientId: emailAccount.clientId,
            refreshToken: emailAccount.refreshToken!,
            autoAssigned: false,
            fetchStrategy: emailAccount.fetchStrategy,
        };

        try {
            const result = await mailService.processMailbox(credentials, {
                mailbox: input.mailbox,
                socks5: input.socks5,
                http: input.http,
            });

            await mailService.updateEmailStatus(credentials.id, true);

            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.PROCESS_MAILBOX,
                request.apiKey.id,
                credentials.id,
                request.ip,
                200,
                Date.now() - startTime,
                request.id
            );

            return {
                success: true,
                data: result,
                email: credentials.email,
            };
        } catch (err: unknown) {
            await mailService.updateEmailStatus(credentials.id, false, getErrorMessage(err));
            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.PROCESS_MAILBOX,
                request.apiKey.id,
                credentials.id,
                request.ip,
                500,
                Date.now() - startTime,
                request.id
            );
            throw err;
        }
    });

    // ========================================
    // List ACTIVE system emails (supports group filtering)
    // ========================================
    fastify.all('/list-emails', async (request) => {
        const startTime = Date.now();
        try {
            if (!request.apiKey?.id) {
                throw new AppError('AUTH_REQUIRED', 'API Key required', 401);
            }
            fastify.assertApiPermission(request, MAIL_LOG_ACTIONS.LIST_EMAILS);

            const groupName = getGroupNameFromRequest(request.method, request.query, request.body);

            const result = await emailService.list({ page: 1, pageSize: 1000, status: 'ACTIVE', groupName });
            const scope = await poolService.getApiKeyScope(request.apiKey.id);
            const scopedEmails = result.list.filter((emailItem: { id: number; groupId: number | null }) => {
                if (scope.allowedGroupIds && (!emailItem.groupId || !scope.allowedGroupIds.includes(emailItem.groupId))) {
                    return false;
                }
                if (scope.allowedEmailIds && !scope.allowedEmailIds.includes(emailItem.id)) {
                    return false;
                }
                return true;
            });

            const emails = scopedEmails.map((emailItem: { email: string; status: string; group?: { name: string } | null }) => ({
                email: emailItem.email,
                status: emailItem.status,
                group: emailItem.group?.name || null,
            }));

            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.LIST_EMAILS,
                request.apiKey.id,
                undefined,
                request.ip,
                200,
                Date.now() - startTime,
                request.id
            );

            return {
                success: true,
                data: {
                    total: emails.length,
                    emails: emails,
                },
            };
        } catch (err: unknown) {
            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.LIST_EMAILS,
                request.apiKey?.id,
                undefined,
                request.ip,
                getErrorStatusCode(err),
                Date.now() - startTime,
                request.id
            );
            throw err;
        }
    });

    // ========================================
    // Email pool statistics (supports group filtering)
    // ========================================
    fastify.all('/pool-stats', async (request) => {
        const startTime = Date.now();
        try {
            if (!request.apiKey?.id) {
                throw new AppError('AUTH_REQUIRED', 'API Key required', 401);
            }
            fastify.assertApiPermission(request, MAIL_LOG_ACTIONS.POOL_STATS);
            const groupName = getGroupNameFromRequest(request.method, request.query, request.body);
            const stats = await poolService.getStats(request.apiKey.id, groupName);

            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.POOL_STATS,
                request.apiKey.id,
                undefined,
                request.ip,
                200,
                Date.now() - startTime,
                request.id
            );

            return { success: true, data: stats };
        } catch (err: unknown) {
            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.POOL_STATS,
                request.apiKey?.id,
                undefined,
                request.ip,
                getErrorStatusCode(err),
                Date.now() - startTime,
                request.id
            );
            throw err;
        }
    });

    // ========================================
    // Reset email pool (supports group filtering)
    // ========================================
    fastify.all('/reset-pool', async (request) => {
        const startTime = Date.now();
        try {
            if (!request.apiKey?.id) {
                throw new AppError('AUTH_REQUIRED', 'API Key required', 401);
            }
            fastify.assertApiPermission(request, MAIL_LOG_ACTIONS.POOL_RESET);
            const groupName = getGroupNameFromRequest(request.method, request.query, request.body);
            await poolService.reset(request.apiKey.id, groupName);

            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.POOL_RESET,
                request.apiKey.id,
                undefined,
                request.ip,
                200,
                Date.now() - startTime,
                request.id
            );

            return { success: true, data: { message: `Pool reset successfully${groupName ? ` for group '${groupName}'` : ''}` } };
        } catch (err: unknown) {
            await mailService.logApiCall(
                MAIL_LOG_ACTIONS.POOL_RESET,
                request.apiKey?.id,
                undefined,
                request.ip,
                getErrorStatusCode(err),
                Date.now() - startTime,
                request.id
            );
            throw err;
        }
    });
};

export default mailRoutes;
