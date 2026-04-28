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
