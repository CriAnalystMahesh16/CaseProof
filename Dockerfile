FROM python:3.12-slim-bookworm@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.lock.txt requirements-dev.txt requirements.txt pyproject.toml pytest.ini ./
RUN python -m pip install --no-cache-dir pip==26.2.1 \
    && pip install --no-cache-dir -r requirements.lock.txt \
    && pip install --no-cache-dir filelock==3.20.3 ruff==0.17.0 mypy==2.4.0 hypothesis==6.151.9
COPY caseproof ./caseproof
COPY mock_services ./mock_services
COPY local_services ./local_services
COPY kitgen ./kitgen
COPY eval ./eval
COPY eval_kit_v1 ./eval_kit_v1
COPY policy ./policy
COPY tests ./tests
COPY scripts ./scripts
COPY LICENSE ./LICENSE
RUN useradd --uid 10001 --create-home caseproof \
    && mkdir -p /data /app/var /app/.hypothesis \
    && chown caseproof:caseproof /data /app/var /app/.hypothesis
USER caseproof
CMD ["python", "-m", "uvicorn", "caseproof.api.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
