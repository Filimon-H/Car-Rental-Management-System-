"""Integration tests for protected document file routes."""

from fastapi.testclient import TestClient

from tests.integration.test_agreements_standard import (  # noqa: F401
    auth_headers,
    sales_user,
    test_customer,
)
from src.models.collateral_document import CollateralDocument
from src.models.collateral_person import CollateralPerson
from src.models.customer_document import CustomerDocument, DocumentType


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

    def test_customer_image_uses_stored_type_and_inline_disposition(
        self, client, db, auth_headers, test_customer, tmp_path
    ):
        path = tmp_path / "identity.jpg"
        path.write_bytes(b"jpeg fixture")
        document = CustomerDocument(
            customer_id=test_customer.id,
            doc_type=DocumentType.NATIONAL_ID,
            file_name="identity.jpg",
            file_path=str(path),
            file_size=path.stat().st_size,
            mime_type="image/jpeg",
        )
        db.add(document)
        db.commit()

        response = client.get(
            f"/api/customers/{test_customer.id}/documents/{document.id}/file",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "image/jpeg"
        assert response.headers["content-disposition"].startswith("inline;")

    def test_collateral_pdf_uses_stored_type_and_inline_disposition(
        self, client, db, auth_headers, test_customer, tmp_path
    ):
        collateral = CollateralPerson(
            customer_id=test_customer.id,
            first_name="Almaz",
            last_name="Tesfaye",
            phone_primary="0911556677",
            id_type="national_id",
            id_number="COLLATERAL-1",
        )
        db.add(collateral)
        db.flush()
        path = tmp_path / "guarantor.pdf"
        path.write_bytes(b"%PDF-1.4 fixture")
        document = CollateralDocument(
            collateral_id=collateral.id,
            doc_type=DocumentType.NATIONAL_ID,
            file_name="guarantor.pdf",
            file_path=str(path),
            file_size=path.stat().st_size,
            mime_type="application/pdf",
        )
        db.add(document)
        db.commit()

        response = client.get(
            f"/api/collaterals/{collateral.id}/documents/{document.id}/file",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.headers["content-disposition"].startswith("inline;")
