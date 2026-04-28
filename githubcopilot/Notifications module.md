Build the Notifications module for ProcureLink (Sprint 10).

1. backend/app/models/notification.py
   Notification(id UUID, org_id FK, user_id FK, project_id FK,
                type VARCHAR,  -- rfq_responded, quote_ready, po_raised, invoice_issued, reminder
                title VARCHAR, body TEXT,
                entity_type VARCHAR, entity_id UUID,  -- for deep linking
                is_read BOOL DEFAULT false,
                created_at TIMESTAMPTZ)
   Index: (user_id, is_read, created_at DESC)

2. backend/app/services/notification_service.py
   create(user_id, org_id, project_id, type, title, body, entity_type, entity_id, db)
   mark_read(notification_id, user_id, db) -> Notification
   mark_all_read(user_id, org_id, db) -> int (count updated)
   list_for_user(user_id, org_id, page, limit, unread_only) -> list[Notification]
   get_unread_count(user_id, org_id) -> int

   notify_quote_received(rfq, db):
     Finds all project members with buyer+ role
     Creates notification for each: type=rfq_responded
     title: f"{rfq.vendor.name} submitted a quote"

   notify_quote_ready(quotation, db):
     title: f"Quotation {quotation.reference} is ready to review"

   notify_po_raised(po, db):
     Notifies vendor users in the vendor org

3. backend/app/routers/notifications.py
   GET  /notifications/              ?unread_only=true&page=1&limit=20
   GET  /notifications/count         → {unread: int}
   PUT  /notifications/{id}/read
   PUT  /notifications/read-all

4. Wire into existing services:
   rfq_service.submit_quote → call notify_quote_received
   quote_service.build_quotation → call notify_quote_ready
   po_service.raise_po → call notify_po_raised

5. frontend/src/components/NotificationBell.tsx
   Bell icon in top nav with red badge showing unread count.
   useQuery polling /notifications/count every 30 seconds.
   Click opens dropdown drawer: list of notifications (shadcn Popover).
   Each notification: icon, title, body, time ago (date-fns formatDistanceToNow).
   Click notification: marks read + navigates to entity (deep link).
   "Mark all read" button at top.

6. frontend/src/hooks/useNotifications.ts
   useNotificationCount() — polls every 30s
   useNotifications(unreadOnly) — paginated list
   useMarkRead(id) — mutation
   useMarkAllRead() — mutation

Show all files in full.