# Build stage
FROM python:3.11-slim as builder

WORKDIR /app

COPY requirements.txt .

# Install dependencies to user directory
RUN pip install --user --no-cache-dir -r requirements.txt

# Runtime stage
FROM python:3.11-slim

WORKDIR /app

# Copy installed dependencies from builder
COPY --from=builder /root/.local /root/.local

# Add local bin to PATH
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY . .

# Create non-root user and setup directories
RUN useradd -m -u 1000 whisp && \
    mkdir -p app/storage/files && \
    chown -R whisp:whisp /app

# Switch to non-root user
USER whisp

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
