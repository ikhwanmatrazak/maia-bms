from pydantic import BaseModel, EmailStr
from app.models.user import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str
    user_id: int
    name: str
    email: str
    role: UserRole
    is_super_admin: bool = False
    tenant_id: int | None = None


class RefreshRequest(BaseModel):
    refresh_token: str
