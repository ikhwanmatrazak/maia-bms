# MAIA BMS — Business Management System

A full-stack internal Business Management System for MAIA covering quotations, invoices, receipts, CRM, finance, and reporting.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14+ (App Router) + HeroUI + Tailwind CSS |
| Backend | Python FastAPI |
| Database | MySQL — Azure Database for MySQL Flexible Server (B1ms) |
| ORM | SQLAlchemy (async) + Alembic |
| Auth | JWT (access + refresh tokens) |
| PDF | WeasyPrint + Jinja2 |
| Email | SMTP via FastAPI-Mail |

## Prerequisites

- Node.js 18+
- Python 3.11+
- Git
- Azure MySQL Flexible Server (or local MySQL 8.0 for development)

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_ORG/maia-bms.git
cd maia-bms
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your database credentials and secrets
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup (new terminal)

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local with your API URL
npm run dev
```

Frontend runs at: http://localhost:3000
Backend API runs at: http://localhost:8000
API Docs (Swagger): http://localhost:8000/docs

## Azure MySQL B1ms Setup

1. Create Azure Database for MySQL Flexible Server
2. Select: Burstable, B1ms (1 vCore, 2 GiB RAM) ~$13/month
3. MySQL version: 8.0
4. Enable SSL enforcement
5. Add firewall rule for your backend server IP
6. Download SSL certificate: `DigiCertGlobalRootCA.crt.pem` from Azure portal
7. Create database: `maia_db`
8. Run migrations: `alembic upgrade head`

## Environment Variables

### Backend (.env)

```env
DATABASE_URL=mysql+aiomysql://user:pass@server.mysql.database.azure.com:3306/maia_db?ssl_ca=/path/to/DigiCertGlobalRootCA.crt.pem
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000
ENCRYPTION_KEY=your-32-byte-aes-key-base64-encoded
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## Deployment

### Frontend → Vercel

1. Connect GitHub repo to Vercel
2. Set root directory to `frontend/`
3. Add environment variables in Vercel dashboard

### Backend → Railway

1. Connect GitHub repo to Railway
2. Set root directory to `backend/`
3. Add environment variables
4. Railway auto-deploys on push to `main`

## Project Structure

```
maia-bms/
├── frontend/          # Next.js App Router
├── backend/           # FastAPI Python App
├── .github/workflows/ # CI/CD pipelines
└── README.md
```

## Features

- **Document Lifecycle**: Quotation → Invoice → Receipt
- **Mini CRM**: Contacts, activity logs, follow-up reminders
- **Finance & Reporting**: Revenue dashboard, overdue tracking, P&L
- **Multi-currency**: Per-document currency with exchange rates
- **Custom tax rates**: Per line item tax configuration
- **Role-based access**: Admin, Manager, Staff
- **Payment tracking**: Full + partial payments with proof uploads
- **PDF generation**: 3 templates (Minimal, Professional, Modern)
- **Email delivery**: Configurable SMTP with PDF attachments

## Default Login (after seeding)

```
Email: admin@maia.com
Password: Admin@123
```

## License

Internal use only — MAIA
