# Build stage
FROM python:3.11-slim as builder

WORKDIR /app

COPY requirements.txt .

# Install dependencies to a shared location
RUN pip install --no-cache-dir -r requirements.txt --target=/opt/app-libs

# Runtime stage
FROM python:3.11-slim

WORKDIR /app

# Copy installed dependencies from builder
COPY --from=builder /opt/app-libs /opt/app-libs

# Add libraries to Python path
ENV PYTHONPATH=/opt/app-libs

# Copy application code
COPY . .

# Create non-root user and setup directories
RUN useradd -m -u 1000 whisp && \
    mkdir -p app/storage/files data && \
    chown -R whisp:whisp /app

# Switch to non-root user
USER whisp

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
