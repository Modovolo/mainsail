# Makefile for Fleet Manager testing

.PHONY: test test-unit test-integration test-coverage clean install-test

# Install test dependencies
install-test:
	pip install -r requirements-test.txt

# Run all tests
test:
	pytest tests/ -v

# Run unit tests only
test-unit:
	pytest tests/test_fleet_manager.py tests/test_printer_client.py tests/test_websocket_protocol.py -v

# Run integration tests only  
test-integration:
	pytest tests/test_integration.py -v

# Run tests with coverage
test-coverage:
	pytest tests/ --cov=. --cov-report=term-missing --cov-report=html

# Run quick smoke tests
test-smoke:
	pytest tests/ -v -x --timeout=10

# Run tests in parallel (requires pytest-xdist)
test-parallel:
	pytest tests/ -v -n auto

# Clean test artifacts
clean:
	rm -rf .pytest_cache
	rm -rf __pycache__
	rm -rf tests/__pycache__
	rm -rf .coverage
	rm -rf htmlcov
	rm -rf *.egg-info
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete

# Run tests in Docker
test-docker:
	docker run --rm -v $(PWD):/app -w /app python:3.11-slim \
		sh -c "pip install -r requirements.txt -r requirements-test.txt && pytest tests/ -v"

# Lint the test files
lint-tests:
	python -m py_compile tests/*.py

# Watch mode (requires pytest-watch)
test-watch:
	ptw tests/ -- -v
