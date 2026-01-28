FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY fleet_manager.py .
COPY auth_postgres.py .
COPY printer_registration.py .
COPY models.py .
COPY file_repository.py .

# Copy OTA update files
COPY client_version.json .
COPY printer_client/ ./printer_client/

# Create data directory
RUN mkdir -p /data

# Create non-root user
RUN useradd -m -u 1000 fleetuser && \
    chown -R fleetuser:fleetuser /app /data
USER fleetuser

# Expose ports
EXPOSE 8080 9080 9081

CMD ["python", "fleet_manager.py"]