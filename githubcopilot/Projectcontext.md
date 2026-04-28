You are building ProcureLink v2 — a multi-tenant, multi-project, multi-user
B2B procurement platform. No AI/LLM. Pure business logic.

CORE CONCEPT:
  Organisation (tenant) → Projects → Requirements → RFQs → Quotes → PO → Invoice
  Each org has its own: users, projects, vendor catalog, settings
  Each project has: requirements, rfqs, quotations, pos, invoices, members

ROLES:
  super-admin : system-wide, all orgs
  org-admin   : manage own org, all projects in org
  buyer       : create/manage requirements in assigned projects
  vendor-user : receive RFQs, submit quotes (vendor orgs only)
  viewer      : read-only in assigned projects

TENANT ISOLATION RULE:
  Every DB query must include org_id filter.
  org_id always comes from current_user.org_id (never from request body).
  Return 404 (not 403) for resources in other orgs.

OPEN SOURCE STACK:
  Frontend : React 18 + Vite + TypeScript + Tailwind CSS
             shadcn/ui · TanStack Table · React Hook Form · Zod · Recharts
  Backend  : Python 3.11 + FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2
             Celery + Redis · ReportLab · SlowAPI · Jinja2
  DB       : PostgreSQL 16
  Dev      : Docker Compose + MinIO (S3) + MailHog + Flower
  Test     : pytest + Playwright + factory-boy + Locust
  Obs      : Prometheus + Grafana

ARCHITECTURE PATTERN:
  Router → Service → Repository → DB
  All repos filter by org_id from current_user
  Services contain all business logic
  Routers only handle HTTP concerns