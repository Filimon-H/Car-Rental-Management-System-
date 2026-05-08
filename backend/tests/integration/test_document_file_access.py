"""Integration tests for protected document file routes."""

from fastapi.testclient import TestClient


class TestDocumentFileAccess:
    """Ensure sensitive document files are not accessible anonymously."""

    def test_customer_document_file_requires_auth(self, client: TestClient):
        response = client.get("/api/customers/1/documents/1/file")
        assert response.status_code == 401

    def test_customer_document_file_rejects_invalid_token(self, client: TestClient):
        response = client.get(
            "/api/customers/1/documents/1/file",
            headers={"Authorization": "Bearer invalid-token"},
        )
        assert response.status_code == 401

    def test_collateral_document_file_requires_auth(self, client: TestClient):
        response = client.get("/api/collaterals/1/documents/1/file")
        assert response.status_code == 401

    def test_collateral_document_file_rejects_invalid_token(self, client: TestClient):
        response = client.get(
            "/api/collaterals/1/documents/1/file",
            headers={"Authorization": "Bearer invalid-token"},
        )
        assert response.status_code == 401
