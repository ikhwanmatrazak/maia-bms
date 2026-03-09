from fastapi import HTTPException, status, Depends
from app.models.user import User, UserRole
from app.middleware.auth import get_current_user
from typing import List


def get_effective_tenant_id(current_user: User):
    """Return switched_tenant_id if set (super admin viewing a tenant), else own tenant_id."""
    switched = getattr(current_user, "switched_tenant_id", None)
    return switched if switched is not None else current_user.tenant_id


def apply_tenant_filter(query, model, current_user: User):
    """Filter query by tenant unless caller is super admin (without switching)."""
    switched = getattr(current_user, "switched_tenant_id", None)
    if switched is not None:
        # Super admin is viewing a specific tenant
        query = query.where(model.tenant_id == switched)
    elif not current_user.is_super_admin and current_user.tenant_id is not None:
        query = query.where(model.tenant_id == current_user.tenant_id)
    return query


def require_roles(*roles: UserRole):
    """Dependency factory: requires user to have one of the specified roles."""
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {[r.value for r in roles]}"
            )
        return current_user
    return role_checker


def require_admin():
    return require_roles(UserRole.admin)


def require_admin_or_manager():
    return require_roles(UserRole.admin, UserRole.manager)


def require_any_role():
    return require_roles(UserRole.admin, UserRole.manager, UserRole.staff)


class OwnershipChecker:
    """Checks if the current user owns a resource or has elevated privileges."""

    @staticmethod
    def can_edit(current_user: User, resource_created_by: int) -> bool:
        """Admin/Manager can edit any; Staff can only edit own."""
        if current_user.role in (UserRole.admin, UserRole.manager):
            return True
        return current_user.id == resource_created_by

    @staticmethod
    def can_delete(current_user: User) -> bool:
        """Only admin can delete."""
        return current_user.role == UserRole.admin

    @staticmethod
    def can_view_all(current_user: User) -> bool:
        """Admin/Manager can see all; Staff sees own only."""
        return current_user.role in (UserRole.admin, UserRole.manager)
