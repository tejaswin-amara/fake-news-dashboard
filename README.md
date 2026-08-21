# VERITAS Fake News Analysis Dashboard

VERITAS is an authenticated operational dashboard for the companion [Fake-News-Detection ML service](https://github.com/tejaswin-amara/Fake-News-Detection-Using-NLP-LSTM-and-BERT-Transformer-Models). It supports privacy-safe prediction metadata, analyst feedback, asynchronous drift tracking, health inspection, API-key lifecycle management, and structured audits.

## Privacy Boundary

The dashboard sends an article to the detector only when live integration is explicitly enabled. It never persists raw article text or submitted titles. Prediction history instead records derived metadata such as character counts, label, calibrated probabilities, model/artifact identifiers, integration mode, and timestamps. API-key plaintext is returned once on creation; the database retains only an HMAC-SHA-256 hash and a non-secret prefix.

## Hosted Dashboard Mode

The hosted dashboard defaults to **offline mode**. This is intentional because `http://localhost:8000` on a personal computer is not reachable from the hosted application. Offline mode keeps the authenticated workspace, privacy-safe ledger, API-key workflows, and operational UI available while clearly marking prediction and drift output as unavailable.

| Mode | Required configuration | Behavior |
| --- | --- | --- |
| `offline` (default) | No configuration required | Never attempts a FastAPI request. The UI identifies unavailable model operations clearly. |
| `live` | Dashboard and FastAPI API are reachable from the same network context | Sends `/predict`, `/health`, `/ready`, `/metrics`, and drift calls to the configured FastAPI base URL. |

## Running the Dashboard Locally with FastAPI

First, start the ML backend from the companion repository on the same computer, for example with its documented development command. Then start this dashboard locally and set these local-only variables through your development environment:

```bash
FAKE_NEWS_INTEGRATION_MODE=live
FAKE_NEWS_API_BASE_URL=http://localhost:8000
pnpm dev
```

The dashboard expects the FastAPI contract exposed by the companion service:

| Capability | Endpoint | Dashboard use |
| --- | --- | --- |
| Prediction | `POST /predict` | Shows label, calibrated probabilities, model name, and artifact version. |
| Liveness and readiness | `GET /health`, `GET /ready` | Shows health and warm-up-gated readiness. |
| Prometheus metrics | `GET /metrics` | Reads `fake_news_inference_queue_depth`, drift queue depth, and rate-limiter telemetry where exposed. |
| Drift monitoring | `POST /monitoring/drift`, `GET /monitoring/drift/{job_id}` | Starts and dynamically polls asynchronous probability-window drift analysis. |

## Quality Checks

Run the application safeguards before committing changes:

```bash
pnpm check
pnpm test
pnpm build
```

The test suite includes checks for offline behavior, protected-procedure authorization, metadata-only persistence, feedback idempotency, hashed API-key storage, one-time API-key response boundaries, audit events, and drift-status persistence.

## References

1. [Fake News Detection ML Service Repository](https://github.com/tejaswin-amara/Fake-News-Detection-Using-NLP-LSTM-and-BERT-Transformer-Models)
2. [FastAPI Documentation](https://fastapi.tiangolo.com/)
3. [Prometheus Client Python Documentation](https://github.com/prometheus/client_python)
