import uuid
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User, Organisation, OrgRole, Invitation

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def _get_user_from_token(token: str, db: Session) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: str = payload.get("sub")
        if not user_id:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise credentials_exception
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    return _get_user_from_token(credentials.credentials, db)


def require_org_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.org_role not in (OrgRole.org_admin, OrgRole.super_admin):
        raise HTTPException(status_code=403, detail="Organisation admin required")
    return current_user


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.org_role != OrgRole.super_admin:
        raise HTTPException(status_code=403, detail="Super admin required")
    return current_user


def register_user(org_name: str, email: str, password: str, full_name: Optional[str], db: Session):
    """Create organisation + first user (org-admin) in one transaction."""
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    slug = org_name.lower().replace(" ", "-")[:80] + "-" + str(uuid.uuid4())[:8]
    org = Organisation(name=org_name, slug=slug, type="customer")
    db.add(org)
    db.flush()

    user = User(
        org_id=org.id,
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        org_role=OrgRole.org_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login_user(email: str, password: str, db: Session) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    user.last_login = datetime.utcnow()
    db.commit()
    return user


def invite_user(email: str, org_role: str, invited_by: User, db: Session) -> Invitation:
    """Create an invitation record for a new org member."""
    existing = db.query(User).filter(User.email == email).first()
    if existing and existing.org_id == invited_by.org_id:
        raise HTTPException(status_code=400, detail="User already in organisation")
    pending = db.query(Invitation).filter(
        Invitation.email == email,
        Invitation.org_id == invited_by.org_id,
        Invitation.accepted_at == None,
    ).first()
    if pending:
        raise HTTPException(status_code=400, detail="Invitation already pending for this email")

    token = str(uuid.uuid4())
    invitation = Invitation(
        org_id=invited_by.org_id,
        email=email,
        org_role=org_role,
        token=token,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    return invitation


def accept_invitation(token: str, password: str, full_name: Optional[str], db: Session) -> User:
    """Validate invite token, create user, mark invitation accepted."""
    inv = db.query(Invitation).filter(Invitation.token == token).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if inv.accepted_at is not None:
        raise HTTPException(status_code=400, detail="Invitation already used")
    if inv.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invitation expired")

    if db.query(User).filter(User.email == inv.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        org_id=inv.org_id,
        email=inv.email,
        hashed_password=hash_password(password),
        full_name=full_name,
        org_role=inv.org_role,
        is_active=True,
    )
    db.add(user)
    inv.accepted_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user
