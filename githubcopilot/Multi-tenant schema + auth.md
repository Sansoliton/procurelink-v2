    Build the multi-tenant foundation for ProcureLink (Sprint 1-2).

1. backend/app/models/tenant.py
   Organisation(id UUID, name, slug UNIQUE, type ENUM(customer,vendor,internal),
                plan ENUM(free,pro,enterprise) DEFAULT free, settings JSONB,
                created_at TIMESTAMPTZ)

   Project(id UUID, org_id FK, name, description TEXT, status ENUM(active,archived),
           settings JSONB, created_by FK→users, created_at)

   ProjectMember(id UUID, project_id FK, user_id FK, project_role ENUM(buyer,viewer),
                 added_at TIMESTAMPTZ)
   UNIQUE constraint on (project_id, user_id)

   Invitation(id UUID, org_id FK, email, org_role ENUM, token VARCHAR UNIQUE,
              expires_at TIMESTAMPTZ, accepted_at TIMESTAMPTZ)

2. backend/app/models/user.py
   User(id UUID, org_id FK, email UNIQUE, hashed_password, is_active BOOL,
        org_role ENUM(super-admin,org-admin,member), invited_by FK→users,
        last_login, created_at)

3. backend/app/repositories/org_repo.py
   create_org(name, type) -> Organisation
   get_by_id(org_id) -> Organisation
   update_settings(org_id, settings) -> Organisation

4. backend/app/repositories/project_repo.py
   create(org_id, name, created_by) -> Project
   list_by_org(org_id) -> list[Project]
   get_by_id(project_id, org_id) -> Project | 404
   add_member(project_id, user_id, role) -> ProjectMember
   remove_member(project_id, user_id) -> None
   get_user_projects(user_id, org_id) -> list[Project]  (via project_members join)

5. backend/app/services/auth_service.py
   register(org_name, email, password) -> {org, user, token}
     Creates org + first user with org-admin role in one transaction
   login(email, password) -> {access_token}
   invite_user(email, org_role, invited_by, db) -> Invitation
     Creates invitation record, sends email via email_service
   accept_invitation(token, password, db) -> {access_token}
     Validates token not expired, creates user, marks invitation accepted
   get_current_user(token) -> User  (FastAPI dependency)
   require_role(*roles) -> FastAPI dependency factory

6. backend/app/routers/auth.py
   POST /auth/register        {org_name, email, password}
   POST /auth/login           {email, password}
   GET  /auth/me              → UserOut
   POST /auth/invite          {email, org_role}  (org-admin only)
   POST /auth/accept-invite   {token, password}

7. backend/app/routers/projects.py
   POST   /projects/              {name, description}  (org-admin)
   GET    /projects/              → list (user's projects only)
   GET    /projects/{id}          → project detail
   PUT    /projects/{id}          (org-admin)
   POST   /projects/{id}/members  {user_id, project_role}
   DELETE /projects/{id}/members/{user_id}

8. frontend/src/pages/auth/ — LoginPage, RegisterPage, AcceptInvitePage
9. frontend/src/pages/projects/ — ProjectListPage, ProjectSettingsPage
10. frontend/src/components/ProjectSwitcher.tsx
    Dropdown in nav showing user's projects, click to switch active project
    Store active project_id in context + localStorage

Show all files. Include Alembic migration for all new tables.