# Project TODO

- [x] Establish dashboard information architecture, authenticated routing, and shared editorial visual system.
- [x] Add privacy-safe data models for prediction metadata, feedback, API keys, drift jobs, telemetry preferences, and structured audit events; keep health data transient rather than persist operational snapshots.
- [x] Implement protected server procedures for prediction metadata, feedback idempotency, API-key lifecycle, audit logging, health, metrics, and drift status polling.
- [x] Build the article analysis page with typed FastAPI prediction integration, calibrated probability gauge, evidence metadata, and inline feedback controls.
- [x] Build the paginated prediction-history page using stored derived metadata only.
- [x] Build the dynamically polling drift-monitoring page with KS, PSI, drift-feature, and status-badge presentation.
- [x] Build the system-health panel with health, readiness, queue-depth, and limiter-state information.
- [x] Build the API-key management page with one-time plaintext disclosure, list, and revoke flows.
- [x] Add visible accessibility affordances, responsive layouts, empty states, and error states across the dashboard.
- [x] Add focused server and client tests for privacy, idempotency, authorization, feedback, API-key lifecycle, and drift polling behavior.
- [x] Add a privacy regression test confirming the persistence schema has no raw article-content field.
- [x] Verify the dashboard build and tests, capture visual evidence, and create a delivery checkpoint.
- [x] Add explicit offline/mock integration mode that never attempts to call an unreachable cloud-to-local FastAPI endpoint.
- [x] Document local development configuration so a user can run the dashboard and FastAPI service together against `http://localhost:8000`.
- [x] Export the verified dashboard source to a dedicated private GitHub repository and confirm the remote URL.
