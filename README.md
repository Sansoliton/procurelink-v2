# ProcureLink v2 — Multi-Tenant B2B Procurement Platform

## Stack
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Python 3.11 + FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL
- **Queue**: Redis + Celery (async email + PDF tasks)
- **Storage**: MinIO (local) / AWS S3 (prod)
- **Email dev**: MailHog
- **Observability**: Prometheus + Grafana

## Quick start (Docker)
```bash
cp backend/.env.example backend/.env
docker-compose up -d
docker-compose exec api alembic upgrade head
docker-compose exec api python -m app.scripts.seed_demo
```
Services:
- API:      http://localhost:8000   (Swagger: /docs)
- Frontend: http://localhost:5173
- MailHog:  http://localhost:8025
- MinIO:    http://localhost:9001
- Flower:   http://localhost:5555
- Grafana:  http://localhost:3001

## Manual setup

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Project structure
```
procurelink-v2/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Settings (pydantic-settings)
│   │   ├── database.py          # DB engine + session
│   │   ├── worker.py            # Celery app + tasks
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── routers/             # FastAPI route modules
│   │   ├── services/            # Business logic layer
│   │   ├── repositories/        # DB query layer
│   │   ├── middleware/          # Rate limiting, error handling
│   │   └── templates/           # Jinja2 email templates
│   ├── alembic/                 # DB migrations
│   ├── tests/                   # pytest suite
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── pages/               # One folder per module
│   │   ├── components/          # Shared UI components
│   │   ├── hooks/               # React Query hooks
│   │   ├── api/                 # Axios API client
│   │   ├── types/               # TypeScript interfaces
│   │   ├── lib/                 # Utilities
│   │   └── context/             # React contexts
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
├── Makefile
└── monitoring/
    └── prometheus.yml
```
