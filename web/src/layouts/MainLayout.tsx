import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
    Layout,
    Menu,
    Avatar,
    Dropdown,
    theme,
    Typography,
    Space,
    Breadcrumb,
} from 'antd';
import type { MenuProps } from 'antd';
import {
    DashboardOutlined,
    UserOutlined,
    KeyOutlined,
    MailOutlined,
    SettingOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    FileTextOutlined,
    HistoryOutlined,
    FileSearchOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api';
import { isSuperAdmin } from '../utils/auth';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuConfig = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard', title: 'Dashboard' },
    { key: '/emails', icon: <MailOutlined />, label: 'Emails', title: 'Email Management' },
    { key: '/api-keys', icon: <KeyOutlined />, label: 'API Keys', title: 'API Key Management' },
    { key: '/api-docs', icon: <FileTextOutlined />, label: 'API Docs', title: 'API Documentation' },
    { key: '/operation-logs', icon: <HistoryOutlined />, label: 'Audit Logs', title: 'Audit Logs' },
    { key: '/system-logs', icon: <FileSearchOutlined />, label: 'System Logs', title: 'System Logs' },
    { key: '/admins', icon: <UserOutlined />, label: 'Admins', title: 'Admin Management', superAdmin: true },
    { key: '/settings', icon: <SettingOutlined />, label: 'Settings', title: 'System Settings' },
];

const MainLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { admin, clearAuth } = useAuthStore();
    const { token } = theme.useToken();

    const hasSuperAdminPermission = isSuperAdmin(admin?.role);
    const displayName = admin?.username?.trim() || 'Admin';
    const avatarText = displayName.charAt(0).toUpperCase();
    const menuItems: MenuProps['items'] = menuConfig
        .filter(item => !item.superAdmin || hasSuperAdminPermission)
        .map(item => ({
            key: item.key,
            icon: item.icon,
            label: <Link to={item.key}>{item.label}</Link>,
        }));

    const handleLogout = async () => {
        try {
            await authApi.logout();
        } catch {
            // ignore
        }
        clearAuth();
        navigate('/login');
    };

    const userMenuItems: MenuProps['items'] = [
        {
            key: 'profile',
            icon: <UserOutlined />,
            label: 'Profile',
            onClick: () => navigate('/settings'),
        },
        { type: 'divider' },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Logout',
            danger: true,
            onClick: handleLogout,
        },
    ];

    const currentMenu = menuConfig.find(item => location.pathname.startsWith(item.key));
    const pageTitle = currentMenu?.title || 'Admin Panel';

    const selectedKeys = menuConfig
        .filter(item => location.pathname.startsWith(item.key))
        .map(item => item.key);

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Sider
                trigger={null}
                collapsible
                collapsed={collapsed}
                theme="light"
                width={208}
                style={{
                    overflow: 'auto',
                    height: '100vh',
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    borderRight: '1px solid #f0f0f0',
                }}
            >
                <div
                    style={{
                        height: 64,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderBottom: '1px solid #f0f0f0',
                    }}
                >
                    <Space>
                        <div
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: '#1890ff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 600,
                            }}
                        >
                            GX
                        </div>
                        {!collapsed && (
                            <Text strong style={{ fontSize: 16 }}>GongXi Mail</Text>
                        )}
                    </Space>
                </div>
                <Menu
                    theme="light"
                    mode="inline"
                    selectedKeys={selectedKeys}
                    items={menuItems}
                    style={{ borderRight: 0, marginTop: 8 }}
                />
            </Sider>

            <Layout style={{ marginLeft: collapsed ? 80 : 208, transition: 'margin-left 0.2s ease' }}>
                <Header
                    style={{
                        padding: '0 24px',
                        background: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #f0f0f0',
                        height: 56,
                        lineHeight: '56px',
                    }}
                >
                    <Space>
                        <span
                            onClick={() => setCollapsed(!collapsed)}
                            style={{ fontSize: 16, cursor: 'pointer', color: '#595959' }}
                        >
                            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        </span>
                        <Breadcrumb
                            items={[
                                { title: 'Home' },
                                { title: pageTitle },
                            ]}
                            style={{ marginLeft: 16 }}
                        />
                    </Space>

                    <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                        <Space style={{ cursor: 'pointer' }}>
                            <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                                {avatarText}
                            </Avatar>
                            <Text>{displayName}</Text>
                        </Space>
                    </Dropdown>
                </Header>

                <Content
                    style={{
                        margin: 24,
                        padding: 24,
                        background: '#fff',
                        borderRadius: token.borderRadiusLG,
                        minHeight: 'calc(100vh - 56px - 48px)',
                    }}
                >
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
};

export default MainLayout;
