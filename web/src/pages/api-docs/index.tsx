import React from 'react';
import { Typography, Card, Tabs, Tag, Table, Divider, Alert, Row, Col } from 'antd';
import { LOG_ACTION_OPTIONS } from '../../constants/logActions';

const { Title, Text, Paragraph } = Typography;

const ApiDocsPage: React.FC = () => {
  const baseUrl = window.location.origin;

  const enumRules = [
    { key: 'role', name: 'Admin Role', values: 'SUPER_ADMIN / ADMIN', desc: 'Used for admin permission checks' },
    { key: 'status', name: 'Admin/API Key Status', values: 'ACTIVE / DISABLED', desc: 'Uppercase enum values' },
  ];

  const logActionDescriptions: Record<string, string> = {
    get_email: 'Allocate email',
    mail_new: 'Get latest email',
    mail_text: 'Get email text',
    mail_all: 'Get all emails',
    process_mailbox: 'Clear mailbox',
    list_emails: 'List emails',
    pool_stats: 'Pool statistics',
    pool_reset: 'Reset pool',
  };

  const logActionRows = LOG_ACTION_OPTIONS.map((item) => ({
    action: item.value,
    label: item.label,
    description: logActionDescriptions[item.value] || item.label,
  }));

  const authMethods = [
    {
      method: 'Header (recommended)',
      example: 'X-API-Key: sk_your_api_key',
      description: 'Pass API Key in request header',
    },
    {
      method: 'Bearer Token',
      example: 'Authorization: Bearer sk_your_api_key',
      description: 'Use Bearer Token format',
    },
    {
      method: 'Query parameter',
      example: '?api_key=sk_your_api_key',
      description: 'URL parameter (not recommended, logged)',
    },
  ];

  const apiEndpoints = [
    {
      name: 'Get email address',
      method: 'GET/POST',
      path: '/api/get-email',
      description: 'Allocate an unused email from the pool. Email addressUse the group parameter to restrict allocation to a specific group.',
      params: [
        { name: 'group', type: 'string', required: false, desc: 'Group name, only allocate from this group' },
      ],
      example: `curl -X POST "${baseUrl}/api/get-email" \\
  -H "X-API-Key: sk_your_api_key"`,
      successResponse: `{
  "success": true,
  "data": {
    "email": "example@outlook.com",
    "id": 1
  }
}`,
      errorResponse: `{
  "success": false,
  "error": {
    "code": "NO_UNUSED_EMAIL",
    "message": "No unused emails available."
  }
}`,
    },
    {
      name: 'Get latest email',
      method: 'GET/POST',
      path: '/api/mail_new',
      description: 'Get the latest email for the specified address. Available as long as Email address exists in the system.',
      params: [
        { name: 'email', type: 'string', required: true, desc: 'Email address' },
        { name: 'mailbox', type: 'string', required: false, desc: 'Mail folder, default inbox' },
        { name: 'socks5', type: 'string', required: false, desc: 'SOCKS5 proxy address' },
        { name: 'http', type: 'string', required: false, desc: 'HTTP proxy address' },
      ],
      example: `curl -X POST "${baseUrl}/api/mail_new" \\
  -H "X-API-Key: sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "example@outlook.com"}'`,
      successResponse: `{
  "success": true,
  "data": {
    "email": "example@outlook.com",
    "mailbox": "inbox",
    "count": 1,
    "messages": [
      {
        "id": "AAMk...",
        "subject": "Verification email",
        "from": "noreply@example.com",
        "text": "Your verification code is 123456"
      }
    ],
    "method": "graph_api"
  },
  "email": "example@outlook.com"
}`,
      errorResponse: `{
  "success": false,
  "error": {
    "code": "EMAIL_NOT_FOUND",
    "message": "Email account not found"
  }
}`,
    },
    {
      name: 'Get email text (script)',
      method: 'GET/POST',
      path: '/api/mail_text',
      description: 'Lightweight endpoint designed for scripts, returns `text/plain`  content. Supports Regex pattern to extract verification codes.',
      params: [
        { name: 'email', type: 'string', required: true, desc: 'Email address' },
        { name: 'match', type: 'string', required: false, desc: 'Regex pattern (e.g. `\\d{6}`)' },
      ],
      example: `# Get verification code
curl "${baseUrl}/api/mail_text?email=example@outlook.com&match=\\d{6}" \\
  -H "X-API-Key: sk_your_api_key"`,
      successResponse: `123456`,
      errorResponse: `Error: No match found`,
    },
    {
      name: 'Get all emails',
      method: 'GET/POST',
      path: '/api/mail_all',
      description: 'Get all emails for the specified address. Available as long as Email address exists in the system.',
      params: [
        { name: 'email', type: 'string', required: true, desc: 'Email address' },
        { name: 'mailbox', type: 'string', required: false, desc: 'Mail folder, default inbox' },
        { name: 'socks5', type: 'string', required: false, desc: 'SOCKS5 proxy address' },
        { name: 'http', type: 'string', required: false, desc: 'HTTP proxy address' },
      ],
      example: `curl "${baseUrl}/api/mail_all?email=example@outlook.com" \\
  -H "X-API-Key: sk_your_api_key"`,
      successResponse: `{
  "success": true,
  "data": {
    "email": "example@outlook.com",
    "mailbox": "inbox",
    "count": 2,
    "messages": [
      { "id": "...", "subject": "Email 1" },
      { "id": "...", "subject": "Email 2" }
    ],
    "method": "imap"
  },
  "email": "example@outlook.com"
}`,
      errorResponse: `{
  "success": false,
  "error": {
    "code": "EMAIL_NOT_FOUND",
    "message": "Email account not found"
  }
}`,
    },
    {
      name: 'Clear mailbox',
      method: 'GET/POST',
      path: '/api/process-mailbox',
      description: 'Delete all emails in the specified mailbox。',
      params: [
        { name: 'email', type: 'string', required: true, desc: 'Email address' },
        { name: 'mailbox', type: 'string', required: false, desc: 'Mail folder, default inbox' },
        { name: 'socks5', type: 'string', required: false, desc: 'SOCKS5 proxy address' },
        { name: 'http', type: 'string', required: false, desc: 'HTTP proxy address' },
      ],
      example: `curl -X POST "${baseUrl}/api/process-mailbox" \\
  -H "X-API-Key: sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "example@outlook.com"}'`,
      successResponse: `{
  "success": true,
  "data": {
    "email": "example@outlook.com",
    "mailbox": "inbox",
    "status": "success",
    "deletedCount": 5,
    "message": "Successfully deleted 5 messages"
  },
  "email": "example@outlook.com"
}`,
      errorResponse: `{
  "success": false,
  "error": {
    "code": "EMAIL_NOT_FOUND",
    "message": "Email account not found"
  }
}`,
    },
    {
      name: 'List available emails',
      method: 'GET/POST',
      path: '/api/list-emails',
      description: 'Get all available Email address in the system. Supports filtering by group.',
      params: [
        { name: 'group', type: 'string', required: false, desc: 'Group name, only return emails in this group' },
      ],
      example: `curl "${baseUrl}/api/list-emails" \\
  -H "X-API-Key: sk_your_api_key"`,
      successResponse: `{
  "success": true,
  "data": {
    "total": 100,
    "emails": [
      { "email": "user1@outlook.com", "status": "ACTIVE" },
      { "email": "user2@outlook.com", "status": "ACTIVE" }
    ]
  }
}`,
      errorResponse: `{
  "success": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "API Key required"
  }
}`,
    },
    {
      name: 'Pool statistics',
      method: 'GET/POST',
      path: '/api/pool-stats',
      description: 'Get allocation usage for the current API Key. Supports filtering by group.',
      params: [
        { name: 'group', type: 'string', required: false, desc: 'Group name, only count this group' },
      ],
      example: `curl "${baseUrl}/api/pool-stats" \\
  -H "X-API-Key: sk_your_api_key"`,
      successResponse: `{
  "success": true,
  "data": {
    "total": 100,
    "used": 3,
    "remaining": 97
  }
}`,
      errorResponse: `{
  "success": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "API Key required"
  }
}`,
    },
    {
      name: 'Reset allocation records',
      method: 'GET/POST',
      path: '/api/reset-pool',
      description: 'Reset allocation records for the current API Key. Supports resetting by group.',
      params: [
        { name: 'group', type: 'string', required: false, desc: 'Group name, only reset this group' },
      ],
      example: `curl -X POST "${baseUrl}/api/reset-pool" \\
  -H "X-API-Key: sk_your_api_key"`,
      successResponse: `{
  "success": true,
  "data": {
    "message": "Pool reset successfully"
  }
}`,
      errorResponse: `{
  "success": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "API Key required"
  }
}`,
    },
  ];

  const paramColumns = [
    { title: 'Parameter', dataIndex: 'name', key: 'name', render: (t: string) => <Text code>{t}</Text> },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    { title: 'Required', dataIndex: 'required', key: 'required', render: (r: boolean) => r ? <Tag color="red">Yes</Tag> : <Tag>No</Tag> },
    { title: 'Description', dataIndex: 'desc', key: 'desc' },
  ];

  return (
    <div>
      <Title level={4}>API Documentation</Title>
      <Text type="secondary">Self-service email retrieval and management</Text>

      <Divider />

      <Alert
        message="EndpointDescription"
        description={
          <div>
            <p style={{ marginBottom: 8 }}>The system provides flexible email access:Method：</p>
            <ul style={{ marginBottom: 8, paddingLeft: 20 }}>
              <li><strong>Direct access</strong>: If you know the target email address, you can directly call <code>/api/mail_new</code> or <code>/api/mail_all</code> to get emails without any prior allocation.</li>
              <li><strong>Auto allocation</strong>：If you need a new, unused email, call <code>/api/get-email</code>。This returns a random email and marks it as used to avoid duplicates.</li>
              <li><strong>Text shortcut</strong>：For automation scripts, it is recommended to use <code>/api/mail_text</code> with regex matching to directly get Get verification code and other key info.</li>
            </ul>
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card title="Authentication" style={{ marginBottom: 24 }}>
        <Alert
          message="All API requests must include a valid API Key"
          description="Please create a key on the API Key page. The key is only shown once at creation, please save it carefully."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          dataSource={authMethods}
          columns={[
            { title: 'Method', dataIndex: 'method', key: 'method' },
            { title: 'Example', dataIndex: 'example', key: 'example', render: (t: string) => <Text code copyable>{t}</Text> },
            { title: 'Description', dataIndex: 'description', key: 'description' },
          ]}
          pagination={false}
          size="small"
          rowKey="method"
        />
      </Card>

      <Card title="Health Check& Production Config" style={{ marginBottom: 24 }}>
        <Alert
          message="Health Check"
          description={<Text code>{`${baseUrl}/health`}</Text>}
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Alert
          message="Production Requirements"
          description="JWT_SECRET、ENCRYPTION_KEY、ADMIN_PASSWORD Must be injected via external environment Variablevariables and should not be hardcoded in the repo or image."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          dataSource={[
            { key: 'JWT_SECRET', name: 'JWT_SECRET', requirement: 'At least 32 chars, random strong secret' },
            { key: 'ENCRYPTION_KEY', name: 'ENCRYPTION_KEY', requirement: 'Fixed 32 chars, used for sensitive field encryption' },
            { key: 'ADMIN_PASSWORD', name: 'ADMIN_PASSWORD', requirement: 'Strong password, do not use default value' },
          ]}
          columns={[
            { title: 'Variable', dataIndex: 'name', key: 'name', render: (value: string) => <Text code>{value}</Text> },
            { title: 'Requirement', dataIndex: 'requirement', key: 'requirement' },
          ]}
          pagination={false}
          size="small"
          rowKey="key"
        />
      </Card>

      <Card title="Enum Conventions" style={{ marginBottom: 24 }}>
        <Table
          dataSource={enumRules}
          columns={[
            { title: 'Type', dataIndex: 'name', key: 'name' },
            { title: 'Enum Values', dataIndex: 'values', key: 'values', render: (value: string) => <Text code>{value}</Text> },
            { title: 'Description', dataIndex: 'desc', key: 'desc' },
          ]}
          pagination={false}
          size="small"
          rowKey="key"
        />
      </Card>

      <Card title="Audit Log Action Values" style={{ marginBottom: 24 }}>
        <Alert
          message="Used for action filtering in /admin/dashboard/logs"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          dataSource={logActionRows}
          columns={[
            { title: 'Action', dataIndex: 'action', key: 'action', render: (value: string) => <Text code>{value}</Text> },
            { title: 'Label', dataIndex: 'label', key: 'label' },
            { title: 'Description', dataIndex: 'description', key: 'description' },
          ]}
          pagination={false}
          size="small"
          rowKey="action"
        />
      </Card>

      <Card title="Endpoint List">
        <Tabs
          items={apiEndpoints.map((api, index) => ({
            key: String(index),
            label: api.name,
            children: (
              <div>
                <Paragraph>
                  <Tag color="blue">{api.method}</Tag>
                  <Text code copyable style={{ marginLeft: 8 }}>{baseUrl}{api.path}</Text>
                </Paragraph>
                <Paragraph type="secondary">{api.description}</Paragraph>

                {api.params.length > 0 && (
                  <>
                    <Title level={5} style={{ marginTop: 16 }}>Request Parameters</Title>
                    <Table
                      dataSource={api.params}
                      columns={paramColumns}
                      pagination={false}
                      size="small"
                      rowKey="name"
                    />
                  </>
                )}

                <Title level={5} style={{ marginTop: 24 }}>Request Example</Title>
                <Card size="small" style={{ background: '#f5f5f5' }}>
                  <Text code style={{ whiteSpace: 'pre-wrap' }}>
                    {api.example}
                  </Text>
                </Card>

                <Title level={5} style={{ marginTop: 24 }}>Response Example</Title>
                <Row gutter={16}>
                  <Col span={12}>
                    <Text strong style={{ color: '#52c41a' }}>Success Response</Text>
                    <Card size="small" style={{ background: '#f6ffed', marginTop: 8 }}>
                      <Text code style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                        {api.successResponse}
                      </Text>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Text strong style={{ color: '#ff4d4f' }}>Error Response</Text>
                    <Card size="small" style={{ background: '#fff2f0', marginTop: 8 }}>
                      <Text code style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                        {api.errorResponse}
                      </Text>
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          }))}
        />
      </Card>
    </div>
  );
};

export default ApiDocsPage;
