import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  createApiKeyRecord: vi.fn(),
  createPredictionRecord: vi.fn(),
  getTelemetryPreference: vi.fn(),
  listApiKeyRecords: vi.fn(),
  listPredictionRecords: vi.fn(),
  recordAuditEvent: vi.fn(),
  revokeApiKeyRecord: vi.fn(),
  setTelemetryPreference: vi.fn(),
  submitFeedback: vi.fn(),
  upsertDriftJob: vi.fn(),
}));

vi.mock("./fakeNewsService", () => ({
  getDriftSnapshot: vi.fn(),
  getHealthSnapshot: vi.fn(),
  predictArticle: vi.fn(),
  submitDriftJob: vi.fn(),
}));

import {
  createApiKeyRecord,
  createPredictionRecord,
  recordAuditEvent,
  revokeApiKeyRecord,
  submitFeedback,
  upsertDriftJob,
} from "./db";
import { getDriftSnapshot, predictArticle, submitDriftJob } from "./fakeNewsService";
import { appRouter } from "./routers";

const audit = vi.mocked(recordAuditEvent);
const createKey = vi.mocked(createApiKeyRecord);
const createPrediction = vi.mocked(createPredictionRecord);
const createDrift = vi.mocked(submitDriftJob);
const readDrift = vi.mocked(getDriftSnapshot);
const recordFeedback = vi.mocked(submitFeedback);
const revokeKey = vi.mocked(revokeApiKeyRecord);
const runPrediction = vi.mocked(predictArticle);
const saveDrift = vi.mocked(upsertDriftJob);

function authenticatedContext(): TrpcContext {
  return {
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: {
      createdAt: new Date(),
      email: "reviewer@example.com",
      id: 7,
      lastSignedIn: new Date(),
      loginMethod: "manus",
      name: "Reviewer",
      openId: "reviewer-open-id",
      role: "user",
      updatedAt: new Date(),
    },
  };
}

function anonymousContext(): TrpcContext {
  return { req: { headers: {}, protocol: "https" } as TrpcContext["req"], res: {} as TrpcContext["res"], user: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "dashboard-test-secret";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dashboard protected contracts", () => {
  it("rejects unauthenticated dashboard access", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.dashboard.history({ page: 1, pageSize: 10 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    } satisfies Partial<TRPCError>);
  });

  it("persists only prediction metadata and creates a structured prediction audit event", async () => {
    runPrediction.mockResolvedValue({
      artifactVersion: "artifact-42",
      label: "fake",
      modelName: "bert-calibrated",
      mode: "live",
      probabilityFake: 0.81,
      probabilityReal: 0.19,
      requestId: "req-7",
    });
    createPrediction.mockResolvedValue({ id: 41 } as Awaited<ReturnType<typeof createPredictionRecord>>);

    const result = await appRouter.createCaller(authenticatedContext()).dashboard.predict({
      text: "Private article body that must never enter persistence.",
      title: "Private title",
    });

    expect(result.predictionId).toBe(41);
    expect(createPrediction).toHaveBeenCalledWith(expect.objectContaining({
      articleLength: 55,
      titleLength: 13,
      userId: 7,
    }));
    const persisted = createPrediction.mock.calls[0]?.[0] ?? {};
    expect(persisted).not.toHaveProperty("text");
    expect(persisted).not.toHaveProperty("title");
    expect(JSON.stringify(persisted)).not.toContain("Private article body");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "prediction",
      eventType: "prediction_submitted",
      metadata: expect.objectContaining({ articleLength: 55, titleLength: 13 }),
    }));
  });

  it("records feedback once and avoids duplicate audit entries for an idempotency replay", async () => {
    recordFeedback.mockResolvedValueOnce({ created: true, feedback: { id: 51 } } as Awaited<ReturnType<typeof submitFeedback>>);
    recordFeedback.mockResolvedValueOnce({ created: false, feedback: { id: 51 } } as Awaited<ReturnType<typeof submitFeedback>>);
    const caller = appRouter.createCaller(authenticatedContext());
    const input = { idempotencyKey: "5ffed7f4-b66f-4f7c-9fb2-5f38cb7a55fd", predictionId: 41, signal: "up" as const };

    await expect(caller.dashboard.feedback(input)).resolves.toEqual({ created: true, id: 51 });
    await expect(caller.dashboard.feedback(input)).resolves.toEqual({ created: false, id: 51 });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "feedback_submitted" }));
  });

  it("returns plaintext API keys only once while database persistence receives a hash", async () => {
    createKey.mockImplementation(async input => ({ id: 92, keyPrefix: input.keyPrefix, name: input.name, scopes: input.scopes }) as Awaited<ReturnType<typeof createApiKeyRecord>>);

    const result = await appRouter.createCaller(authenticatedContext()).dashboard.apiKeys.create({
      name: "Monitoring integration",
      scopes: ["predict:read"],
    });

    const persisted = createKey.mock.calls[0]?.[0];
    expect(result.apiKey).toMatch(/^fn_live_/);
    expect(persisted?.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted?.keyHash).not.toBe(result.apiKey);
    expect(persisted?.keyPrefix).toBe(result.apiKey.slice(0, 16));
    expect(result).not.toHaveProperty("keyHash");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "api_key_created" }));
  });

  it("writes audit events for API-key revocation and drift job submission", async () => {
    revokeKey.mockResolvedValue({ id: 92, revokedAt: new Date() } as Awaited<ReturnType<typeof revokeApiKeyRecord>>);
    createDrift.mockResolvedValue({ jobId: "drift-92", status: "pending" });
    saveDrift.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(authenticatedContext());

    await caller.dashboard.apiKeys.revoke({ id: 92 });
    await caller.dashboard.drift.submit({ currentProbabilities: [0.2, 0.8], referenceProbabilities: [0.1, 0.2] });

    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "api_key_revoked" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ entityId: "drift-92", eventType: "drift_submitted" }));
  });

  it("updates the tracked drift job with each authorized status poll", async () => {
    readDrift.mockResolvedValue({
      driftDetected: true,
      driftedFeatures: ["probability_fake"],
      jobId: "drift-93",
      ks: 0.42,
      psi: 0.25,
      status: "completed",
    });
    saveDrift.mockResolvedValue(undefined);

    const result = await appRouter.createCaller(authenticatedContext()).dashboard.drift.status({ jobId: "drift-93" });

    expect(result.status).toBe("completed");
    expect(saveDrift).toHaveBeenCalledWith(expect.objectContaining({
      externalJobId: "drift-93",
      status: "completed",
      userId: 7,
    }));
  });
});
