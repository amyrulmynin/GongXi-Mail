import { type FastifyPluginAsync } from 'fastify';
import { groupService } from './group.service.js';
import { createGroupSchema, updateGroupSchema, assignEmailsSchema } from './group.schema.js';

const groupRoutes: FastifyPluginAsync = async (fastify) => {
    // All routes require admin authentication
    fastify.addHook('preHandler', fastify.authenticateJwt);

    // Get group list
    fastify.get('/', async () => {
        const groups = await groupService.list();
        return { success: true, data: groups };
    });

    // Get group details
    fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
        const id = parseInt(request.params.id, 10);
        const group = await groupService.getById(id);
        return { success: true, data: group };
    });

    // Create group
    fastify.post('/', async (request) => {
        const input = createGroupSchema.parse(request.body);
        const group = await groupService.create(input);
        request.log.info({
            systemEvent: true,
            action: 'email_group.create',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            groupId: group.id,
            name: group.name,
        }, 'Email group created');
        return { success: true, data: group };
    });

    // Update group
    fastify.put<{ Params: { id: string } }>('/:id', async (request) => {
        const id = parseInt(request.params.id, 10);
        const input = updateGroupSchema.parse(request.body);
        const group = await groupService.update(id, input);
        request.log.info({
            systemEvent: true,
            action: 'email_group.update',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            groupId: group.id,
            name: group.name,
        }, 'Email group updated');
        return { success: true, data: group };
    });

    // Delete group
    fastify.delete<{ Params: { id: string } }>('/:id', async (request) => {
        const id = parseInt(request.params.id, 10);
        const result = await groupService.delete(id);
        request.log.info({
            systemEvent: true,
            action: 'email_group.delete',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            groupId: id,
        }, 'Email group deleted');
        return { success: true, data: result };
    });

    // Assign emails to group
    fastify.post<{ Params: { id: string } }>('/:id/assign', async (request) => {
        const id = parseInt(request.params.id, 10);
        const input = assignEmailsSchema.parse(request.body);
        const result = await groupService.assignEmails(id, input.emailIds);
        request.log.info({
            systemEvent: true,
            action: 'email_group.assign',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            groupId: id,
            emailIds: input.emailIds,
            updatedCount: result.count,
        }, 'Emails assigned to group');
        return { success: true, data: result };
    });

    // Remove emails from group
    fastify.post<{ Params: { id: string } }>('/:id/remove', async (request) => {
        const id = parseInt(request.params.id, 10);
        const input = assignEmailsSchema.parse(request.body);
        const result = await groupService.removeEmails(id, input.emailIds);
        request.log.info({
            systemEvent: true,
            action: 'email_group.remove',
            actorId: request.user?.id ?? null,
            actorUsername: request.user?.username ?? null,
            groupId: id,
            emailIds: input.emailIds,
            updatedCount: result.count,
        }, 'Emails removed from group');
        return { success: true, data: result };
    });
};

export default groupRoutes;
