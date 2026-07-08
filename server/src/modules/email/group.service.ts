import prisma from '../../lib/prisma.js';
import { AppError } from '../../plugins/error.js';
import type { CreateGroupInput, UpdateGroupInput } from './group.schema.js';

export const groupService = {
    /**
     * Get all groups (with email counts)
     */
    async list() {
        const groups = await prisma.emailGroup.findMany({
            include: {
                _count: { select: { emails: true } },
            },
            orderBy: { id: 'asc' },
        });

        return groups.map((g: { id: number; name: string; description: string | null; fetchStrategy: string; _count: { emails: number }; createdAt: Date; updatedAt: Date }) => ({
            id: g.id,
            name: g.name,
            description: g.description,
            fetchStrategy: g.fetchStrategy,
            emailCount: g._count.emails,
            createdAt: g.createdAt,
            updatedAt: g.updatedAt,
        }));
    },

    /**
     * Get group details by ID
     */
    async getById(id: number) {
        const group = await prisma.emailGroup.findUnique({
            where: { id },
            include: {
                _count: { select: { emails: true } },
                emails: {
                    select: { id: true, email: true, status: true },
                    orderBy: { id: 'asc' },
                },
            },
        });

        if (!group) {
            throw new AppError('GROUP_NOT_FOUND', 'Email group not found', 404);
        }

        return group;
    },

    /**
     * Get group by name
     */
    async getByName(name: string) {
        return prisma.emailGroup.findUnique({ where: { name } });
    },

    /**
     * Create group
     */
    async create(input: CreateGroupInput) {
        const existing = await prisma.emailGroup.findUnique({
            where: { name: input.name },
        });

        if (existing) {
            throw new AppError('GROUP_EXISTS', 'Group name already exists', 409);
        }

        return prisma.emailGroup.create({
            data: {
                name: input.name,
                description: input.description,
                fetchStrategy: input.fetchStrategy,
            },
        });
    },

    /**
     * Update group
     */
    async update(id: number, input: UpdateGroupInput) {
        const group = await prisma.emailGroup.findUnique({ where: { id } });
        if (!group) {
            throw new AppError('GROUP_NOT_FOUND', 'Email group not found', 404);
        }

        if (input.name && input.name !== group.name) {
            const existing = await prisma.emailGroup.findUnique({
                where: { name: input.name },
            });
            if (existing) {
                throw new AppError('GROUP_EXISTS', 'Group name already exists', 409);
            }
        }

        return prisma.emailGroup.update({
            where: { id },
            data: input,
        });
    },

    /**
     * Delete group (sets groupId to null on linked emails)
     */
    async delete(id: number) {
        const group = await prisma.emailGroup.findUnique({ where: { id } });
        if (!group) {
            throw new AppError('GROUP_NOT_FOUND', 'Email group not found', 404);
        }

        // First set groupId to null for all emails in this group
        await prisma.emailAccount.updateMany({
            where: { groupId: id },
            data: { groupId: null },
        });

        await prisma.emailGroup.delete({ where: { id } });
        return { success: true };
    },

    /**
     * Assign emails to a group
     */
    async assignEmails(groupId: number, emailIds: number[]) {
        const group = await prisma.emailGroup.findUnique({ where: { id: groupId } });
        if (!group) {
            throw new AppError('GROUP_NOT_FOUND', 'Email group not found', 404);
        }

        const result = await prisma.emailAccount.updateMany({
            where: { id: { in: emailIds } },
            data: { groupId },
        });

        return { success: true, count: result.count };
    },

    /**
     * Remove emails from a group (sets groupId to null)
     */
    async removeEmails(groupId: number, emailIds: number[]) {
        const result = await prisma.emailAccount.updateMany({
            where: {
                id: { in: emailIds },
                groupId,
            },
            data: { groupId: null },
        });

        return { success: true, count: result.count };
    },
};
