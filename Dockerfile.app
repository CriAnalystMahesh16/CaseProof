FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV VITE_AUTH_PROFILE=local
RUN npm run build

FROM python:3.12-slim-bookworm@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.lock.txt ./
RUN python -m pip install --no-cache-dir pip==26.2.1 \
    && pip install --no-cache-dir -r requirements.lock.txt && pip check
COPY caseproof ./caseproof
COPY local_services ./local_services
COPY mock_services ./mock_services
COPY policy ./policy
COPY eval_kit_v1 ./eval_kit_v1
COPY --from=web /web/dist ./frontend/dist
RUN useradd --uid 10001 --create-home caseproof \
    && mkdir -p /data && chown caseproof:caseproof /data
USER caseproof
EXPOSE 8080
CMD ["python", "-m", "local_services.application"]
