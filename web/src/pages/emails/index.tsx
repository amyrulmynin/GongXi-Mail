import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    Upload,
    Tooltip,
    List,
    Tabs,
    Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    UploadOutlined,
    DownloadOutlined,
    InboxOutlined,
    SearchOutlined,
    MailOutlined,
    GroupOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import { emailApi, groupApi } from '../../api';
import { getErrorMessage } from '../../utils/error';
import { requestData } from '../../utils/request';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;
const MAIL_FETCH_STRATEGY_OPTIONS = [
    { value: 'GRAPH_FIRST', label: 'Graph first (fall back to IMAP)' },
    { value: 'IMAP_FIRST', label: 'IMAP first (fall back to Graph)' },
    { value: 'GRAPH_ONLY', label: 'Graph only' },
    { value: 'IMAP_ONLY', label: 'IMAP only' },
] as const;

type MailFetchStrategy = (typeof MAIL_FETCH_STRATEGY_OPTIONS)[number]['value'];

const MAIL_FETCH_STRATEGY_LABELS: Record<MailFetchStrategy, string> = {
    GRAPH_FIRST: 'Graph first',
    IMAP_FIRST: 'IMAP first',
    GRAPH_ONLY: 'Graph only',
    IMAP_ONLY: 'IMAP only',
};

interface EmailGroup {
    id: number;
    name: string;
    description: string | null;
    fetchStrategy: MailFetchStrategy;
    emailCount: number;
    createdAt: string;
    updatedAt: string;
}

interface EmailAccount {
    id: number;
    email: string;
    clientId: string;
    status: 'ACTIVE' | 'ERROR' | 'DISABLED';
    groupId: number | null;
    group: { id: number; name: string } | null;
    lastCheckAt: string | null;
    tokenRefreshedAt: string | null;
    errorMessage: string | null;
    createdAt: string;
}

interface EmailListResult {
    list: EmailAccount[];
    total: number;
}

interface MailItem {
    id: string;
    from: string;
    subject: string;
    text: string;
    html: string;
    date: string;
}

interface EmailDetailsResult extends EmailAccount {
    refreshToken: string;
}

const EmailsPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<EmailAccount[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [importModalVisible, setImportModalVisible] = useState(false);
    const [mailModalVisible, setMailModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [keyword, setKeyword] = useState('');
    const [debouncedKeyword, setDebouncedKeyword] = useState('');
    const [filterGroupId, setFilterGroupId] = useState<number | undefined>(undefined);
    const [importContent, setImportContent] = useState('');
    const [separator, setSeparator] = useState('----');
    const [importGroupId, setImportGroupId] = useState<number | undefined>(undefined);
    const [mailList, setMailList] = useState<MailItem[]>([]);
    const [mailLoading, setMailLoading] = useState(false);
    const [currentEmail, setCurrentEmail] = useState<string>('');
    const [currentEmailId, setCurrentEmailId] = useState<number | null>(null);
    const [currentMailbox, setCurrentMailbox] = useState<string>('INBOX');
    const [emailDetailVisible, setEmailDetailVisible] = useState(false);
    const [emailDetailContent, setEmailDetailContent] = useState<string>('');
    const [emailDetailSubject, setEmailDetailSubject] = useState<string>('');
    const [emailEditLoading, setEmailEditLoading] = useState(false);
    const [form] = Form.useForm();

    // Group-related state
    const [groups, setGroups] = useState<EmailGroup[]>([]);
    const [groupModalVisible, setGroupModalVisible] = useState(false);
    const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
    const [groupForm] = Form.useForm();
    const [assignGroupModalVisible, setAssignGroupModalVisible] = useState(false);
    const [assignTargetGroupId, setAssignTargetGroupId] = useState<number | undefined>(undefined);
    const [refreshingTokenIds, setRefreshingTokenIds] = useState<Set<number>>(new Set());
    const [batchRefreshing, setBatchRefreshing] = useState(false);
    const latestListRequestIdRef = useRef(0);

    const toOptionalNumber = (value: unknown): number | undefined => {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    };

    const fetchGroups = useCallback(async () => {
        const result = await requestData<EmailGroup[]>(
            () => groupApi.getList(),
            'Failed to fetch groups',
            { silent: true }
        );
        if (result) {
            setGroups(result);
        }
    }, []);

    const fetchData = useCallback(async () => {
        const currentRequestId = ++latestListRequestIdRef.current;
        setLoading(true);
        const params: { page: number; pageSize: number; keyword: string; groupId?: number } = { page, pageSize, keyword: debouncedKeyword };
        if (filterGroupId !== undefined) params.groupId = filterGroupId;

        const result = await requestData<EmailListResult>(
            () => emailApi.getList(params),
            'Failed to fetch data'
        );
        if (currentRequestId !== latestListRequestIdRef.current) {
            return;
        }
        if (result) {
            setData(result.list);
            setTotal(result.total);
        }
        setLoading(false);
    }, [debouncedKeyword, filterGroupId, page, pageSize]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchGroups();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchGroups]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedKeyword(keyword.trim());
        }, 300);
        return () => window.clearTimeout(timer);
    }, [keyword]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchData();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchData]);

    const handleCreate = () => {
        setEditingId(null);
        setEmailEditLoading(false);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = useCallback(async (record: EmailAccount) => {
        setEditingId(record.id);
        setEmailEditLoading(true);
        form.resetFields();
        setModalVisible(true);
        try {
            const res = await emailApi.getById<EmailDetailsResult>(record.id, true);
            if (res.code === 200) {
                const details = res.data;
                form.setFieldsValue({
                    email: details.email,
                    clientId: details.clientId,
                    refreshToken: details.refreshToken,
                    status: details.status,
                    groupId: details.groupId,
                });
            }
        } catch {
            message.error('Failed to fetch details');
        } finally {
            setEmailEditLoading(false);
        }
    }, [form]);

    const handleDelete = useCallback(async (id: number) => {
        try {
            const res = await emailApi.delete(id);
            if (res.code === 200) {
                message.success('Deleted successfully');
                fetchData();
                fetchGroups();
            } else {
                message.error(res.message);
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Delete failed'));
        }
    }, [fetchData, fetchGroups]);

    const handleBatchDelete = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('Please select emails to delete');
            return;
        }

        try {
            const res = await emailApi.batchDelete(selectedRowKeys as number[]);
            if (res.code === 200) {
                message.success(`Successfully deleted ${res.data.deleted} emails`);
                setSelectedRowKeys([]);
                fetchData();
                fetchGroups();
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
            const normalizedGroupId =
                values.groupId === null ? null : toOptionalNumber(values.groupId);

            if (editingId) {
                const submitData = {
                    ...values,
                    groupId: normalizedGroupId ?? null,
                };
                const res = await emailApi.update(editingId, submitData);
                if (res.code === 200) {
                    message.success('Updated successfully');
                    setModalVisible(false);
                    fetchData();
                    fetchGroups();
                } else {
                    message.error(res.message);
                }
            } else {
                const submitData = {
                    ...values,
                    groupId: toOptionalNumber(values.groupId),
                };
                const res = await emailApi.create(submitData);
                if (res.code === 200) {
                    message.success('Created successfully');
                    setModalVisible(false);
                    fetchData();
                    fetchGroups();
                } else {
                    message.error(res.message);
                }
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Save failed'));
        }
    };

    const handleImport = async () => {
        if (!importContent.trim()) {
            message.warning('Please enter or paste email data');
            return;
        }

        try {
            const res = await emailApi.import(
                importContent,
                separator,
                toOptionalNumber(importGroupId)
            );
            if (res.code === 200) {
                message.success(res.message);
                setImportModalVisible(false);
                setImportContent('');
                setImportGroupId(undefined);
                fetchData();
                fetchGroups();
            } else {
                message.error(res.message);
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Import failed'));
        }
    };

    const handleExport = async () => {
        try {
            const ids = selectedRowKeys.length > 0 ? selectedRowKeys as number[] : undefined;
            const groupId = ids ? undefined : toOptionalNumber(filterGroupId);
            const res = await emailApi.export(ids, separator, groupId);
            if (res.code !== 200) {
                message.error(res.message || 'Export failed');
                return;
            }
            const content = res.data?.content || '';

            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'email_accounts.txt';
            a.click();
            URL.revokeObjectURL(url);

            message.success('Export successful');
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Export failed'));
        }
    };

    const loadMails = useCallback(async (emailId: number, mailbox: string, showSuccessToast: boolean = false) => {
        setMailLoading(true);
        const result = await requestData<{ messages: MailItem[] }>(
            () => emailApi.viewMails(emailId, mailbox),
            'Failed to fetch emails'
        );
        if (result) {
            setMailList(result.messages || []);
            fetchData();
            if (showSuccessToast) {
                message.success('Refreshed successfully');
            }
        }
        setMailLoading(false);
    }, [fetchData]);

    const handleViewMails = useCallback(async (record: EmailAccount, mailbox: string) => {
        setCurrentEmail(record.email);
        setCurrentEmailId(record.id);
        setCurrentMailbox(mailbox);
        setMailModalVisible(true);
        await loadMails(record.id, mailbox);
    }, [loadMails]);

    const handleRefreshMails = async () => {
        if (!currentEmailId) return;
        await loadMails(currentEmailId, currentMailbox, true);
    };

    const handleClearMailbox = async () => {
        if (!currentEmailId) return;
        try {
            const res = await emailApi.clearMailbox(currentEmailId, currentMailbox);
            if (res.code === 200) {
                message.success(`Cleared ${res.data?.deletedCount || 0} emails`);
                setMailList([]);
                fetchData();
            } else {
                message.error(res.message || 'Clear failed');
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Clear failed'));
        }
    };

    // ========================================
    // Token refresh handlers
    // ========================================
    const handleRefreshToken = useCallback(async (record: EmailAccount) => {
        setRefreshingTokenIds(prev => new Set(prev).add(record.id));
        try {
            const res = await emailApi.refreshSingleToken(record.id);
            if (res.code === 200 && res.data?.success) {
                message.success(`${record.email} Token refreshed`);
                fetchData();
            } else {
                message.error(res.data?.message || 'Token refresh failed');
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Token refresh failed'));
        } finally {
            setRefreshingTokenIds(prev => {
                const next = new Set(prev);
                next.delete(record.id);
                return next;
            });
        }
    }, [fetchData]);

    const handleBatchRefreshTokens = async () => {
        setBatchRefreshing(true);
        try {
            const res = await emailApi.refreshTokens(filterGroupId);
            if (res.code === 200) {
                message.success('Batch token refresh started. Refresh the page later to see results');
            } else {
                message.error(res.message || 'Start failed');
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Start failed'));
        } finally {
            setBatchRefreshing(false);
        }
    };

    const handleViewEmailDetail = (record: MailItem) => {
        setEmailDetailSubject(record.subject || '(No subject)');
        setEmailDetailContent(record.html || record.text || '(No content)');
        setEmailDetailVisible(true);
    };

    // ========================================
    // Group CRUD handlers
    // ========================================
    const handleCreateGroup = () => {
        setEditingGroupId(null);
        groupForm.resetFields();
        groupForm.setFieldsValue({ fetchStrategy: 'GRAPH_FIRST' });
        setGroupModalVisible(true);
    };

    const handleEditGroup = useCallback((group: EmailGroup) => {
        setEditingGroupId(group.id);
        groupForm.setFieldsValue({
            name: group.name,
            description: group.description,
            fetchStrategy: group.fetchStrategy,
        });
        setGroupModalVisible(true);
    }, [groupForm]);

    const handleDeleteGroup = useCallback(async (id: number) => {
        try {
            const res = await groupApi.delete(id);
            if (res.code === 200) {
                message.success('Group deleted');
                fetchGroups();
                fetchData();
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Delete failed'));
        }
    }, [fetchData, fetchGroups]);

    const handleGroupSubmit = async () => {
        try {
            const values = await groupForm.validateFields();
            if (editingGroupId) {
                const res = await groupApi.update(editingGroupId, values);
                if (res.code === 200) {
                    message.success('Group updated');
                    setGroupModalVisible(false);
                    fetchGroups();
                }
            } else {
                const res = await groupApi.create(values);
                if (res.code === 200) {
                    message.success('Group created');
                    setGroupModalVisible(false);
                    fetchGroups();
                }
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Failed to save group'));
        }
    };

    const handleBatchAssignGroup = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('Please select emails first');
            return;
        }
        if (!assignTargetGroupId) {
            message.warning('Please select a target group');
            return;
        }
        try {
            const res = await groupApi.assignEmails(assignTargetGroupId, selectedRowKeys as number[]);
            if (res.code === 200) {
                message.success(`Assigned ${res.data.count} emails to group`);
                setAssignGroupModalVisible(false);
                setAssignTargetGroupId(undefined);
                setSelectedRowKeys([]);
                fetchData();
                fetchGroups();
            }
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Assign failed'));
        }
    };

    const handleBatchRemoveGroup = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('Please select emails first');
            return;
        }
        // Find the groupIds of selected emails, remove from each group
        const selectedEmails = data.filter((e: EmailAccount) => selectedRowKeys.includes(e.id));
        const groupIds = [...new Set(selectedEmails.map((e: EmailAccount) => e.groupId).filter(Boolean))] as number[];

        try {
            for (const gid of groupIds) {
                const emailIds = selectedEmails.filter((e: EmailAccount) => e.groupId === gid).map((e: EmailAccount) => e.id);
                await groupApi.removeEmails(gid, emailIds);
            }
            message.success('Selected emails removed from group');
            setSelectedRowKeys([]);
            fetchData();
            fetchGroups();
        } catch (err: unknown) {
            message.error(getErrorMessage(err, 'Remove failed'));
        }
    };

    // ========================================
    // Email table columns
    // ========================================
    const columns: ColumnsType<EmailAccount> = useMemo(() => [
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            ellipsis: true,
        },
        {
            title: 'Client ID',
            dataIndex: 'clientId',
            key: 'clientId',
            ellipsis: true,
        },
        {
            title: 'Group',
            dataIndex: 'group',
            key: 'group',
            width: 120,
            render: (group: EmailAccount['group']) =>
                group ? <Tag color="blue">{group.name}</Tag> : <Tag>Ungrouped</Tag>,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string) => {
                const colors: Record<string, string> = {
                    ACTIVE: 'green',
                    ERROR: 'red',
                    DISABLED: 'default',
                };
                const labels: Record<string, string> = {
                    ACTIVE: 'Active',
                    ERROR: 'Error',
                    DISABLED: 'Disabled',
                };
                return <Tag color={colors[status]}>{labels[status]}</Tag>;
            },
        },
        {
            title: 'Last Check',
            dataIndex: 'lastCheckAt',
            key: 'lastCheckAt',
            width: 160,
            render: (val: string | null) => (val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-'),
        },
        {
            title: 'Token Refreshed',
            dataIndex: 'tokenRefreshedAt',
            key: 'tokenRefreshedAt',
            width: 160,
            render: (val: string | null) => (val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-'),
        },
        {
            title: 'Created At',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm'),
        },
        {
            title: 'Actions',
            key: 'action',
            width: 240,
            render: (_: unknown, record: EmailAccount) => (
                <Space>
                    <Tooltip title="Refresh Token">
                        <Button
                            type="text"
                            icon={<SyncOutlined spin={refreshingTokenIds.has(record.id)} />}
                            onClick={() => handleRefreshToken(record)}
                            disabled={refreshingTokenIds.has(record.id) || record.status === 'DISABLED'}
                        />
                    </Tooltip>
                    <Tooltip title="Inbox">
                        <Button
                            type="text"
                            icon={<MailOutlined />}
                            onClick={() => handleViewMails(record, 'INBOX')}
                        />
                    </Tooltip>
                    <Tooltip title="Junk">
                        <Button
                            type="text"
                            icon={<DeleteOutlined style={{ color: '#faad14' }} />}
                            onClick={() => handleViewMails(record, 'Junk')}
                        />
                    </Tooltip>
                    <Tooltip title="Edit">
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => handleEdit(record)}
                        />
                    </Tooltip>
                    <Tooltip title="Delete">
                        <Popconfirm
                            title="Are you sure you want to delete this email?"
                            onConfirm={() => handleDelete(record.id)}
                        >
                            <Button type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ], [handleDelete, handleEdit, handleRefreshToken, handleViewMails, refreshingTokenIds]);

    const rowSelection = useMemo(
        () => ({
            selectedRowKeys,
            onChange: setSelectedRowKeys,
        }),
        [selectedRowKeys]
    );

    const tablePagination = useMemo(
        () => ({
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `Total ${count} items`,
            onChange: (currentPage: number, currentPageSize: number) => {
                setPage(currentPage);
                setPageSize(currentPageSize);
            },
        }),
        [page, pageSize, total]
    );

    const emailDetailSrcDoc = useMemo(
        () => `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="utf-8">
                            <style>
                                body { 
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                                    font-size: 14px;
                                    line-height: 1.6;
                                    color: #333;
                                    margin: 0;
                                    padding: 16px;
                                    background: #fafafa;
                                }
                                img { max-width: 100%; height: auto; }
                                a { color: #1890ff; }
                            </style>
                        </head>
                        <body>${emailDetailContent}</body>
                        </html>
                    `,
        [emailDetailContent]
    );

    const groupFilterOptions = useMemo(
        () =>
            groups.map((group: EmailGroup) => ({
                value: group.id,
                label: `${group.name} (${group.emailCount})`,
            })),
        [groups]
    );

    const groupOptions = useMemo(
        () =>
            groups.map((group: EmailGroup) => ({
                value: group.id,
                label: group.name,
            })),
        [groups]
    );

    // ========================================
    // Group table columns
    // ========================================
    const groupColumns: ColumnsType<EmailGroup> = useMemo(() => [
        {
            title: 'Group Name',
            dataIndex: 'name',
            key: 'name',
            render: (name: string) => <Tag color="blue">{name}</Tag>,
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            render: (val: string | null) => val || '-',
        },
        {
            title: 'Fetch Strategy',
            dataIndex: 'fetchStrategy',
            key: 'fetchStrategy',
            width: 190,
            render: (value: MailFetchStrategy) => <Tag color="purple">{MAIL_FETCH_STRATEGY_LABELS[value]}</Tag>,
        },
        {
            title: 'Emails',
            dataIndex: 'emailCount',
            key: 'emailCount',
            width: 100,
        },
        {
            title: 'Created At',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 180,
            render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm'),
        },
        {
            title: 'Actions',
            key: 'action',
            width: 160,
            render: (_: unknown, record: EmailGroup) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEditGroup(record)}
                    />
                    <Popconfirm
                        title="Deleting a group will make its emails ungrouped. Confirm?"
                        onConfirm={() => handleDeleteGroup(record.id)}
                    >
                        <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ], [handleDeleteGroup, handleEditGroup]);

    // ========================================
    // Render
    // ========================================
    return (
        <div>
            <Title level={4} style={{ margin: '0 0 16px' }}>Email Management</Title>
            <Tabs
                defaultActiveKey="emails"
                animated={false}
                destroyInactiveTabPane
                items={[
                    {
                        key: 'emails',
                        label: 'Email List',
                        children: (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                                    <Space wrap>
                                        <Input
                                            placeholder="Search emails"
                                            prefix={<SearchOutlined />}
                                            value={keyword}
                                            onChange={(e) => setKeyword(e.target.value)}
                                            style={{ width: 200 }}
                                            allowClear
                                        />
                                        <Select
                                            placeholder="Filter by group"
                                            allowClear
                                            style={{ width: 160 }}
                                            value={filterGroupId}
                                            options={groupFilterOptions}
                                            onChange={(val: number | string | undefined) => {
                                                setFilterGroupId(toOptionalNumber(val));
                                                setPage(1);
                                            }}
                                        />
                                    </Space>
                                    <Space wrap>
                                        <Button
                                            icon={<SyncOutlined spin={batchRefreshing} />}
                                            onClick={handleBatchRefreshTokens}
                                            loading={batchRefreshing}
                                        >
                                            Refresh All Tokens
                                        </Button>
                                        <Button icon={<UploadOutlined />} onClick={() => setImportModalVisible(true)}>
                                            Import
                                        </Button>
                                        <Button icon={<DownloadOutlined />} onClick={handleExport}>
                                            Export
                                        </Button>
                                        {selectedRowKeys.length > 0 && (
                                            <>
                                                <Button icon={<GroupOutlined />} onClick={() => setAssignGroupModalVisible(true)}>
                                                    Assign to Group ({selectedRowKeys.length})
                                                </Button>
                                                <Button onClick={handleBatchRemoveGroup}>
                                                    Remove from Group ({selectedRowKeys.length})
                                                </Button>
                                                <Popconfirm
                                                    title={`Delete ${selectedRowKeys.length} selected emails?`}
                                                    onConfirm={handleBatchDelete}
                                                >
                                                    <Button danger>Batch Delete ({selectedRowKeys.length})</Button>
                                                </Popconfirm>
                                            </>
                                        )}
                                        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                                            Add Email
                                        </Button>
                                    </Space>
                                </div>

                                <Table
                                    columns={columns}
                                    dataSource={data}
                                    rowKey="id"
                                    loading={loading}
                                    rowSelection={rowSelection}
                                    pagination={tablePagination}
                                    virtual
                                    scroll={{ y: 560, x: 1200 }}
                                />
                            </>
                        ),
                    },
                    {
                        key: 'groups',
                        label: 'Email Groups',
                        children: (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                                    <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateGroup}>
                                        Create Group
                                    </Button>
                                </div>
                                <Table
                                    columns={groupColumns}
                                    dataSource={groups}
                                    rowKey="id"
                                    pagination={false}
                                />
                            </>
                        ),
                    },
                ]}
            />

            {/* Add/Edit Email Modal */}
            <Modal
                title={editingId ? 'Edit Email' : 'Add Email'}
                open={modalVisible}
                onOk={handleSubmit}
                onCancel={() => setModalVisible(false)}
                destroyOnClose
                width={600}
            >
                <Spin spinning={emailEditLoading}>
                    <Form form={form} layout="vertical">
                    <Form.Item name="email" label="Email Address" rules={[{ required: true, message: 'Please enter email address' }, { type: 'email', message: 'Please enter a valid email address' }]}>
                        <Input placeholder="example@outlook.com" />
                    </Form.Item>
                    <Form.Item name="password" label="Password">
                        <Input.Password placeholder="Optional" />
                    </Form.Item>

                    <Form.Item
                        name="clientId"
                        label="Client ID"
                        rules={[{ required: true, message: 'Please enter client ID' }]}
                    >
                        <Input placeholder="Azure AD application ID" />
                    </Form.Item>
                    <Form.Item
                        name="refreshToken"
                        label="Refresh Token"
                        rules={[{ required: !editingId, message: 'Please enter refresh token' }]}
                    >
                        <TextArea rows={4} placeholder="OAuth2 Refresh Token" />
                    </Form.Item>
                    <Form.Item name="groupId" label="Group">
                        <Select placeholder="Optional: select group" allowClear options={groupOptions} />
                    </Form.Item>
                    <Form.Item name="status" label="Status" initialValue="ACTIVE">
                        <Select>
                            <Select.Option value="ACTIVE">Active</Select.Option>
                            <Select.Option value="DISABLED">Disabled</Select.Option>
                        </Select>
                    </Form.Item>
                    </Form>
                </Spin>
            </Modal>

            {/* Batch Import Modal */}
            <Modal
                title="Batch Import Emails"
                open={importModalVisible}
                onOk={handleImport}
                onCancel={() => setImportModalVisible(false)}
                destroyOnClose
                width={700}
            >
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div>
                        <Text type="secondary">
                            Upload a file or paste content. Multiple formats are supported; auto-parsing will be attempted.
                            <br />
                            Recommended format: email{separator}password{separator}clientId{separator}refreshToken
                        </Text>
                    </div>
                    <Input
                        addonBefore="Separator"
                        value={separator}
                        onChange={(e) => setSeparator(e.target.value)}
                        style={{ width: 200 }}
                    />
                    <Select
                        placeholder="Import to group (optional)"
                        allowClear
                        value={importGroupId}
                        options={groupOptions}
                        onChange={(value: number | string | undefined) => setImportGroupId(toOptionalNumber(value))}
                        style={{ width: 260 }}
                    />
                    <Dragger
                        beforeUpload={(file) => {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                const fileContent = e.target?.result as string;
                                if (fileContent) {
                                    const lines = fileContent.split(/\r?\n/).filter((line: string) => line.trim());
                                    const processedLines = lines.map((line: string) => {
                                        const parts = line.split(separator);
                                        if (parts.length >= 5) {
                                            return `${parts[0]}${separator}${parts[1]}${separator}${parts[4]}`;
                                        }
                                        return line;
                                    });

                                    setImportContent(processedLines.join('\n'));
                                    message.success(`File read successfully, parsed ${lines.length} lines`);
                                }
                            };
                            reader.readAsText(file);
                            return false;
                        }}
                        showUploadList={false}
                        maxCount={1}
                        accept=".txt,.csv"
                    >
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">Click or drag file to this area</p>
                        <p className="ant-upload-hint">Supports .txt or .csv files</p>
                    </Dragger>
                    <TextArea
                        rows={12}
                        value={importContent}
                        onChange={(e) => setImportContent(e.target.value)}
                        placeholder={`example@outlook.com${separator}client_id${separator}refresh_token`}
                    />
                </Space>
            </Modal>

            {/* Email List Modal */}
            {mailModalVisible && (
                <Modal
                    title={`${currentMailbox === 'INBOX' ? 'Inbox' : 'Junk'} - ${currentEmail}`}
                    open={mailModalVisible}
                    onCancel={() => setMailModalVisible(false)}
                    footer={null}
                    destroyOnClose
                    width={1000}
                    styles={{ body: { padding: '16px 24px' } }}
                >
                    <Space style={{ marginBottom: 16 }}>
                        <Button type="primary" onClick={handleRefreshMails} loading={mailLoading}>
                            Fetch New Emails
                        </Button>
                        <Popconfirm
                            title={`Clear all emails in ${currentMailbox === 'INBOX' ? 'Inbox' : 'Junk'}?`}
                            onConfirm={handleClearMailbox}
                        >
                            <Button danger>Clear</Button>
                        </Popconfirm>
                        <span style={{ marginLeft: 16, color: '#888' }}>
                            {mailList.length} emails
                        </span>
                    </Space>
                    <List
                        loading={mailLoading}
                        dataSource={mailList}
                        itemLayout="horizontal"
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: true,
                            showQuickJumper: true,
                            showTotal: (total: number) => `Total ${total} items`,
                            style: { marginTop: 16 },
                        }}
                        style={{ maxHeight: 450, overflow: 'auto' }}
                        renderItem={(item: MailItem) => (
                            <List.Item
                                key={item.id}
                                actions={[
                                    <Button
                                        type="primary"
                                        size="small"
                                        onClick={() => handleViewEmailDetail(item)}
                                    >
                                        View
                                    </Button>,
                                ]}
                            >
                                <List.Item.Meta
                                    title={
                                        <Typography.Text ellipsis style={{ maxWidth: 600 }}>
                                            {item.subject || '(No subject)'}
                                        </Typography.Text>
                                    }
                                    description={
                                        <Space size="large">
                                            <span style={{ color: '#1890ff' }}>{item.from || 'Unknown sender'}</span>
                                            <span style={{ color: '#999' }}>
                                                {item.date ? dayjs(item.date).format('YYYY-MM-DD HH:mm') : '-'}
                                            </span>
                                        </Space>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                </Modal>
            )}

            {/* Email Detail Modal */}
            {emailDetailVisible && (
                <Modal
                    title={emailDetailSubject}
                    open={emailDetailVisible}
                    onCancel={() => setEmailDetailVisible(false)}
                    footer={null}
                    destroyOnClose
                    width={900}
                    styles={{ body: { padding: '16px 24px' } }}
                >
                    <iframe
                        title="email-content"
                        sandbox="allow-same-origin"
                        srcDoc={emailDetailSrcDoc}
                        style={{
                            width: '100%',
                            height: 'calc(100vh - 300px)',
                            border: '1px solid #eee',
                            borderRadius: '8px',
                            backgroundColor: '#fafafa',
                        }}
                    />
                </Modal>
            )}

            {/* Create/Edit Group Modal */}
            <Modal
                title={editingGroupId ? 'Edit Group' : 'Create Group'}
                open={groupModalVisible}
                onOk={handleGroupSubmit}
                onCancel={() => setGroupModalVisible(false)}
                destroyOnClose
                width={460}
            >
                <Form form={groupForm} layout="vertical">
                    <Form.Item name="name" label="Group Name" rules={[{ required: true, message: 'Please enter group name' }]}>
                        <Input placeholder="e.g. aws, discord" />
                    </Form.Item>
                    <Form.Item name="description" label="Description">
                        <Input placeholder="Optional description" />
                    </Form.Item>
                    <Form.Item
                        name="fetchStrategy"
                        label="Mail Fetch Strategy"
                        rules={[{ required: true, message: 'Please select a fetch strategy' }]}
                    >
                        <Select options={MAIL_FETCH_STRATEGY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Batch Assign Group Modal */}
            <Modal
                title="Assign Emails to Group"
                open={assignGroupModalVisible}
                onOk={handleBatchAssignGroup}
                onCancel={() => setAssignGroupModalVisible(false)}
                destroyOnClose
                width={400}
            >
                <p>{selectedRowKeys.length} emails selected</p>
                <Select
                    placeholder="Select target group"
                    style={{ width: '100%' }}
                    value={assignTargetGroupId}
                    options={groupOptions}
                    onChange={setAssignTargetGroupId}
                />
            </Modal>
        </div>
    );
};

export default EmailsPage;
