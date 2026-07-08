import React, { useCallback, useEffect, useState } from 'react';
import {
    Table,
    Button,
    Space,
    Modal,
    Form,
    Input,
    Select,
    message,
    Popconfirm,
    Tag,
    Typography,
    Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { adminApi } from '../../api';
import { useAuthStore } from '../../stores/authStore';
import { getAdminRoleLabel, getAdminStatusLabel, isSuperAdmin, normalizeAdminStatus } from '../../utils/auth';
import { getErrorMessage } from '../../utils/error';
import { requestData } from '../../utils/request';
import dayjs from 'dayjs';

const { Title } = Typography;

interface Admin {
    id: number;
    username: string;
    email: string | null;
    role: 'SUPER_ADMIN' | 'ADMIN';
    status: 'ACTIVE' | 'DISABLED';
    twoFactorEnabled: boolean;
    lastLoginAt: string | null;
    lastLoginIp: string | null;
    createdAt: string;
}

interface AdminListResult {
    list: Admin[];
    total: number;
}

const AdminsPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<Admin[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingTwoFactorEnabled, setEditingTwoFactorEnabled] = useState(false);
    const [form] = Form.useForm();
    const { admin: currentAdmin } = useAuthStore();

    const fetchData = useCallback(async () => {
        setLoading(true);
        const result = await requestData<AdminListResult>(
            () => adminApi.getList({ page, pageSize }),
            'Failed to fetch data'
        );
        if (result) {
            setData(result.list);
            setTotal(result.total);
        }
        setLoading(false);
    }, [page, pageSize]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchData();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchData]);

    const handleCreate = () => {
        setEditingId(null);
        setEditingTwoFactorEnabled(false);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (record: Admin) => {
        setEditingId(record.id);
        setEditingTwoFactorEnabled(record.twoFactorEnabled);
        form.setFieldsValue({
            username: record.username,
            email: record.email,
            role: record.role,
            status: record.status,
            twoFactorEnabled: record.twoFactorEnabled,
            password: '',
        });
        setModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        try {
            const res = await adminApi.delete(id);
            if (res.code === 200) {
                message.success('Deleted successfully');
                fetchData();
            } else {
                message.error(res.message);
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Delete failed'));
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();

            if (editingId) {
                // If password is empty, do not update it
                if (!values.password) {
                    delete values.password;
                }
                const res = await adminApi.update(editingId, values);
                if (res.code === 200) {
                    message.success('Updated successfully');
                    setModalVisible(false);
                    fetchData();
                } else {
                    message.error(res.message);
                }
            } else {
                const res = await adminApi.create(values);
                if (res.code === 200) {
                    message.success('Created successfully');
                    setModalVisible(false);
                    fetchData();
                } else {
                    message.error(res.message);
                }
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Save failed'));
        }
    };

    const columns: ColumnsType<Admin> = [
        {
            title: 'Username',
            dataIndex: 'username',
            key: 'username',
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            render: (val) => val || '-',
        },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            render: (role) => (
                <Tag color={isSuperAdmin(role) ? 'gold' : 'blue'}>
                    {getAdminRoleLabel(role)}
                </Tag>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status) => (
                <Tag color={normalizeAdminStatus(status) === 'ACTIVE' ? 'green' : 'red'}>
                    {getAdminStatusLabel(status)}
                </Tag>
            ),
        },
        {
            title: '2FA',
            dataIndex: 'twoFactorEnabled',
            key: 'twoFactorEnabled',
            render: (enabled: boolean) => (
                <Tag color={enabled ? 'green' : 'default'}>
                    {enabled ? 'Enabled' : 'Disabled'}
                </Tag>
            ),
        },
        {
            title: 'Last Login',
            dataIndex: 'lastLoginAt',
            key: 'lastLoginAt',
            render: (val, record) =>
                val ? (
                    <Tooltip title={`IP: ${record.lastLoginIp || 'Unknown'}`}>
                        {dayjs(val).format('YYYY-MM-DD HH:mm')}
                    </Tooltip>
                ) : (
                    '-'
                ),
        },
        {
            title: 'Created At',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (val) => dayjs(val).format('YYYY-MM-DD HH:mm'),
        },
        {
            title: 'Actions',
            key: 'action',
            width: 120,
            render: (_, record) => (
                <Space>
                    <Tooltip title="Edit">
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => handleEdit(record)}
                        />
                    </Tooltip>
                    {record.id !== currentAdmin?.id && (
                        <Tooltip title="Delete">
                            <Popconfirm
                                title="Are you sure you want to delete this admin?"
                                onConfirm={() => handleDelete(record.id)}
                            >
                                <Button type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                        </Tooltip>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>
                    Admin Management
                </Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                    Add Admin
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={data}
                rowKey="id"
                loading={loading}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    showTotal: (total) => `Total ${total} items`,
                    onChange: (p, ps) => {
                        setPage(p);
                        setPageSize(ps);
                    },
                }}
            />

            <Modal
                title={editingId ? 'Edit Admin' : 'Add Admin'}
                open={modalVisible}
                onOk={handleSubmit}
                onCancel={() => setModalVisible(false)}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="username"
                        label="Username"
                        rules={[
                            { required: true, message: 'Please enter username' },
                            { min: 3, message: 'Username must be at least 3 characters' },
                        ]}
                    >
                        <Input placeholder="Enter username" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Password"
                        rules={
                            editingId
                                ? []
                                : [
                                    { required: true, message: 'Please enter password' },
                                    { min: 6, message: 'Password must be at least 6 characters' },
                                ]
                        }
                    >
                        <Input.Password
                            placeholder={editingId ? 'Leave empty to keep current password' : 'Enter password'}
                        />
                    </Form.Item>
                    <Form.Item name="email" label="Email">
                        <Input placeholder="Optional" type="email" />
                    </Form.Item>
                    <Form.Item name="role" label="Role" initialValue="ADMIN">
                        <Select>
                            <Select.Option value="ADMIN">Admin</Select.Option>
                            <Select.Option value="SUPER_ADMIN">Super Admin</Select.Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="status" label="Status" initialValue="ACTIVE">
                        <Select>
                            <Select.Option value="ACTIVE">Enabled</Select.Option>
                            <Select.Option value="DISABLED">Disabled</Select.Option>
                        </Select>
                    </Form.Item>
                    {editingId && (
                        <Form.Item
                            name="twoFactorEnabled"
                            label="Two-Factor Auth (2FA)"
                            extra={!editingTwoFactorEnabled ? 'To enable 2FA, the admin must complete binding in Settings' : undefined}
                        >
                            <Select>
                                <Select.Option value={true} disabled={!editingTwoFactorEnabled}>Enabled</Select.Option>
                                <Select.Option value={false}>Disabled</Select.Option>
                            </Select>
                        </Form.Item>
                    )}
                </Form>
            </Modal>
        </div>
    );
};

export default AdminsPage;
