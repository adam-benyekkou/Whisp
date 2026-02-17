# Contributing to Whisp

## Security Checks
We use `bandit`, `safety`, and `trivy` for security auditing.

To run locally:
```bash
pip install bandit safety
bandit -r app -x tests
safety check
```

## Docker Build
To test the production build:
```bash
docker build -t whisp-secret:latest .
```
