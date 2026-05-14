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

# Run migrations then start the server
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
