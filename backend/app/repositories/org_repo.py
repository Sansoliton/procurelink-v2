from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Organisation


def create_org(name: str, org_type: str, db: Session) -> Organisation:
    from app.models import OrgType
    import uuid
    slug = name.lower().replace(" ", "-")[:80] + "-" + str(uuid.uuid4())[:8]
    org = Organisation(name=name, slug=slug, type=org_type)
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def get_by_id(org_id: str, db: Session) -> Organisation:
    org = db.get(Organisation, org_id)
    if not org:
        raise HTTPException(404, "Organisation not found")
    return org


def update_settings(org_id: str, settings: dict, db: Session) -> Organisation:
    org = get_by_id(org_id, db)
    org.settings = {**(org.settings or {}), **settings}
    db.commit()
    db.refresh(org)
    return org
