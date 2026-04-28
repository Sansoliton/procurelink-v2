# Graph Report - .  (2026-04-26)

## Corpus Check
- Corpus is ~19,453 words - fits in a single context window. You may not need a graph.

## Summary
- 284 nodes · 474 edges · 21 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 69 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Auth & Invite Flow|Auth & Invite Flow]]
- [[_COMMUNITY_DB Models & Seed Data|DB Models & Seed Data]]
- [[_COMMUNITY_Pydantic Schemas|Pydantic Schemas]]
- [[_COMMUNITY_API Routers (Procurement)|API Routers (Procurement)]]
- [[_COMMUNITY_Project Overview & Stack|Project Overview & Stack]]
- [[_COMMUNITY_JWT & Auth Service|JWT & Auth Service]]
- [[_COMMUNITY_Regex Parser Service|Regex Parser Service]]
- [[_COMMUNITY_API Test Suite|API Test Suite]]
- [[_COMMUNITY_React Auth Context|React Auth Context]]
- [[_COMMUNITY_UI Component Library|UI Component Library]]
- [[_COMMUNITY_Frontend Utilities|Frontend Utilities]]
- [[_COMMUNITY_Submit Requirement Page|Submit Requirement Page]]
- [[_COMMUNITY_App Configuration|App Configuration]]
- [[_COMMUNITY_Vendor Catalog Page|Vendor Catalog Page]]
- [[_COMMUNITY_Alembic Migrations|Alembic Migrations]]
- [[_COMMUNITY_Database Session|Database Session]]
- [[_COMMUNITY_Project Context|Project Context]]
- [[_COMMUNITY_FastAPI Main App|FastAPI Main App]]
- [[_COMMUNITY_HTTPX HTTP Client|HTTPX HTTP Client]]
- [[_COMMUNITY_Ruff Linter|Ruff Linter]]
- [[_COMMUNITY_Pytest Async|Pytest Async]]

