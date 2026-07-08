import React, { useCallback, useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Typography, Space, Tag, Alert, QRCode, Switch, InputNumber, Progress } from 'antd';
import { LockOutlined, SafetyCertificateOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { authApi, emailApi } from '../../api';
import { useAuthStore } from '../../stores/authStore';
import { getAdminRoleLabel } from '../../utils/auth';
import { requestData } from '../../utils/request';

const { Title, Text } = Typography;

interface TwoFactorStatus {
    enabled: boolean;
    pending: boolean;
    legacyEnv: boolean;
}

interface TokenRefreshFailure {
    emailId: number;
    email: string;
    success: boolean;
    message: string;
}

interface TokenRefreshCurrentRun {
    trigger: 'AUTO' | 'MANUAL';
    total: number;
    completed: number;
    success: number;
    failed: number;
    groupId: number | null;
    requestedByUsername: string | null;
    startedAt: string;
    durationMs: number;
    recentFailures: TokenRefreshFailure[];
}

interface TokenRefreshStatus {
    enabled: boolean;
    intervalHours: number;
    concurrency: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
    isRunning: boolean;
    lastResult: {
        total: number;
        success: number;
        failed: number;
        durationMs: number;
    } | null;
    currentRun: TokenRefreshCurrentRun | null;
    recentFailures: TokenRefreshFailure[];
}

const SettingsPage: React.FC = () => {
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [twoFactorLoading, setTwoFactorLoading] = useState(false);
    const [twoFactorStatusLoading, setTwoFactorStatusLoading] = useState(true);
    const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus>({
        enabled: false,
        pending: false,
        legacyEnv: false,
    });
    const [tokenRefreshStatus, setTokenRefreshStatus] = useState<TokenRefreshStatus | null>(null);
    const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
    const [enableOtp, setEnableOtp] = useState('');
    const [tokenRefreshStatusLoading, setTokenRefreshStatusLoading] = useState(true);
    const [tokenRefreshActionLoading, setTokenRefreshActionLoading] = useState(false);
    const [tokenRefreshSaveLoading, setTokenRefreshSaveLoading] = useState(false);
    const [form] = Form.useForm();
    const [disable2FaForm] = Form.useForm();
    const [tokenRefreshForm] = Form.useForm();
    const { admin, token, setAuth } = useAuthStore();

    const syncStoreTwoFactor = useCallback((enabled: boolean) => {
        if (!token || !admin) {
            return;
        }
        setAuth(token, { ...admin, twoFactorEnabled: enabled });
    }, [admin, setAuth, token]);

    const loadTwoFactorStatus = async (silent: boolean = false) => {
        const result = await requestData<TwoFactorStatus>(
            () => authApi.getTwoFactorStatus(),
            'Failed to fetch two-factor status',
            { silent }
        );
        if (result) {
            setTwoFactorStatus(result);
            if (!result.pending) {
                setSetupData(null);
            }
            syncStoreTwoFactor(result.enabled);
        }
        setTwoFactorStatusLoading(false);
    };

    const loadTokenRefreshStatus = useCallback(async (silent: boolean = false) => {
        if (!silent) {
            setTokenRefreshStatusLoading(true);
        }

        const result = await requestData<TokenRefreshStatus>(
            () => emailApi.getRefreshStatus(),
            'Failed to fetch token refresh status',
            { silent }
        );
        if (result) {
            setTokenRefreshStatus(result);
            if (!silent || !tokenRefreshForm.isFieldsTouched()) {
                tokenRefreshForm.setFieldsValue({
                    enabled: result.enabled,
                    intervalHours: result.intervalHours,
                    concurrency: result.concurrency,
                });
            }
        }

        if (!silent) {
            setTokenRefreshStatusLoading(false);
        }
    }, [tokenRefreshForm]);

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            const result = await requestData<TwoFactorStatus>(
                () => authApi.getTwoFactorStatus(),
            'Failed to fetch two-factor status',
                { silent: true }
            );
            if (!cancelled && result) {
                setTwoFactorStatus(result);
                if (!result.pending) {
                    setSetupData(null);
                }
                syncStoreTwoFactor(result.enabled);
            }
            if (!cancelled) {
                setTwoFactorStatusLoading(false);
            }
        };

        void init();
        return () => {
            cancelled = true;
        };
    }, [syncStoreTwoFactor]);

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            await loadTokenRefreshStatus(true);
            if (!cancelled) {
                setTokenRefreshStatusLoading(false);
            }
        };

        void init();
        return () => {
            cancelled = true;
        };
    }, [loadTokenRefreshStatus]);

    useEffect(() => {
        if (!tokenRefreshStatus?.isRunning) {
            return;
        }

        const timer = window.setInterval(() => {
            void loadTokenRefreshStatus(true);
        }, 5000);

        return () => window.clearInterval(timer);
    }, [loadTokenRefreshStatus, tokenRefreshStatus?.isRunning]);

    const handleChangePassword = async (values: {
        oldPassword: string;
        newPassword: string;
        confirmPassword: string;
    }) => {
        if (values.newPassword !== values.confirmPassword) {
            message.error('Passwords do not match');
            return;
        }

        setPasswordLoading(true);
        const result = await requestData<{ message?: string }>(
            () => authApi.changePassword(values.oldPassword, values.newPassword),
            'Password change failed'
        );
        if (result) {
            message.success('Password changed successfully');
            form.resetFields();
        }
        setPasswordLoading(false);
    };

    const handleSetup2Fa = async () => {
        setTwoFactorLoading(true);
        const result = await requestData<{ secret: string; otpauthUrl: string }>(
            () => authApi.setupTwoFactor(),
            'Failed to generate two-factor secret'
        );
        if (result) {
            setSetupData(result);
            setTwoFactorStatus((prev) => ({ ...prev, pending: true, enabled: false, legacyEnv: false }));
            message.info('Add the secret to your authenticator app, then enter the 6-digit code to complete setup');
        }
        setTwoFactorLoading(false);
    };

    const handleEnable2Fa = async () => {
        const otp = enableOtp.trim();
        if (!/^\d{6}$/.test(otp)) {
            message.error('Please enter the 6-digit code');
            return;
        }

        setTwoFactorLoading(true);
        const result = await requestData<{ enabled: boolean }>(
            () => authApi.enableTwoFactor(otp),
            'Failed to enable two-factor auth'
        );
        if (result) {
            message.success('Two-factor auth enabled');
            setEnableOtp('');
            setSetupData(null);
            await loadTwoFactorStatus();
        }
        setTwoFactorLoading(false);
    };

    const handleDisable2Fa = async (values: { password: string; otp: string }) => {
        setTwoFactorLoading(true);
        const result = await requestData<{ enabled: boolean }>(
            () => authApi.disableTwoFactor(values.password, values.otp),
            'Failed to disable two-factor auth'
        );
        if (result) {
            message.success('Two-factor auth disabled');
            disable2FaForm.resetFields();
            await loadTwoFactorStatus();
        }
        setTwoFactorLoading(false);
    };

    const handleRunTokenRefresh = async () => {
        setTokenRefreshActionLoading(true);
        const result = await requestData<{ message?: string }>(
            () => emailApi.refreshTokens(),
            'Failed to start token refresh'
        );
        if (result) {
            message.success(result.message || 'Token refresh job started');
            await loadTokenRefreshStatus(true);
        }
        setTokenRefreshActionLoading(false);
    };

    const handleSaveTokenRefreshSettings = async () => {
        try {
            const values = await tokenRefreshForm.validateFields();
            setTokenRefreshSaveLoading(true);
            const result = await requestData<{ enabled: boolean; intervalHours: number; concurrency: number }>(
                () => emailApi.updateRefreshSettings({
                    enabled: Boolean(values.enabled),
                    intervalHours: Number(values.intervalHours),
                    concurrency: Number(values.concurrency),
                }),
                'Failed to save token auto-refresh config'
            );

            if (result) {
                message.success('Token auto-refresh config saved');
                tokenRefreshForm.setFieldsValue({
                    enabled: result.enabled,
                    intervalHours: result.intervalHours,
                    concurrency: result.concurrency,
                });
                await loadTokenRefreshStatus();
            }
        } finally {
            setTokenRefreshSaveLoading(false);
        }
    };

    const formatDateTime = (value: string | null | undefined) => {
        if (!value) {
            return 'N/A';
        }
        return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
    };

    const formatDuration = (durationMs: number | null | undefined) => {
        if (!durationMs || durationMs <= 0) {
            return '0 sec';
        }

        const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        if (minutes === 0) {
            return `${totalSeconds} sec`;
        }

        return `${minutes} min ${seconds} sec`;
    };

    const progressPercent = tokenRefreshStatus?.currentRun?.total
        ? Math.min(100, Math.round((tokenRefreshStatus.currentRun.completed / tokenRefreshStatus.currentRun.total) * 100))
        : 0;
    const activeRun = tokenRefreshStatus?.currentRun ?? null;
    const isAutoRefreshRunning = activeRun?.trigger === 'AUTO';
    const isManualRefreshRunning = activeRun?.trigger === 'MANUAL';
    const displayedFailures = activeRun?.recentFailures ?? tokenRefreshStatus?.recentFailures ?? [];

    return (
        <div>
            <Title level={4}>Settings</Title>

            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Card title="Profile">
                    <div style={{ display: 'grid', gap: 16 }}>
                        <div>
                            <Text type="secondary">Username</Text>
                            <div style={{ fontSize: 16 }}>{admin?.username}</div>
                        </div>
                        <div>
                            <Text type="secondary">Role</Text>
                            <div style={{ fontSize: 16 }}>
                                {getAdminRoleLabel(admin?.role)}
                            </div>
                        </div>
                    </div>
                </Card>

                <Card title="Change Password">
                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={handleChangePassword}
                        style={{ maxWidth: 400 }}
                    >
                        <Form.Item
                            name="oldPassword"
                            label="Current Password"
                            rules={[{ required: true, message: 'Please enter current password' }]}
                        >
                            <Input.Password prefix={<LockOutlined />} placeholder="Current password" />
                        </Form.Item>

                        <Form.Item
                            name="newPassword"
                            label="New Password"
                            rules={[
                                { required: true, message: 'Please enter new password' },
                                { min: 6, message: 'Password must be at least 6 characters' },
                            ]}
                        >
                            <Input.Password prefix={<LockOutlined />} placeholder="New password" />
                        </Form.Item>

                        <Form.Item
                            name="confirmPassword"
                            label="Confirm New Password"
                            rules={[
                                { required: true, message: 'Please confirm new password' },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        if (!value || getFieldValue('newPassword') === value) {
                                            return Promise.resolve();
                                        }
                                        return Promise.reject(new Error('Passwords do not match'));
                                    },
                                }),
                            ]}
                        >
                            <Input.Password prefix={<LockOutlined />} placeholder="Confirm new password" />
                        </Form.Item>

                        <Form.Item>
                            <Button type="primary" htmlType="submit" loading={passwordLoading}>
                                Change Password
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>

                <Card title="Two-Factor Auth (2FA)">
                    {twoFactorStatusLoading ? (
                        <Text type="secondary">Loading...</Text>
                    ) : (
                        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                            <div>
                                <Text type="secondary">Status:</Text>{' '}
                                {twoFactorStatus.enabled ? <Tag color="success">Enabled</Tag> : <Tag>Disabled</Tag>}
                                {twoFactorStatus.pending && !twoFactorStatus.enabled ? <Tag color="processing">Pending</Tag> : null}
                            </div>

                            {twoFactorStatus.legacyEnv ? (
                                <Alert
                                    type="warning"
                                    showIcon
                                    message="This account uses environment variable 2FA (ADMIN_2FA_SECRET). It cannot be managed from the UI."
                                />
                            ) : null}

                            {!twoFactorStatus.enabled ? (
                                <Button
                                    type="primary"
                                    icon={<SafetyCertificateOutlined />}
                                    onClick={handleSetup2Fa}
                                    loading={twoFactorLoading}
                                >
                                    Generate Binding Secret
                                </Button>
                            ) : null}

                            {setupData ? (
                                <Card size="small" title="Binding Info">
                                    <Space direction="vertical" style={{ width: '100%' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <Text type="secondary">Scan QR code to bind (recommended)</Text>
                                            <div style={{ marginTop: 8 }}>
                                                <QRCode value={setupData.otpauthUrl} size={180} />
                                            </div>
                                        </div>
                                        <div>
                                            <Text type="secondary">Manual secret (copyable)</Text>
                                            <div><Text copyable>{setupData.secret}</Text></div>
                                        </div>
                                        <div>
                                            <Text type="secondary">otpauth URL (copyable)</Text>
                                            <div><Text copyable>{setupData.otpauthUrl}</Text></div>
                                        </div>
                                        <Input
                                            value={enableOtp}
                                            onChange={(e) => setEnableOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            placeholder="Enter the 6-digit code from your authenticator"
                                            maxLength={6}
                                            prefix={<SafetyCertificateOutlined />}
                                        />
                                        <Button type="primary" onClick={handleEnable2Fa} loading={twoFactorLoading}>
                                            Enable Two-Factor Auth
                                        </Button>
                                    </Space>
                                </Card>
                            ) : null}

                            {twoFactorStatus.enabled ? (
                                <Card size="small" title="Disable Two-Factor Auth">
                                    <Form form={disable2FaForm} layout="vertical" onFinish={handleDisable2Fa}>
                                        <Form.Item
                                            name="password"
                                            label="Current Password"
                                            rules={[{ required: true, message: 'Please enter current password' }]}
                                        >
                                            <Input.Password prefix={<LockOutlined />} placeholder="Current password" />
                                        </Form.Item>
                                        <Form.Item
                                            name="otp"
                                            label="Verification Code"
                                            rules={[
                                                { required: true, message: 'Please enter verification code' },
                                                { pattern: /^\d{6}$/, message: 'Please enter a 6-digit code' },
                                            ]}
                                        >
                                            <Input
                                                maxLength={6}
                                                prefix={<SafetyCertificateOutlined />}
                                                placeholder="6-digit code"
                                            />
                                        </Form.Item>
                                        <Form.Item style={{ marginBottom: 0 }}>
                                            <Button danger htmlType="submit" loading={twoFactorLoading}>
                                                Disable Two-Factor Auth
                                            </Button>
                                        </Form.Item>
                                    </Form>
                                </Card>
                            ) : null}
                        </Space>
                    )}
                </Card>

                <Card title="Token Auto-Refresh">
                    {tokenRefreshStatusLoading ? (
                        <Text type="secondary">Loading...</Text>
                    ) : tokenRefreshStatus ? (
                        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                            <div>
                                <Text type="secondary">Auto task:</Text>{' '}
                                {tokenRefreshStatus.enabled ? <Tag color="success">Enabled</Tag> : <Tag>Disabled</Tag>}
                                {isAutoRefreshRunning ? <Tag color="processing">Auto running</Tag> : null}
                                {isManualRefreshRunning ? <Tag color="processing">Manual task running</Tag> : null}
                                {!tokenRefreshStatus.isRunning ? <Tag>Idle</Tag> : null}
                            </div>

                            <div style={{ display: 'grid', gap: 12 }}>
                                <div>
                                    <Text type="secondary">Current config</Text>
                                    <div style={{ fontSize: 16 }}>
                                        Every {tokenRefreshStatus.intervalHours} hours, concurrency {tokenRefreshStatus.concurrency}
                                    </div>
                                </div>
                                <div>
                                    <Text type="secondary">Last completed</Text>
                                    <div style={{ fontSize: 16 }}>{formatDateTime(tokenRefreshStatus.lastRunAt)}</div>
                                </div>
                                <div>
                                    <Text type="secondary">Next scheduled</Text>
                                    <div style={{ fontSize: 16 }}>
                                        {!tokenRefreshStatus.enabled
                                            ? 'Auto task disabled'
                                            : isAutoRefreshRunning
                                                ? 'Auto task running, will recalculate after completion'
                                                : isManualRefreshRunning
                                                    ? 'Manual refresh running, auto task will continue after idle'
                                                : formatDateTime(tokenRefreshStatus.nextRunAt)}
                                    </div>
                                </div>
                            </div>

                            {tokenRefreshStatus.lastResult ? (
                                <Alert
                                    type={tokenRefreshStatus.lastResult.failed > 0 ? 'warning' : 'success'}
                                    showIcon
                                    message={`Last auto run: Success ${tokenRefreshStatus.lastResult.success} / Failed ${tokenRefreshStatus.lastResult.failed} / Total ${tokenRefreshStatus.lastResult.total}`}
                                    description={`Completed at ${formatDateTime(tokenRefreshStatus.lastRunAt)}, duration ${formatDuration(tokenRefreshStatus.lastResult.durationMs)}`}
                                />
                            ) : (
                                <Text type="secondary">No run history</Text>
                            )}

                            {isManualRefreshRunning ? (
                                <Alert
                                    type="info"
                                    showIcon
                                    message="Manual refresh task running"
                                    description={`Triggered by ${activeRun?.requestedByUsername || 'Unknown admin'}, scope ${activeRun?.groupId ? `Group #${activeRun.groupId}` : 'All non-disabled emails'}. The "Last auto run" stat above only counts auto tasks.`}
                                />
                            ) : null}

                            {activeRun ? (
                                <Card size="small" title={activeRun.trigger === 'AUTO' ? 'Current Auto Task Progress' : 'Current Manual Task Progress'}>
                                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                                        <Progress
                                            percent={progressPercent}
                                            status="active"
                                            format={() => `${activeRun.completed} / ${activeRun.total}`}
                                        />
                                        <div style={{ display: 'grid', gap: 12 }}>
                                            <div>
                                                <Text type="secondary">Trigger</Text>
                                                <div style={{ fontSize: 16 }}>
                                                    {activeRun.trigger === 'AUTO' ? 'System auto-scheduled' : `Manual trigger${activeRun.requestedByUsername ? ` (${activeRun.requestedByUsername})` : ''}`}
                                                </div>
                                            </div>
                                            <div>
                                                <Text type="secondary">Scope</Text>
                                                <div style={{ fontSize: 16 }}>
                                                    {activeRun.groupId ? `Group #${activeRun.groupId}` : 'All non-disabled emails'}
                                                </div>
                                            </div>
                                            <div>
                                                <Text type="secondary">Started at</Text>
                                                <div style={{ fontSize: 16 }}>{formatDateTime(activeRun.startedAt)}</div>
                                            </div>
                                            <div>
                                                <Text type="secondary">Elapsed</Text>
                                                <div style={{ fontSize: 16 }}>{formatDuration(activeRun.durationMs)}</div>
                                            </div>
                                            <div>
                                                <Text type="secondary">Current stats</Text>
                                                <div style={{ fontSize: 16 }}>
                                                    Success {activeRun.success} / Failed {activeRun.failed} / Pending {Math.max(0, activeRun.total - activeRun.completed)}
                                                </div>
                                            </div>
                                        </div>
                                    </Space>
                                </Card>
                            ) : null}

                            <Card
                                size="small"
                                title={activeRun
                                    ? activeRun.trigger === 'AUTO' ? 'Current Auto Task Recent Failures' : 'Current Manual Task Recent Failures'
                                    : 'Last Auto Task Failures'}
                            >
                                {displayedFailures.length > 0 ? (
                                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                        {displayedFailures.map((failure) => (
                                            <div
                                                key={`${failure.emailId}-${failure.email}-${failure.message}`}
                                                style={{
                                                    padding: 12,
                                                    border: '1px solid #f0f0f0',
                                                    borderRadius: 8,
                                                    background: '#fff',
                                                }}
                                            >
                                                <div style={{ fontWeight: 500, marginBottom: 4 }}>{failure.email}</div>
                                                <Text type="secondary">{failure.message}</Text>
                                            </div>
                                        ))}
                                    </Space>
                                ) : (
                                    <Text type="secondary">
                                        {activeRun ? 'No failures in current task' : 'No recent auto task failures'}
                                    </Text>
                                )}
                            </Card>

                            <Space wrap>
                                <Button
                                    icon={<ReloadOutlined />}
                                    onClick={() => void loadTokenRefreshStatus()}
                                    loading={tokenRefreshStatusLoading}
                                >
                                    Refresh Status
                                </Button>
                                <Button
                                    type="primary"
                                    icon={<SyncOutlined spin={tokenRefreshActionLoading || tokenRefreshStatus.isRunning} />}
                                    onClick={handleRunTokenRefresh}
                                    loading={tokenRefreshActionLoading}
                                    disabled={tokenRefreshStatus.isRunning}
                                >
                                    Run Now
                                </Button>
                            </Space>

                            <Card size="small" title="Auto-Refresh Config">
                                <Form
                                    form={tokenRefreshForm}
                                    layout="vertical"
                                    initialValues={{
                                        enabled: tokenRefreshStatus.enabled,
                                        intervalHours: tokenRefreshStatus.intervalHours,
                                        concurrency: tokenRefreshStatus.concurrency,
                                    }}
                                >
                                    <Form.Item
                                        name="enabled"
                                        label="Enable Auto-Refresh"
                                        valuePropName="checked"
                                    >
                                        <Switch checkedChildren="On" unCheckedChildren="Off" />
                                    </Form.Item>
                                    <Form.Item
                                        name="intervalHours"
                                        label="Interval (hours)"
                                        rules={[
                                            { required: true, message: 'Please enter interval' },
                                            {
                                                validator: (_, value) => {
                                                    const num = Number(value);
                                                    if (Number.isInteger(num) && num >= 1 && num <= 24 * 30) {
                                                        return Promise.resolve();
                                                    }
                                                    return Promise.reject(new Error('Must be an integer between 1 and 720'));
                                                },
                                            },
                                        ]}
                                    >
                                        <InputNumber min={1} max={24 * 30} precision={0} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item
                                        name="concurrency"
                                        label="Concurrency"
                                        rules={[
                                            { required: true, message: 'Please enter concurrency' },
                                            {
                                                validator: (_, value) => {
                                                    const num = Number(value);
                                                    if (Number.isInteger(num) && num >= 1 && num <= 50) {
                                                        return Promise.resolve();
                                                    }
                                                    return Promise.reject(new Error('Must be an integer between 1 and 50'));
                                                },
                                            },
                                        ]}
                                    >
                                        <InputNumber min={1} max={50} precision={0} style={{ width: '100%' }} />
                                    </Form.Item>
                                    <Form.Item style={{ marginBottom: 0 }}>
                                        <Button
                                            type="primary"
                                            onClick={handleSaveTokenRefreshSettings}
                                            loading={tokenRefreshSaveLoading}
                                            disabled={tokenRefreshStatus.isRunning}
                                        >
                                            Save Auto-Refresh Config
                                        </Button>
                                    </Form.Item>
                                </Form>
                            </Card>

                            <Alert
                                type="info"
                                showIcon
                                message="Config takes effect immediately after saving"
                                description="The auto task will reschedule based on the new config. Running tasks will not be forcefully interrupted."
                            />
                        </Space>
                    ) : (
                        <Text type="secondary">No data</Text>
                    )}
                </Card>

                <Card title="API Usage Guide">
                    <div style={{ marginBottom: 16 }}>
                        <Text strong>External API Usage</Text>
                    </div>

                    <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                        <Text code style={{ display: 'block', marginBottom: 8 }}>
                            # Pass API Key via Header
                        </Text>
                        <Text code style={{ display: 'block', wordBreak: 'break-all' }}>
                            curl -H "X-API-Key: your_api_key" https://your-domain.com/api/mail_all
                        </Text>
                    </div>

                    <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                        <Text code style={{ display: 'block', marginBottom: 8 }}>
                            # Pass API Key via Query parameter
                        </Text>
                        <Text code style={{ display: 'block', wordBreak: 'break-all' }}>
                            curl "https://your-domain.com/api/mail_all?api_key=your_api_key&email=xxx@outlook.com"
                        </Text>
                    </div>
                </Card>
            </Space>
        </div>
    );
};

export default SettingsPage;
