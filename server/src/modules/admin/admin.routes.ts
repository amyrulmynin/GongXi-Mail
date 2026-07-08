import { type FastifyPluginAsync } from 'fastify';
import { adminService } from './admin.service.js';
import { createAdminSchema, updateAdminSchema, listAdminSchema } from './admin.schema.js';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
    // All routes require JWT authentication + super admin privileges
    fastify.addHook('preHandler', fastify.authenticateJwt);
    fastify.addHook('preHandler', fastify.requireSuperAdmin);

    // List
    fastify.get('/', async (request) => {
        const input = listAdminSchema.parse(request.query);
        const result = await adminService.list(input);
        return { success: true, data: result };
    });

    // Details
    fastify.get('/:id', async (request) => {
        const { id } = request.params as { id: string };
        const admin = await adminService.getById(parseInt(id));
        return { success: true, data: admin };
    });

    // Create
    fastify.post('/', async (request) => {
        const input = createAdminSchema.parse(request.body);
        const admin = await adminService.create(input);
        request.log.info({
            systemEvent: true,
            action: 'admin.create',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            targetAdminId: admin.id,
            targetUsername: admin.username,
            role: admin.role,
        }, 'Admin created');
        return { success: true, data: admin };
    });

    // Update
    fastify.put('/:id', async (request) => {
        const { id } = request.params as { id: string };
        const input = updateAdminSchema.parse(request.body);
        const admin = await adminService.update(parseInt(id), input);
        request.log.info({
            systemEvent: true,
            action: 'admin.update',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            targetAdminId: admin.id,
            targetUsername: admin.username,
            role: admin.role,
            status: admin.status,
        }, 'Admin updated');
        return { success: true, data: admin };
    });

    // Delete
    fastify.delete('/:id', async (request) => {
        const { id } = request.params as { id: string };
        await adminService.delete(parseInt(id));
        request.log.info({
            systemEvent: true,
            action: 'admin.delete',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            targetAdminId: parseInt(id),
        }, 'Admin deleted');
        return { success: true, data: { message: 'Admin deleted' } };
    });
};

export default adminRoutes;
