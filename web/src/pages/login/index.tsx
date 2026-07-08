import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Modal, Space } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { authApi } from '../../api';
import { useAuthStore } from '../../stores/authStore';
import { getErrorMessage } from '../../utils/error';

const { Title, Text } = Typography;

interface LoginForm {
    username: string;
    password: string;
}

const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { setAuth } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [otpModalVisible, setOtpModalVisible] = useState(false);
    const [otpLoading, setOtpLoading] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [pendingCredentials, setPendingCredentials] = useState<{ username: string; password: string } | null>(null);

    const finishLogin = (result: { token: string; admin: { id: number; username: string; email?: string; role: 'SUPER_ADMIN' | 'ADMIN'; twoFactorEnabled?: boolean } }) => {
        setAuth(result.token, result.admin);
        message.success('Login successful');
        navigate('/');
    };

    const handleSubmit = async (values: LoginForm) => {
        setLoading(true);
        try {
            const response = await authApi.login(values.username, values.password);
            if (response.code === 200) {
                finishLogin(response.data as { token: string; admin: { id: number; username: string; email?: string; role: 'SUPER_ADMIN' | 'ADMIN'; twoFactorEnabled?: boolean } });
            }
        } catch (err: unknown) {
            const errCode = String((err as { code?: unknown })?.code || '').toUpperCase();
            if (errCode === 'INVALID_OTP') {
                setPendingCredentials({ username: values.username, password: values.password });
                setOtpCode('');
                setOtpModalVisible(true);
                message.info('This account has two-factor authentication enabled. Please enter the 6-digit code.');
            } else {
                message.error(getErrorMessage(err, 'Login failed'));
            }
        } finally {
            setLoading(false);
        }
    };

    const handleOtpConfirm = async () => {
        if (!pendingCredentials) {
            return;
        }
        const otp = otpCode.trim();
        if (!/^\d{6}$/.test(otp)) {
            message.error('Please enter the 6-digit code');
            return;
        }

        setOtpLoading(true);
        try {
            const response = await authApi.login(pendingCredentials.username, pendingCredentials.password, otp);
            if (response.code === 200) {
                setOtpModalVisible(false);
                setPendingCredentials(null);
                setOtpCode('');
                finishLogin(response.data as { token: string; admin: { id: number; username: string; email?: string; role: 'SUPER_ADMIN' | 'ADMIN'; twoFactorEnabled?: boolean } });
            }
        } catch (err: unknown) {
            const errCode = String((err as { code?: unknown })?.code || '').toUpperCase();
            if (errCode === 'INVALID_OTP') {
                message.error('Invalid code, please try again');
            } else {
                message.error(getErrorMessage(err, 'Verification failed'));
            }
        } finally {
            setOtpLoading(false);
        }
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f0f2f5',
            }}
        >
            <Card
                style={{
                    width: 380,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <Title level={3} style={{ margin: '0 0 8px 0' }}>
                        GongXi Mail
                    </Title>
                    <Text type="secondary">Admin Console</Text>
                </div>

                <Form
                    name="login"
                    onFinish={handleSubmit}
                    size="large"
                >
                    <Form.Item
                        name="username"
                        rules={[{ required: true, message: 'Please enter your username' }]}
                    >
                        <Input
                            prefix={<UserOutlined />}
                            placeholder="Username"
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: 'Please enter your password' }]}
                    >
                        <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="Password"
                        />
                    </Form.Item>

                    <Form.Item
                        style={{ marginTop: -6, marginBottom: 16 }}
                    >
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            If 2FA is enabled on this account, a verification code prompt will appear next.
                        </Text>
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0 }}>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            block
                        >
                            Login
                        </Button>
                    </Form.Item>
                </Form>
            </Card>

            <Modal
                title="Two-Factor Authentication"
                open={otpModalVisible}
                onOk={handleOtpConfirm}
                onCancel={() => {
                    setOtpModalVisible(false);
                    setPendingCredentials(null);
                    setOtpCode('');
                }}
                okText="Verify & Login"
                cancelText="Cancel"
                confirmLoading={otpLoading}
                destroyOnClose
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Text type="secondary">Enter the 6-digit code from your authenticator app</Text>
                    <Input
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        prefix={<SafetyCertificateOutlined />}
                        maxLength={6}
                        placeholder="6-digit code"
                    />
                </Space>
            </Modal>
        </div>
    );
};

export default LoginPage;
