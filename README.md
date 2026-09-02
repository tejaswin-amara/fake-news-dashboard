# VERITAS Fake News Analysis Dashboard

VERITAS is the operational web dashboard for the companion fake-news ML project. The reference ML repository defines the production model lifecycle, leakage-safe evaluation, FastAPI serving boundary, drift monitoring, and artifact packaging. This dashboard now includes a runnable FastAPI inference service so the repository is executable without treating prediction as a UI-only concept.

## What is now working

- Real `POST /predict` inference through TF-IDF + Logistic Regression.
- Real batch prediction through `POST /predict/batch`.
- Health/readiness/metrics endpoints consumed by the dashboard.
- KS-test + PSI probability drift calculation with job status retrieval.
- Local demo authentication, so the dashboard can be exercised without OAuth or MySQL.
- In-memory prediction history/feedback in demo mode; production mode can continue using the existing MySQL/Drizzle persistence layer.
- Docker Compose stack for the dashboard and ML API.

The included model is a **bootstrap runnable model**, not a claim that it reproduces the reference repository's final benchmark artifact. For research/production evaluation, replace it with a verified artifact produced by the companion repository while preserving the API contract.

## Run everything with Docker

```bash
git clone https://github.com/tejaswin-amara/fake-news-dashboard.git
cd fake-news-dashboard
docker compose up --build
```

Open `http://localhost:3000`. The dashboard talks to the ML service at `http://ml-api:8000` inside Compose.

## Run without Docker

Terminal 1:

```bash
cd ml_service
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

Terminal 2, from the repository root:

```bash
corepack enable
pnpm install
```

Set:

```text
LOCAL_DEMO_MODE=true
FAKE_NEWS_INTEGRATION_MODE=live
FAKE_NEWS_API_BASE_URL=http://127.0.0.1:8000
PORT=3000
```

Then run:

```bash
pnpm dev
```

## Reference ML integration

The companion repository is the authoritative place for the full ML lifecycle: classical models, BiLSTM/BERT paths, leakage-safe 70/15/15 evaluation, calibration, packaged artifacts, FastAPI serving, and monitoring. The dashboard consumes the same core serving contract (`/predict`, `/health`, `/ready`, `/metrics`, and `/monitoring/drift`). urlReference ML repositoryhttps://github.com/tejaswin-amara/Fake-News-Detection-Using-NLP-LSTM-and-BERT-Transformer-Models

To use a verified reference artifact instead of the bootstrap service, run the companion FastAPI service and set `FAKE_NEWS_API_BASE_URL` to its reachable address.

## Production boundary

Do not treat the bootstrap corpus as a validated research benchmark. Before public deployment, use an actually trained and evaluated artifact from the reference ML repository, configure authentication, MySQL persistence, explicit CORS/rate limits, signed artifact verification, and a reachable private/public network path between the dashboard and ML service.

## Quality checks

```bash
pnpm check
pnpm test
pnpm build
```

Python service smoke test:

```bash
curl http://127.0.0.1:8000/ready
curl -X POST http://127.0.0.1:8000/predict -H "Content-Type: application/json" -d '{"title":"Official budget released","text":"The government published the final budget after parliamentary approval."}'
```
