from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery(
    "procurelink",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.worker"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "app.worker.send_email_task": {"queue": "emails"},
        "app.worker.generate_pdf_task": {"queue": "pdfs"},
    },
    beat_schedule={
        "check-expired-rfqs": {
            "task": "app.worker.check_expired_rfqs_task",
            "schedule": crontab(minute=0),  # every hour
        },
    },
)


@celery_app.task(name="app.worker.send_email_task", bind=True, max_retries=3)
def send_email_task(self, to: str, subject: str, html_body: str):
    """Send an email. Falls back to logging if SMTP not configured."""
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.email_from
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.email_from, [to], msg.as_string())
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"Email to {to} failed: {exc}. Subject: {subject}")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.worker.check_expired_rfqs_task")
def check_expired_rfqs_task():
    """Mark overdue RFQs as expired."""
    from datetime import datetime
    from app.database import SessionLocal
    from app.models import RFQ, RFQStatus

    db = SessionLocal()
    try:
        expired = db.query(RFQ).filter(
            RFQ.status == RFQStatus.sent,
            RFQ.deadline < datetime.utcnow(),
        ).all()
        for rfq in expired:
            rfq.status = RFQStatus.expired
        db.commit()
        return f"Expired {len(expired)} RFQs"
    finally:
        db.close()


@celery_app.task(name="app.worker.generate_pdf_task", bind=True, max_retries=3)
def generate_pdf_task(self, doc_type: str, doc_id: str, org_id: str):
    """Generate a PDF for a CustomerQuotation or CustomerInvoice and store it in MinIO."""
    try:
        from app.database import SessionLocal
        from app.models import CustomerQuotation, CustomerInvoice
        from app.config import settings
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        import boto3
        import io

        db = SessionLocal()
        try:
            if doc_type == "quotation":
                doc = db.query(CustomerQuotation).filter(
                    CustomerQuotation.id == doc_id, CustomerQuotation.org_id == org_id
                ).first()
                title = f"Quotation {doc.quotation_no}" if doc else "Quotation"
            else:
                doc = db.query(CustomerInvoice).filter(
                    CustomerInvoice.id == doc_id, CustomerInvoice.org_id == org_id
                ).first()
                title = f"Invoice {doc.invoice_no}" if doc else "Invoice"

            if not doc:
                return "Document not found"

            # Build minimal PDF
            buf = io.BytesIO()
            c = canvas.Canvas(buf, pagesize=A4)
            c.setFont("Helvetica-Bold", 16)
            c.drawString(50, 800, title)
            c.setFont("Helvetica", 10)
            c.drawString(50, 780, f"Customer: {doc.customer_name or '—'}")
            c.drawString(50, 765, f"Status: {doc.status}")
            c.drawString(50, 750, f"Total: {doc.total_amount:.2f}")
            c.save()
            buf.seek(0)

            object_name = f"pdfs/{doc_type}s/{doc_id}.pdf"
            s3 = boto3.client(
                "s3",
                endpoint_url=f"http{'s' if settings.minio_secure else ''}://{settings.minio_endpoint}",
                aws_access_key_id=settings.minio_access_key,
                aws_secret_access_key=settings.minio_secret_key,
            )
            try:
                s3.head_bucket(Bucket=settings.minio_bucket)
            except Exception:
                s3.create_bucket(Bucket=settings.minio_bucket)
            s3.put_object(
                Bucket=settings.minio_bucket,
                Key=object_name,
                Body=buf.read(),
                ContentType="application/pdf",
            )
            return f"PDF stored at {object_name}"
        finally:
            db.close()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"PDF generation failed: {exc}")
        raise self.retry(exc=exc, countdown=30)
