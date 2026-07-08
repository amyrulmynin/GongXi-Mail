import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PageHeader } from '../../components';
import { logsApi } from '../../api';
import { requestData } from '../../utils/request';

const { Text } = Typography;

type SystemLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface SystemLogItem {
    id: string;
    time: string;
    level: SystemLogLevel;
    action: string | null;
    actorUsername: string | null;
    message: string;
    requestId: string | null;
    trigger: string | null;
    raw: string;
    context: Record<string, unknown>;
}

const levelOptions = [
    { label: 'All Levels', value: '' },
    { label: 'TRACE', value: 'trace' },
    { label: 'DEBUG', value: 'debug' },
    { label: 'INFO', value: 'info' },
    { label: 'WARN', value: 'warn' },
    { label: 'ERROR', value: 'error' },
    { label: 'FATAL', value: 'fatal' },
];

const lineOptions = [
    { label: 'Last 100 lines', value: 100 },
    { label: 'Last 200 lines', value: 200 },
    { label: 'Last 500 lines', value: 500 },
    { label: 'Last 1000 lines', value: 1000 },
];

function getLevelColor(level: SystemLogLevel) {
    switch (level) {
        case 'trace':
            return 'default';
        case 'debug':
            return 'blue';
        case 'info':
            return 'success';
        case 'warn':
            return 'warning';
        case 'error':
        case 'fatal':
            return 'error';
        default:
            return 'default';
    }
}

const SystemLogsPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<SystemLogItem[]>([]);
    const [filePath, setFilePath] = useState('');
    const [levelFilter, setLevelFilter] = useState<SystemLogLevel | undefined>();
    const [keyword, setKeyword] = useState('');
    const [keywordInput, setKeywordInput] = useState('');
    const [lines, setLines] = useState(200);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        const result = await requestData<{ filePath: string; lines: number; list: SystemLogItem[] }>(
            () => logsApi.getSystemLogs({
                level: levelFilter,
                keyword: keyword || undefined,
                lines,
            }),
            'Failed to fetch system logs'
        );
        if (result) {
            setLogs(result.list);
            setFilePath(result.filePath);
        }
        setLoading(false);
    }, [keyword, levelFilter, lines]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchLogs();
        }, 0);

        return () => window.clearTimeout(timer);
    }, [fetchLogs]);

    const columns = [
        {
            title: 'Time',
            dataIndex: 'time',
            key: 'time',
            width: 180,
            render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
        },
        {
            title: 'Level',
            dataIndex: 'level',
            key: 'level',
            width: 100,
            render: (level: SystemLogLevel) => <Tag color={getLevelColor(level)}>{level.toUpperCase()}</Tag>,
        },
        {
            title: 'Action',
            dataIndex: 'action',
            key: 'action',
            width: 220,
            render: (action: string | null) => action ? <Text code>{action}</Text> : <Text type="secondary">-</Text>,
        },
        {
            title: 'Actor',
            dataIndex: 'actorUsername',
            key: 'actorUsername',
            width: 140,
            render: (value: string | null) => value || <Text type="secondary">System</Text>,
        },
        {
            title: 'Trigger',
            dataIndex: 'trigger',
            key: 'trigger',
            width: 100,
            render: (trigger: string | null) => trigger
                ? <Tag color={trigger === 'AUTO' ? 'blue' : 'gold'}>{trigger}</Tag>
                : <Text type="secondary">-</Text>,
        },
        {
            title: 'Message',
            dataIndex: 'message',
            key: 'message',
            ellipsis: true,
        },
    ];

    return (
        <div>
            <PageHeader
                title="System Logs"
                subtitle="View backend business event logs such as create, update, delete, refresh and system tasks"
                extra={(
                    <Button icon={<ReloadOutlined />} onClick={() => void fetchLogs()}>
                        Refresh
                    </Button>
                )}
            />

            <Card bordered={false}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Alert
                        type="info"
                        showIcon
                        message="Log file"
                        description={filePath || 'No log file has been generated yet'}
                    />

                    <Space wrap>
                        <Select
                            value={levelFilter || ''}
                            options={levelOptions}
                            style={{ width: 150 }}
                            onChange={(value) => setLevelFilter((value || undefined) as SystemLogLevel | undefined)}
                        />
                        <Select
                            value={lines}
                            options={lineOptions}
                            style={{ width: 140 }}
                            onChange={setLines}
                        />
                        <Input.Search
                            placeholder="Search log keywords"
                            value={keywordInput}
                            onChange={(event) => setKeywordInput(event.target.value)}
                            onSearch={(value) => setKeyword(value.trim())}
                            allowClear
                            style={{ width: 260 }}
                        />
                    </Space>

                    <Table
                        rowKey="id"
                        dataSource={logs}
                        columns={columns}
                        loading={loading}
                        pagination={false}
                        locale={{ emptyText: 'No system logs' }}
                        expandable={{
                            expandedRowRender: (record: SystemLogItem) => (
                                <div style={{ display: 'grid', gap: 12 }}>
                                    {record.requestId ? (
                                        <div>
                                            <Text strong>Request ID</Text>
                                            <div style={{ marginTop: 8 }}>
                                                <Text copyable>{record.requestId}</Text>
                                            </div>
                                        </div>
                                    ) : null}
                                    <div>
                                        <Text strong>Context</Text>
                                        <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                            {JSON.stringify(record.context, null, 2) || '{}'}
                                        </pre>
                                    </div>
                                    <div>
                                        <Text strong>Raw log</Text>
                                        <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                            {record.raw}
                                        </pre>
                                    </div>
                                </div>
                            ),
                        }}
                    />
                </Space>
            </Card>
        </div>
    );
};

export default SystemLogsPage;
