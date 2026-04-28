Build the Requirements module for ProcureLink with full tenant isolation (Sprint 5-6).

IMPORTANT: Every query must include org_id. project_id is also required.

1. backend/app/models/requirement.py
   Requirement(id, org_id FK, project_id FK→projects, created_by FK→users,
               project_name VARCHAR, raw_text TEXT, file_path VARCHAR,
               status ENUM(draft,submitted,rfq_sent,quotes_received,quote_ready,
                           approved,po_raised,invoiced,completed),
               delivery_date DATE, created_at, updated_at)

   LineItem(id, requirement_id FK, description, part_number, quantity FLOAT,
            unit, specs, category, sort_order INT)

2. backend/app/repositories/requirement_repo.py
   ALL methods take org_id as parameter:
   create(org_id, project_id, created_by, data) -> Requirement
   list_by_project(project_id, org_id, page, limit) -> list[Requirement]
   get_by_id(req_id, org_id) -> Requirement  (404 if org_id mismatch)
   update_status(req_id, status, org_id) -> Requirement
   add_line_items(req_id, items, org_id) -> list[LineItem]
   update_line_items(req_id, items, org_id) -> list[LineItem]

3. backend/app/services/requirement_service.py
   create(data, project_id, current_user, db) -> Requirement
     Validates user is member of project with buyer role
   parse_text_to_items(text: str) -> list[LineItemCreate]
     REGEX parser only — NO AI:
     - Split by newlines and numbered list patterns
     - Extract quantity: patterns like "50x", "50 ea", "50 units", "qty: 50"
     - Extract unit: ea/each/pcs/m/metres/kg/l/litre/set
     - Remaining text = description
   upload_file(file, req_id, current_user, db) -> str
     Upload to S3 via storage_service, update requirement.file_path
   submit(req_id, current_user, db) -> Requirement
     Validates all line items have description + qty, sets status=submitted
   edit_line_items(req_id, items, current_user, db) -> list[LineItem]

4. backend/app/routers/requirements.py
   All routes require auth. org_id always from current_user.
   GET    /projects/{project_id}/requirements/
   POST   /projects/{project_id}/requirements/
   GET    /projects/{project_id}/requirements/{id}
   PUT    /projects/{project_id}/requirements/{id}/items
   POST   /projects/{project_id}/requirements/{id}/submit
   POST   /projects/{project_id}/requirements/{id}/upload

5. frontend/src/hooks/useRequirements.ts
   All hooks accept projectId parameter
   useRequirements(projectId) — filtered list
   useRequirement(id, projectId)
   useCreateRequirement(projectId) mutation
   useSubmitRequirement(id, projectId) mutation
   useEditLineItems(id, projectId) mutation

6. frontend/src/pages/requirements/SubmitPage.tsx
   Step 1: Project auto-selected from ProjectSwitcher context
   Text area OR file upload
   "Parse" button — calls regex service, shows result
   Step 2: TanStack Table with editable cells — description, part_no, qty, unit
   Add row button, delete row button
   Submit button

Show all files in full. Show how org_id enforcement works in repositories.