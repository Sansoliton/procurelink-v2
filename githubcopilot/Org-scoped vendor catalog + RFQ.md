Build the Vendor and RFQ modules for ProcureLink with org-scoped isolation (Sprint 7-8).

IMPORTANT: vendors belong to an org. Each org sees only its own vendor catalog.

1. backend/app/models/vendor.py
   Vendor(id, org_id FK→organisations,  ← tenant scope
          name, email, categories TEXT[], rating FLOAT, is_active BOOL, created_at)

   RFQ(id, org_id FK, project_id FK, requirement_id FK, vendor_id FK,
       status ENUM(pending,sent,responded,expired),
       deadline TIMESTAMPTZ, sent_at, responded_at, reminder_count INT DEFAULT 0)

   QuoteLine(id, rfq_id FK, line_item_id FK, unit_price FLOAT, lead_days INT, notes TEXT)

2. backend/app/repositories/vendor_repo.py
   EVERY method filters by org_id:
   list_active(org_id) -> list[Vendor]
   get_by_id(vendor_id, org_id) -> Vendor | 404
   create(org_id, data) -> Vendor
   update(vendor_id, org_id, data) -> Vendor
   match_by_categories(org_id, categories: list[str]) -> list[Vendor]
     SQL: WHERE org_id=:org_id AND categories && :categories

3. backend/app/services/rfq_service.py
   All methods take current_user for org_id:

   match_vendors(req_id, current_user, db) -> list[Vendor]
     Gets line item categories, queries vendor_repo.match_by_categories(org_id, cats)

   send_rfqs(req_id, vendor_ids, current_user, db) -> list[RFQ]
     Validates all vendor_ids belong to org
     Creates RFQ records, fires send_rfq_email_task via Celery per vendor

   send_reminder(rfq_id, current_user, db) -> RFQ
     Validates rfq.org_id == current_user.org_id
     Increments reminder_count, fires email task

   submit_quote(rfq_id, lines, db) -> RFQ
     PUBLIC endpoint — validates rfq exists (no auth required)
     Creates QuoteLine records, sets status=responded
     Fires internal notification: quote received

   check_expired(db) -> int
     Celery Beat task: UPDATE rfqs SET status=expired
     WHERE deadline < NOW() AND status=sent

4. backend/app/services/email_service.py using Jinja2 templates
   Templates in backend/app/templates/:
   - rfq_email.html    (vendor RFQ with line items table)
   - quote_ready.html  (customer — quote ready to review)
   - po_confirm.html   (vendor — PO raised)
   - invoice.html      (customer — invoice with amount due)
   Falls back to console print if SENDGRID_API_KEY not set (dev mode)
   In dev: sends to MailHog SMTP on localhost:1025

5. backend/app/routers/vendors.py + rfqs.py
   All vendor endpoints require org-admin role.
   GET  /vendors/                       (org_id from current_user)
   POST /vendors/
   PUT  /vendors/{id}
   GET  /vendors/match/{req_id}

   POST /rfqs/send/{req_id}             (buyer+ role)
   GET  /rfqs/requirement/{req_id}      (buyer+ role)
   POST /rfqs/{id}/respond              (PUBLIC — no auth)
   POST /rfqs/{id}/remind               (buyer+ role)

6. frontend/src/pages/vendor/VendorPortalPage.tsx
   PUBLIC route: /vendor-portal/:rfqId
   No auth required. Shows RFQ + line items.
   Input: unit_price and lead_days per line.
   Submit → POST /rfqs/:id/respond. Success message.

7. frontend/src/pages/internal/VendorCatalogPage.tsx
   Only visible to org-admin role.
   TanStack Table: vendors, categories (tag chips), rating, active toggle.
   Add vendor modal (React Hook Form + Zod).

Show all files in full.