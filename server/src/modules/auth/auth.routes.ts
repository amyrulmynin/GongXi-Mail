import { type FastifyPluginAsync } from 'fastify';
import { authService } from './auth.service.js';
import { loginSchema, changePasswordSchema, verify2FaSchema, disable2FaSchema } from './auth.schema.js';

const authRoutes: FastifyPluginAsync = async (fastify) => {
    // Login
    fastify.post('/login', async (request, reply) => {
        const input = loginSchema.parse(request.body);
        const result = await authService.login(input, request.ip);

        // Set cookie
        reply.cookie('token', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7200, // 2 hours (seconds)
        });

        return { success: true, data: result };
    });

    // Logout
    fastify.post('/logout', async (request, reply) => {
        reply.clearCookie('token');
        return { success: true, data: { message: 'Logged out' } };
    });

    // Get current user
    fastify.get('/me', {
        preHandler: [fastify.authenticateJwt],
    }, async (request, _reply) => {
        const admin = await authService.getMe(request.user!.id);
        return { success: true, data: admin };
    });

    // Change password
    fastify.post('/change-password', {
        preHandler: [fastify.authenticateJwt],
    }, async (request, _reply) => {
        const input = changePasswordSchema.parse(request.body);
        await authService.changePassword(request.user!.id, input);
        request.log.info({
            systemEvent: true,
            action: 'auth.change_password',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
        }, 'Admin password changed');
        return { success: true, data: { message: 'Password changed' } };
    });

    // 2FA status
    fastify.get('/2fa/status', {
        preHandler: [fastify.authenticateJwt],
    }, async (request) => {
        const result = await authService.getTwoFactorStatus(request.user!.id);
        return { success: true, data: result };
    });

    // Generate 2FA binding info
    fastify.post('/2fa/setup', {
        preHandler: [fastify.authenticateJwt],
    }, async (request) => {
        const result = await authService.setupTwoFactor(request.user!.id);
        return { success: true, data: result };
    });

    // Enable 2FA
    fastify.post('/2fa/enable', {
        preHandler: [fastify.authenticateJwt],
    }, async (request) => {
        const input = verify2FaSchema.parse(request.body);
        const result = await authService.enableTwoFactor(request.user!.id, input);
        request.log.info({
            systemEvent: true,
            action: 'auth.2fa_enable',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
        }, 'Admin 2FA enabled');
        return { success: true, data: result };
    });

    // Disable 2FA
    fastify.post('/2fa/disable', {
        preHandler: [fastify.authenticateJwt],
    }, async (request) => {
        const input = disable2FaSchema.parse(request.body);
        const result = await authService.disableTwoFactor(request.user!.id, input);
        request.log.info({
            systemEvent: true,
            action: 'auth.2fa_disable',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
        }, 'Admin 2FA disabled');
        return { success: true, data: result };
    });
};

export default authRoutes;
