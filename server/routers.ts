import { randomBytes, createHmac } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import {
  createApiKeyRecord,
  createPredictionRecord,
  getTelemetryPreference,
  listApiKeyRecords,
  listPredictionRecords,
  recordAuditEvent,
  revokeApiKeyRecord,
  setTelemetryPreference,
  submitFeedback,
  upsertDriftJob,
} from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDriftSnapshot, getHealthSnapshot, predictArticle, submitDriftJob } from "./fakeNewsService";

const articleInput = z.object({
  text: z.string().trim().min(1).max(50_000),
  title: z.string().trim().max(20_000).default(""),
});

const scopes = z.array(z.enum(["drift:read", "health:read", "predict:read"])).min(1).max(3);

function requestIdFromHeaders(headers: Record<string, string | string[] | undefined>): string | undefined {
  const value = headers["x-request-id"];
  return typeof value === "string" && value.length <= 128 ? value : undefined;
}

function apiKeyHash(value: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Dashboard key service is unavailable." });
  }
  return createHmac("sha256", secret).update(value).digest("hex");
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: protectedProcedure.mutation(async ({ ctx }) => {
      await recordAuditEvent({
        entityId: String(ctx.user.id),
        entityType: "session",
        eventType: "logout",
        metadata: { outcome: "success" },
        requestId: requestIdFromHeaders(ctx.req.headers),
        userId: ctx.user.id,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  dashboard: router({
    apiKeys: router({
      create: protectedProcedure
        .input(z.object({ name: z.string().trim().min(3).max(80), scopes: scopes.default(["predict:read"]) }))
        .mutation(async ({ ctx, input }) => {
          const plaintextKey = `fn_live_${randomBytes(24).toString("base64url")}`;
          const record = await createApiKeyRecord({
            keyHash: apiKeyHash(plaintextKey),
            keyPrefix: plaintextKey.slice(0, 16),
            name: input.name,
            scopes: input.scopes,
            userId: ctx.user.id,
          });
          await recordAuditEvent({
            entityId: String(record.id),
            entityType: "api_key",
            eventType: "api_key_created",
            metadata: { scopes: input.scopes },
            requestId: requestIdFromHeaders(ctx.req.headers),
            userId: ctx.user.id,
          });
          return { apiKey: plaintextKey, id: record.id, keyPrefix: record.keyPrefix, name: record.name, scopes: record.scopes };
        }),
      list: protectedProcedure.query(({ ctx }) => listApiKeyRecords(ctx.user.id)),
      revoke: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        const record = await revokeApiKeyRecord(ctx.user.id, input.id);
        await recordAuditEvent({
          entityId: String(record.id),
          entityType: "api_key",
          eventType: "api_key_revoked",
          metadata: { outcome: "revoked" },
          requestId: requestIdFromHeaders(ctx.req.headers),
          userId: ctx.user.id,
        });
        return { id: record.id, revokedAt: record.revokedAt };
      }),
    }),
    drift: router({
      status: protectedProcedure.input(z.object({ jobId: z.string().trim().min(1).max(128) })).query(async ({ ctx, input }) => {
        const snapshot = await getDriftSnapshot(input.jobId);
        await upsertDriftJob({
          driftDetected: snapshot.driftDetected,
          driftedFeatures: snapshot.driftedFeatures,
          externalJobId: snapshot.jobId,
          ksStatistic: snapshot.ks,
          psiScore: snapshot.psi,
          status: snapshot.status,
          userId: ctx.user.id,
        });
        return snapshot;
      }),
      submit: protectedProcedure.input(z.object({
        currentProbabilities: z.array(z.number().min(0).max(1)).min(2).max(10_000),
        referenceProbabilities: z.array(z.number().min(0).max(1)).min(2).max(10_000),
      }).refine(value => value.currentProbabilities.length === value.referenceProbabilities.length, {
        message: "Reference and current windows must contain equal numbers of probabilities.",
      })).mutation(async ({ ctx, input }) => {
        const submission = await submitDriftJob(input);
        await upsertDriftJob({
          driftDetected: null,
          driftedFeatures: [],
          externalJobId: submission.jobId,
          ksStatistic: null,
          psiScore: null,
          status: submission.status,
          userId: ctx.user.id,
        });
        await recordAuditEvent({
          entityId: submission.jobId,
          entityType: "drift_job",
          eventType: "drift_submitted",
          metadata: { currentWindowSize: input.currentProbabilities.length, source: "dashboard", referenceWindowSize: input.referenceProbabilities.length },
          requestId: requestIdFromHeaders(ctx.req.headers),
          userId: ctx.user.id,
        });
        return submission;
      }),
    }),
    feedback: protectedProcedure
      .input(z.object({
        correctionLabel: z.enum(["fake", "real"]).optional(),
        idempotencyKey: z.string().uuid(),
        predictionId: z.number().int().positive(),
        signal: z.enum(["down", "up"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await submitFeedback({ ...input, userId: ctx.user.id });
        if (result.created) {
          await recordAuditEvent({
            entityId: String(result.feedback.id),
            entityType: "feedback",
            eventType: "feedback_submitted",
            metadata: { correctionLabel: input.correctionLabel ?? "none", signal: input.signal },
            requestId: requestIdFromHeaders(ctx.req.headers),
            userId: ctx.user.id,
          });
        }
        return { created: result.created, id: result.feedback.id };
      }),
    health: protectedProcedure.query(() => getHealthSnapshot()),
    history: protectedProcedure
      .input(z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(5).max(50).default(10) }))
      .query(({ ctx, input }) => listPredictionRecords(ctx.user.id, input.page, input.pageSize)),
    predict: protectedProcedure.input(articleInput).mutation(async ({ ctx, input }) => {
      const prediction = await predictArticle(input);
      const record = await createPredictionRecord({
        artifactVersion: prediction.artifactVersion,
        articleLength: input.text.length,
        label: prediction.label,
        modelName: prediction.modelName,
        probabilityFake: prediction.probabilityFake,
        probabilityReal: prediction.probabilityReal,
        requestId: prediction.requestId,
        source: prediction.mode,
        titleLength: input.title.length,
        userId: ctx.user.id,
      });
      await recordAuditEvent({
        entityId: String(record.id),
        entityType: "prediction",
        eventType: "prediction_submitted",
        metadata: {
          articleLength: input.text.length,
          label: prediction.label,
          source: prediction.mode,
          titleLength: input.title.length,
        },
        requestId: prediction.requestId ?? requestIdFromHeaders(ctx.req.headers),
        userId: ctx.user.id,
      });
      return { prediction, predictionId: record.id };
    }),
    telemetry: router({
      get: protectedProcedure.query(({ ctx }) => getTelemetryPreference(ctx.user.id)),
      set: protectedProcedure.input(z.object({ enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
        await setTelemetryPreference(ctx.user.id, input.enabled);
        return { enabled: input.enabled };
      }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