## God Nodes (most connected - your core abstractions)
1. `Backend Stack (Python 3.11 + FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL)` - 13 edges
2. `parse_text_to_items()` - 9 edges
3. `seed()` - 8 edges
4. `register_user()` - 8 edges
5. `ProcureLink v2 Platform` - 8 edges
6. `auth_service (register, login, invite, accept_invitation, get_current_user, require_role)` - 8 edges
7. `Organisation Model (Tenant Root)` - 7 edges
8. `ProjectMember` - 6 edges
9. `create_requirement()` - 6 edges
10. `Project Model` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Backend Stack (Python 3.11 + FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL)` --implements--> `SlowAPI Rate Limiting`  [INFERRED]
  README.md → backend/requirements.txt
- `Alembic Migration (multi-tenant tables: org, user, project, member, invitation)` --references--> `Alembic DB Migrations`  [INFERRED]
  githubcopilot/Multi-tenant schema + auth.md → backend/requirements.txt
- `ReportLab PDF Generation` --conceptually_related_to--> `Procurement Workflow (Org â†’ Project â†’ Requirements â†’ RFQs â†’ Quotes â†’ PO â†’ Invoice)`  [INFERRED]
  backend/requirements.txt → githubcopilot/Projectcontext.md
- `register_user()` --calls--> `Organisation`  [INFERRED]
  E:\2026\procurelink\procurelink-v2-starter\procurelink-v2\backend\app\services\auth_service.py → E:\2026\procurelink\procurelink-v2-starter\procurelink-v2\backend\app\models\__init__.py
- `register_user()` --calls--> `User`  [INFERRED]
  E:\2026\procurelink\procurelink-v2-starter\procurelink-v2\backend\app\services\auth_service.py → E:\2026\procurelink\procurelink-v2-starter\procurelink-v2\backend\app\models\__init__.py

## Hyperedges (group relationships)
- **Multi-tenant Data Layer (ORM Models)** — multitenant_organisation_model, multitenant_user_model, multitenant_project_model, multitenant_projectmember_model, multitenant_invitation_model [EXTRACTED 1.00]
- **Authentication & Invitation Workflow** — multitenant_auth_service, multitenant_auth_router, multitenant_login_page, multitenant_register_page, multitenant_accept_invite_page [EXTRACTED 1.00]
- **Backend Core Technology Stack** — requirements_fastapi, requirements_sqlalchemy, requirements_alembic, requirements_celery, requirements_redis_client, requirements_pydantic, requirements_psycopg2_binary [EXTRACTED 1.00]
- **Requirements CRUD Module (tenant-scoped)** — tenantreqs_requirement_model, tenantreqs_lineitem_model, tenantreqs_requirement_repo, tenantreqs_requirement_service, tenantreqs_requirements_router [EXTRACTED 1.00]
- **Frontend Auth Pages** — multitenant_login_page, multitenant_register_page, multitenant_accept_invite_page [EXTRACTED 1.00]
- **Tenant Isolation Enforcement Pattern** — projectcontext_tenant_isolation_rule, tenantreqs_requirement_repo, multitenant_org_repo, multitenant_project_repo, tenantreqs_org_id_enforcement_rationale [EXTRACTED 1.00]
- **Security & Auth Python Packages** — requirements_python_jose, requirements_passlib, requirements_slowapi [EXTRACTED 1.00]
- **Requirements Frontend Submission Flow** — tenantreqs_submit_page, tenantreqs_use_requirements_hook, multitenant_project_switcher, tenantreqs_parse_text_regex [EXTRACTED 1.00]

## Communities

### Community 0 - "Auth & Invite Flow"
Cohesion: 0.09
Nodes (36): AcceptInvitePage (frontend/src/pages/auth/), Alembic Migration (multi-tenant tables: org, user, project, member, invitation), auth Router (POST /auth/register|login|invite|accept-invite, GET /auth/me), auth_service (register, login, invite, accept_invitation, get_current_user, require_role), Invitation Model (token-based invite flow), LoginPage (frontend/src/pages/auth/), org_repo (Organisation Repository), Organisation Model (Tenant Root) (+28 more)

### Community 1 - "DB Models & Seed Data"
Cohesion: 0.15
Nodes (31): Base, AuditLog, create_project(), gen_uuid(), Invitation, Invoice, InvoiceStatus, LineItem (+23 more)

### Community 2 - "Pydantic Schemas"
Cohesion: 0.17
Nodes (30): BaseModel, AcceptInviteRequest, AnalyticsOverviewOut, Config, InviteRequest, InvoiceOut, LineItemCreate, LineItemOut (+22 more)

### Community 3 - "API Routers (Procurement)"
Cohesion: 0.13
Nodes (30): add_member(), analytics_overview(), approve_quotation(), build_quotation(), create_requirement(), create_vendor(), export_invoice(), _gen_ref() (+22 more)

### Community 4 - "Project Overview & Stack"
Cohesion: 0.09
Nodes (23): Frontend HTML Entry Point (index.html), Google Fonts (Plus Jakarta Sans, Fira Code), main.tsx React Root Module, Backend Stack (Python 3.11 + FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL), Frontend Stack (React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui), MailHog (Dev Email Server), Observability Stack (Prometheus + Grafana), ProcureLink v2 Platform (+15 more)

### Community 5 - "JWT & Auth Service"
Cohesion: 0.17
Nodes (16): create_access_token(), get_current_user(), _get_user_from_token(), hash_password(), login_user(), Create organisation + first user (org-admin) in one transaction., register_user(), require_org_admin() (+8 more)

### Community 6 - "Regex Parser Service"
Cohesion: 0.4
Nodes (8): _clean_numbering(), _detect_category(), _extract_qty(), _extract_unit(), parse_text_to_items(), Requirement text parser — pure regex, no AI. Extracts line items from free-form, Remove leading list numbers like '1.' '1)' '- ' '*, Parse free-form requirement text into structured line items.     Splits on newli

### Community 7 - "API Test Suite"
Cohesion: 0.43
Nodes (6): override_get_db(), test_create_project(), test_create_requirement_with_parser(), test_health(), test_me_requires_auth(), test_register_and_login()

### Community 8 - "React Auth Context"
Cohesion: 0.32
Nodes (4): linkCls(), PrivateRoute(), AuthProvider(), useAuth()

### Community 9 - "UI Component Library"
Cohesion: 0.43
Nodes (6): Badge(), Button(), EmptyState(), Spinner(), StatusBadge(), StepBar()

### Community 10 - "Frontend Utilities"
Cohesion: 0.43
Nodes (6): cn(), formatCurrency(), formatDate(), formatDateTime(), statusLabel(), timeAgo()

### Community 11 - "Submit Requirement Page"
Cohesion: 0.53
Nodes (4): addItem(), loadVendors(), removeItem(), updateItem()

### Community 12 - "App Configuration"
Cohesion: 0.5
Nodes (3): BaseSettings, Config, Settings

### Community 13 - "Vendor Catalog Page"
Cohesion: 0.6
Nodes (3): resetForm(), startEdit(), toggleCategory()

### Community 14 - "Alembic Migrations"
Cohesion: 0.67
Nodes (2): run_migrations_offline(), run_migrations_online()

### Community 15 - "Database Session"
Cohesion: 0.5
Nodes (2): get_db(), FastAPI dependency — yields a DB session and closes it after the request.

### Community 16 - "Project Context"
Cohesion: 0.67
Nodes (2): ProjectProvider(), useProject()

### Community 17 - "FastAPI Main App"
Cohesion: 0.67
Nodes (1): root()

### Community 48 - "HTTPX HTTP Client"
Cohesion: 1.0
Nodes (1): httpx HTTP Client

### Community 49 - "Ruff Linter"
Cohesion: 1.0
Nodes (1): Ruff Linter

### Community 50 - "Pytest Async"
Cohesion: 1.0
Nodes (1): pytest-asyncio Async Test Support

## Knowledge Gaps
- **32 isolated node(s):** `FastAPI dependency — yields a DB session and closes it after the request.`, `Send an email. Falls back to logging if SMTP not configured.`, `Mark overdue RFQs as expired.`, `Public endpoint — vendor submits quote (no auth required).`, `Create organisation + first user (org-admin) in one transaction.` (+27 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Alembic Migrations`** (4 nodes): `env.py`, `env.py`, `run_migrations_offline()`, `run_migrations_online()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Database Session`** (4 nodes): `database.py`, `get_db()`, `FastAPI dependency — yields a DB session and closes it after the request.`, `database.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Project Context`** (4 nodes): `ProjectContext.tsx`, `ProjectContext.tsx`, `ProjectProvider()`, `useProject()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `FastAPI Main App`** (3 nodes): `main.py`, `main.py`, `root()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTTPX HTTP Client`** (1 nodes): `httpx HTTP Client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ruff Linter`** (1 nodes): `Ruff Linter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pytest Async`** (1 nodes): `pytest-asyncio Async Test Support`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `parse_text_to_items()` connect `Regex Parser Service` to `Pydantic Schemas`, `API Routers (Procurement)`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `create_requirement()` connect `API Routers (Procurement)` to `DB Models & Seed Data`, `Regex Parser Service`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Why does `LineItemCreate` connect `Pydantic Schemas` to `Regex Parser Service`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `Backend Stack (Python 3.11 + FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL)` (e.g. with `pydantic-settings Configuration` and `psycopg2-binary PostgreSQL Driver`) actually correct?**
  _`Backend Stack (Python 3.11 + FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL)` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `parse_text_to_items()` (e.g. with `create_requirement()` and `LineItemCreate`) actually correct?**
  _`parse_text_to_items()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `FastAPI dependency — yields a DB session and closes it after the request.`, `Send an email. Falls back to logging if SMTP not configured.`, `Mark overdue RFQs as expired.` to the rest of the system?**
  _32 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth & Invite Flow` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._