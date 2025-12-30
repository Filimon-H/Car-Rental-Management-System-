"""Unit tests for RBAC primitives."""

import pytest

from src.core.rbac import (
    Permission,
    Role,
    ROLE_PERMISSIONS,
    has_permission,
    has_any_permission,
    has_all_permissions,
)


class TestRolePermissions:
    """Test role permission mappings."""

    def test_admin_has_all_permissions(self):
        """Admin role should have all permissions."""
        assert ROLE_PERMISSIONS[Role.ADMIN] == set(Permission)

    def test_sales_has_customer_permissions(self):
        """Sales role should have customer management permissions."""
        assert has_permission(Role.SALES, Permission.VIEW_CUSTOMERS)
        assert has_permission(Role.SALES, Permission.MANAGE_CUSTOMERS)
        assert has_permission(Role.SALES, Permission.CREATE_AGREEMENTS)

    def test_sales_cannot_manage_users(self):
        """Sales role should not have user management permission."""
        assert not has_permission(Role.SALES, Permission.MANAGE_USERS)

    def test_fleet_has_vehicle_permissions(self):
        """Fleet role should have vehicle management permissions."""
        assert has_permission(Role.FLEET, Permission.VIEW_VEHICLES)
        assert has_permission(Role.FLEET, Permission.MANAGE_VEHICLES)
        assert has_permission(Role.FLEET, Permission.MANAGE_VENDORS)

    def test_fleet_cannot_create_agreements(self):
        """Fleet role should not create agreements."""
        assert not has_permission(Role.FLEET, Permission.CREATE_AGREEMENTS)

    def test_inspector_has_inspection_permissions(self):
        """Inspector role should have inspection permissions."""
        assert has_permission(Role.INSPECTOR, Permission.VIEW_INSPECTIONS)
        assert has_permission(Role.INSPECTOR, Permission.MANAGE_INSPECTIONS)
        assert has_permission(Role.INSPECTOR, Permission.PRINT_DOCUMENTS)

    def test_inspector_cannot_post_payments(self):
        """Inspector role should not post payments."""
        assert not has_permission(Role.INSPECTOR, Permission.POST_PAYMENTS)

    def test_accountant_has_financial_permissions(self):
        """Accountant role should have financial permissions."""
        assert has_permission(Role.ACCOUNTANT, Permission.VIEW_LEDGER)
        assert has_permission(Role.ACCOUNTANT, Permission.POST_PAYMENTS)
        assert has_permission(Role.ACCOUNTANT, Permission.POST_ADJUSTMENTS)
        assert has_permission(Role.ACCOUNTANT, Permission.VIEW_REPORTS)

    def test_accountant_cannot_manage_vehicles(self):
        """Accountant role should not manage vehicles."""
        assert not has_permission(Role.ACCOUNTANT, Permission.MANAGE_VEHICLES)


class TestPermissionHelpers:
    """Test permission helper functions."""

    def test_has_permission_returns_true_for_valid(self):
        """has_permission returns True for valid role-permission pair."""
        assert has_permission(Role.ADMIN, Permission.MANAGE_USERS) is True

    def test_has_permission_returns_false_for_invalid(self):
        """has_permission returns False for invalid role-permission pair."""
        assert has_permission(Role.INSPECTOR, Permission.MANAGE_USERS) is False

    def test_has_any_permission_with_one_valid(self):
        """has_any_permission returns True if at least one permission matches."""
        permissions = [Permission.MANAGE_USERS, Permission.VIEW_VEHICLES]
        assert has_any_permission(Role.FLEET, permissions) is True

    def test_has_any_permission_with_none_valid(self):
        """has_any_permission returns False if no permissions match."""
        permissions = [Permission.MANAGE_USERS, Permission.POST_ADJUSTMENTS]
        assert has_any_permission(Role.INSPECTOR, permissions) is False

    def test_has_all_permissions_with_all_valid(self):
        """has_all_permissions returns True if all permissions match."""
        permissions = [Permission.VIEW_VEHICLES, Permission.MANAGE_VEHICLES]
        assert has_all_permissions(Role.FLEET, permissions) is True

    def test_has_all_permissions_with_some_invalid(self):
        """has_all_permissions returns False if any permission doesn't match."""
        permissions = [Permission.VIEW_VEHICLES, Permission.MANAGE_USERS]
        assert has_all_permissions(Role.FLEET, permissions) is False


class TestRoleEnumeration:
    """Test role enumeration values."""

    def test_all_roles_defined(self):
        """All expected roles are defined."""
        expected_roles = {"admin", "sales", "fleet", "inspector", "accountant"}
        actual_roles = {role.value for role in Role}
        assert actual_roles == expected_roles

    def test_all_roles_have_permissions(self):
        """All roles have at least some permissions defined."""
        for role in Role:
            assert role in ROLE_PERMISSIONS
            assert len(ROLE_PERMISSIONS[role]) > 0
