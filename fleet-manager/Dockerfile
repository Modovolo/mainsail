FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY fleet_manager.py .

# Create non-root user
RUN useradd -m -u 1000 fleetuser && chown -R fleetuser:fleetuser /app
USER fleetuser

EXPOSE 9080 9081

CMD ["python", "fleet_manager.py"]