# Backend image. Multi-stage so build tooling for psycopg2/bcrypt does not ship.
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt


FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# libpq for psycopg2; curl for the container healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

WORKDIR /app
COPY . .

# Run unprivileged; the app writes uploads and generated documents.
RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /app/uploads /app/generated_docs \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# Migrations run at start: the image never creates schema implicitly.
CMD ["sh", "-c", "alembic upgrade head && uvicorn src.api.main:create_app --factory --host 0.0.0.0 --port 8000"]
