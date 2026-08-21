import { getFastApiBaseUrl } from "./fastapiEndpoint";

export type IntegrationMode = "offline" | "live";
export type PredictionLabel = "fake" | "real" | "unavailable";

export type DashboardPrediction = {
  artifactVersion: string;
  label: PredictionLabel;
  modelName: string;
  mode: IntegrationMode;
  probabilityFake: number | null;
  probabilityReal: number | null;
  requestId: string | null;
};

export type HealthSnapshot = {
  health: "healthy" | "offline" | "unhealthy";
  inferenceQueueDepth: number | null;
  queueDepth: number | null;
  rateLimiterState: "active" | "offline" | "not_exposed" | "unavailable";
  ready: "offline" | "ready" | "unready";
};

export type DriftSnapshot = {
  driftDetected: boolean | null;
  driftedFeatures: string[];
  jobId: string;
  ks: number | null;
  psi: number | null;
  status: "completed" | "failed" | "offline" | "pending" | "unknown";
};

export type DriftSubmission = {
  jobId: string;
  status: "offline" | "pending";
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asProbability(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function metricValue(metrics: string, metricName: string): number | null {
  const line = metrics.split("\n").find(item => item.startsWith(`${metricName} `));
  if (!line) {
    return null;
  }
  const value = Number(line.split(" ").at(-1));
  return Number.isFinite(value) ? value : null;
}

export function getIntegrationMode(): IntegrationMode {
  return process.env.FAKE_NEWS_INTEGRATION_MODE === "live" ? "live" : "offline";
}

async function fetchFastApi(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${getFastApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(8_000),
  });
}

export async function predictArticle(input: {
  text: string;
  title?: string;
}): Promise<DashboardPrediction> {
  if (getIntegrationMode() === "offline") {
    return {
      artifactVersion: "offline",
      label: "unavailable",
      modelName: "Local FastAPI backend unavailable to hosted dashboard",
      mode: "offline",
      probabilityFake: null,
      probabilityReal: null,
      requestId: null,
    };
  }

  const response = await fetchFastApi("/predict", {
    body: JSON.stringify({ text: input.text, title: input.title ?? "" }),
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`FastAPI prediction request failed with status ${response.status}.`);
  }

  const payload = asRecord(await response.json());
  const labelName = asString(payload.label_name, "unavailable");
  const label: PredictionLabel = labelName === "fake" || labelName === "real" ? labelName : "unavailable";
  return {
    artifactVersion: asString(payload.artifact_version, "unknown"),
    label,
    modelName: asString(payload.model_name, "unknown"),
    mode: "live",
    probabilityFake: asProbability(payload.probability_fake),
    probabilityReal: asProbability(payload.probability_real),
    requestId: response.headers.get("X-Request-ID"),
  };
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  if (getIntegrationMode() === "offline") {
    return { health: "offline", inferenceQueueDepth: null, queueDepth: null, rateLimiterState: "offline", ready: "offline" };
  }

  try {
    const [health, ready, metrics] = await Promise.all([
      fetchFastApi("/health"),
      fetchFastApi("/ready"),
      fetch(`${getFastApiBaseUrl()}/metrics`, { signal: AbortSignal.timeout(8_000) }),
    ]);
    const metricText = metrics.ok ? await metrics.text() : "";
    const inferenceQueueDepth = metricValue(metricText, "fake_news_inference_queue_depth");
    const queueDepth = metricValue(metricText, "fake_news_drift_queue_depth");
    const breaker = metricValue(metricText, "fake_news_rate_limiter_circuit_state");
    return {
      health: health.ok ? "healthy" : "unhealthy",
      inferenceQueueDepth,
      queueDepth,
      rateLimiterState: breaker === 0 ? "active" : breaker === null ? "not_exposed" : "unavailable",
      ready: ready.ok ? "ready" : "unready",
    };
  } catch {
    return { health: "unhealthy", inferenceQueueDepth: null, queueDepth: null, rateLimiterState: "unavailable", ready: "unready" };
  }
}

export async function getDriftSnapshot(jobId: string): Promise<DriftSnapshot> {
  if (getIntegrationMode() === "offline") {
    return {
      driftDetected: null,
      driftedFeatures: [],
      jobId,
      ks: null,
      psi: null,
      status: "offline",
    };
  }

  const response = await fetchFastApi(`/monitoring/drift/${encodeURIComponent(jobId)}`);
  if (!response.ok) {
    throw new Error(`FastAPI drift status request failed with status ${response.status}.`);
  }
  const payload = asRecord(await response.json());
  const result = asRecord(payload.result);
  const status = asString(payload.status, "unknown");
  const featureReports = asRecord(result.features);
  const driftedFeaturesFromReport = Object.entries(featureReports)
    .filter(([, report]) => asRecord(report).drift_detected === true)
    .map(([feature]) => feature);
  const driftedFeatures = Array.isArray(result.drifted_features)
    ? result.drifted_features.filter((item): item is string => typeof item === "string")
    : driftedFeaturesFromReport;
  const reports = asRecord(result.reports);
  const probability = asRecord(reports.probability);
  const firstFeature = asRecord(Object.values(featureReports)[0]);
  const probabilityReport = Object.keys(probability).length > 0 ? probability : asRecord(result.probability);
  const ks = asRecord(probabilityReport.ks ?? firstFeature.ks);
  const psi = probabilityReport.psi ?? firstFeature.psi;
  return {
    driftDetected: typeof result.drift_detected === "boolean" ? result.drift_detected : null,
    driftedFeatures,
    jobId,
    ks: typeof ks.statistic === "number" ? ks.statistic : null,
    psi: typeof psi === "number" ? psi : null,
    status:
      status === "completed" || status === "failed" || status === "pending" ? status : "unknown",
  };
}

export async function submitDriftJob(input: {
  currentProbabilities: number[];
  referenceProbabilities: number[];
}): Promise<DriftSubmission> {
  if (getIntegrationMode() === "offline") {
    return { jobId: `offline-${Date.now()}`, status: "offline" };
  }

  const response = await fetchFastApi("/monitoring/drift", {
    body: JSON.stringify({
      baseline_revision: "dashboard-reference",
      current_probabilities: input.currentProbabilities,
      reference_probabilities: input.referenceProbabilities,
      window_id: `dashboard-${Date.now()}`,
    }),
    method: "POST",
  });
  if (response.status !== 202) {
    throw new Error(`FastAPI drift submission failed with status ${response.status}.`);
  }
  const payload = asRecord(await response.json());
  const jobId = asString(payload.job_id, "");
  if (!jobId) {
    throw new Error("FastAPI drift submission did not return a job identifier.");
  }
  return { jobId, status: "pending" };
}
