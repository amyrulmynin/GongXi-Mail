# GongXi Mail

An API service for retrieving emails via Microsoft OAuth2.

## Tech Stack

- **Backend**: Fastify 5 + TypeScript + Prisma 6
- **Database**: PostgreSQL
- **Cache**: Redis
- **Frontend**: React + Ant Design + Vite

## Project Structure

```
├── server/                 # Backend service
│   ├── src/
│   │   ├── config/        # Environment configuration
│   │   ├── lib/           # Core libraries
│   │   ├── plugins/       # Fastify plugins
│   │   ├── modules/       # Business modules
│   ├── prisma/            # Database schema
│   └── package.json
├── web/                    # Frontend admin panel
├── docker-compose.yml
└── Dockerfile
```

## Quick Start

### Docker Deployment

For production, inject secrets externally (do not hardcode them in the repository):

```bash
export JWT_SECRET="replace-with-at-least-32-char-random-secret"
export ENCRYPTION_KEY="replace-with-32-character-secret-key"
export ADMIN_PASSWORD="replace-with-strong-password"
```

Then start:

```bash
docker-compose up -d --build
```

Visit http://localhost:3000

### Health Check

```bash
curl http://localhost:3000/health
# {"success":true,"data":{"status":"ok"}}
```

## Development Quality Checks

```bash
# Frontend
cd web
npm run lint
npm run build

# Backend
cd ../server
npm run lint
npm run lint:fix
npm run build
npm run test
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| NODE_ENV | Environment | development |
| PORT | Port | 3000 |
| DATABASE_URL | PostgreSQL connection | - |
| REDIS_URL | Redis connection | - |
| CORS_ORIGIN | Allowed cross-origin sources (comma-separated) | Open by default in development |
| JWT_SECRET | JWT secret (>=32 chars) | - |
| JWT_EXPIRES_IN | Token expiration | 2h |
| ENCRYPTION_KEY | Encryption key (32 chars) | - |
| ADMIN_USERNAME | Default admin username | admin |
| ADMIN_PASSWORD | Default admin password (default value forbidden in production) | - |
| ADMIN_LOGIN_MAX_ATTEMPTS | Max consecutive admin login failures | 5 |
| ADMIN_LOGIN_LOCK_MINUTES | Login failure lock duration (minutes) | 15 |
| ADMIN_2FA_SECRET | Optional admin TOTP Base32 secret | - |
| ADMIN_2FA_WINDOW | TOTP time window (steps) | 1 |
| API_LOG_RETENTION_DAYS | API log retention days | 30 |
| API_LOG_CLEANUP_INTERVAL_MINUTES | API log cleanup interval (minutes) | 60 |

## Enum Conventions

To avoid inconsistency between frontend and backend, all enums use uppercase:

| Type | Enum Values |
|------|-------------|
| Admin role | `SUPER_ADMIN` / `ADMIN` |
| Admin / API Key status | `ACTIVE` / `DISABLED` |

## Mail Fetch Strategy (Group Level)

Email groups support a configurable `fetchStrategy`; all emails in the same group use that strategy:

| Strategy | Behavior |
|----------|----------|
| `GRAPH_FIRST` | Try Graph first, fall back to IMAP on failure |
| `IMAP_FIRST` | Try IMAP first, fall back to Graph on failure |
| `GRAPH_ONLY` | Graph only, no fallback |
| `IMAP_ONLY` | IMAP only, no fallback |

Note: `IMAP_ONLY` does not support "clear mailbox (process-mailbox)"; that operation depends on the Graph API.

## API Documentation

### External API (`/api/*`)

Requests must include the API key in the HTTP header: `X-API-Key: sk_xxx`

#### Endpoint List

| Endpoint | Description | Notes |
|----------|-------------|-------|
| `/api/get-email` | Get an unused email address | Marks it as used by the current key |
| `/api/mail_new` | Get the latest email | - |
| `/api/mail_text` | Get the latest email text (script friendly) | Regex can be used to extract content |
| `/api/mail_all` | Get all emails | - |
| `/api/process-mailbox` | Clear mailbox | `data.deletedCount` is the number deleted |
| `/api/list-emails` | Get all available emails in the system | - |
| `/api/pool-stats` | Email pool statistics | - |
| `/api/reset-pool` | Reset allocation records | Releases all email markings held by the current key |

#### Usage Flow

1. **Get an email**:
   ```bash
   curl -X POST "/api/get-email" -H "X-API-Key: sk_xxx"
   # {"success": true, "data": {"email": "xxx@outlook.com"}}
   ```

2. **Get email content (recommended)**:
   Automatically extract a verification code (6 digits):
   ```bash
   curl "/api/mail_text?email=xxx@outlook.com&match=\\d{6}" -H "X-API-Key: sk_xxx"
   # Returns: 123456
   ```

3. **Get full email (JSON)**:
   ```bash
   curl -X POST "/api/mail_new" -H "X-API-Key: sk_xxx" \
     -d '{"email": "xxx@outlook.com"}'
   ```

#### Parameter Reference

**Common parameters**:
| Parameter | Description |
|-----------|-------------|
| email | Email address (required) |
| mailbox | Folder: inbox/junk |
| socks5 | SOCKS5 proxy |
| http | HTTP proxy |

**`/api/mail_text` specific parameters**:
| Parameter | Description |
|-----------|-------------|
| match | Regex pattern used to extract specific content (e.g. `\d{6}`) |

## Operation Log Action Names

The `action` field in `/admin/dashboard/logs` uses the following fixed values:

| Action | Meaning |
|--------|---------|
| `get_email` | Allocate email |
| `mail_new` | Get latest email |
| `mail_text` | Get email text |
| `mail_all` | Get all emails |
| `process_mailbox` | Clear mailbox |
| `list_emails` | Get email list |
| `pool_stats` | Email pool statistics |
| `pool_reset` | Reset email pool |

## API Key Permission Keys

The `permissions` field of an API Key uses the same action values from the table above (e.g. `mail_new`, `process_mailbox`).
If `permissions` is not configured, all endpoints are allowed by default.

## Production Configuration Requirements

- `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_PASSWORD` must be injected via external environment variables.
- If 2FA is enabled, `ADMIN_2FA_SECRET` must also be injected via an external environment variable.
- Do not hardcode production secrets in `docker-compose.yml`, `.env`, or the code repository.
- `server/.env.example` is only a template; it must not be used directly in production.
- If cross-origin access is required, configure `CORS_ORIGIN` (e.g. `https://admin.example.com,https://ops.example.com`).
- In production mode the server pre-generates `.gz/.br` compressed files for frontend static assets on startup, and serves the compressed version first.
- The service automatically prunes historical API logs based on `API_LOG_RETENTION_DAYS` and `API_LOG_CLEANUP_INTERVAL_MINUTES`.

## License

MIT
