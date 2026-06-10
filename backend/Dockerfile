FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps (psycopg needs libpq-dev at build time of the wheel; binary wheel ships it,
# but keep build-essential available for cryptography/bcrypt source builds on slim).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (better layer caching)
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Copy app source
COPY . .

# Render injects $PORT (defaults to 10000); fall back for local docker run
ENV PORT=8000
EXPOSE 8000

# Run migrations (with a short retry to ride out transient DB connection
# blips, e.g. a paused DB waking up) then start the server. If every attempt
# fails, exit non-zero so the platform restarts us instead of booting without
# an up-to-date schema.
CMD ["sh", "-c", "ok=0; for i in 1 2 3 4 5; do alembic upgrade head && { ok=1; break; }; echo \"migration attempt $i failed, retrying in 5s\"; sleep 5; done; if [ \"$ok\" != \"1\" ]; then echo 'migrations failed after retries'; exit 1; fi; exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
