import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  apiKeys,
  auditEvents,
  driftJobs,
  feedbackRecords,
  InsertUser,
  predictionRecords,
  telemetryPreferences,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new Error("Dashboard database is unavailable.");
  }
  return db;
}

export type AuditEventInput = {
  entityId?: string;
  entityType: string;
  eventType:
    | "api_key_created"
    | "api_key_revoked"
    | "drift_submitted"
    | "feedback_submitted"
    | "login"
    | "logout"
    | "prediction_submitted";
  metadata: Record<string, boolean | number | string | string[]>;
  requestId?: string;
  userId?: number;
};

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const db = await requireDb();
  await db.insert(auditEvents).values({
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    metadata: input.metadata,
    requestId: input.requestId,
    userId: input.userId,
  });
}

export async function createPredictionRecord(input: {
  artifactVersion: string;
  articleLength: number;
  label: "fake" | "real" | "unavailable";
  modelName: string;
  probabilityFake: number | null;
  probabilityReal: number | null;
  requestId: string | null;
  source: "live" | "offline";
  titleLength: number;
  userId: number;
}) {
  const db = await requireDb();
  await db.insert(predictionRecords).values({
    ...input,
    requestId: input.requestId ?? undefined,
    probabilityFake: input.probabilityFake === null ? null : input.probabilityFake.toFixed(5),
    probabilityReal: input.probabilityReal === null ? null : input.probabilityReal.toFixed(5),
  });
  const [record] = await db
    .select()
    .from(predictionRecords)
    .where(and(eq(predictionRecords.userId, input.userId), eq(predictionRecords.requestId, input.requestId ?? "")))
    .orderBy(desc(predictionRecords.id))
    .limit(1);
  if (!record) {
    throw new Error("Prediction record could not be read after insertion.");
  }
  return record;
}

export async function listPredictionRecords(userId: number, page: number, pageSize: number) {
  const db = await requireDb();
  const offset = (page - 1) * pageSize;
  const [records, totalResult] = await Promise.all([
    db
      .select()
      .from(predictionRecords)
      .where(eq(predictionRecords.userId, userId))
      .orderBy(desc(predictionRecords.createdAt), desc(predictionRecords.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(predictionRecords)
      .where(eq(predictionRecords.userId, userId)),
  ]);
  return { records, total: Number(totalResult[0]?.count ?? 0) };
}

export async function submitFeedback(input: {
  correctionLabel?: "fake" | "real";
  idempotencyKey: string;
  predictionId: number;
  signal: "down" | "up";
  userId: number;
}) {
  const db = await requireDb();
  const [prediction] = await db
    .select({ id: predictionRecords.id })
    .from(predictionRecords)
    .where(and(eq(predictionRecords.id, input.predictionId), eq(predictionRecords.userId, input.userId)))
    .limit(1);
  if (!prediction) {
    throw new Error("Prediction record was not found for the authenticated user.");
  }
  const [existing] = await db
    .select()
    .from(feedbackRecords)
    .where(and(eq(feedbackRecords.userId, input.userId), eq(feedbackRecords.idempotencyKey, input.idempotencyKey)))
    .limit(1);
  if (existing) {
    return { created: false, feedback: existing };
  }
  await db.insert(feedbackRecords).values(input);
  const [feedback] = await db
    .select()
    .from(feedbackRecords)
    .where(and(eq(feedbackRecords.userId, input.userId), eq(feedbackRecords.idempotencyKey, input.idempotencyKey)))
    .limit(1);
  if (!feedback) {
    throw new Error("Feedback record could not be read after insertion.");
  }
  return { created: true, feedback };
}

export async function createApiKeyRecord(input: {
  keyHash: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  userId: number;
}) {
  const db = await requireDb();
  await db.insert(apiKeys).values(input);
  const [record] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, input.keyHash))
    .limit(1);
  if (!record) {
    throw new Error("API key record could not be read after insertion.");
  }
  return record;
}

export async function listApiKeyRecords(userId: number) {
  const db = await requireDb();
  return db
    .select({
      createdAt: apiKeys.createdAt,
      id: apiKeys.id,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      name: apiKeys.name,
      revokedAt: apiKeys.revokedAt,
      scopes: apiKeys.scopes,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKeyRecord(userId: number, apiKeyId: number) {
  const db = await requireDb();
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.userId, userId), sql`${apiKeys.revokedAt} is null`));
  const [record] = await db
    .select({ id: apiKeys.id, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.userId, userId)))
    .limit(1);
  if (!record) {
    throw new Error("API key was not found for the authenticated user.");
  }
  return record;
}

export async function upsertDriftJob(input: {
  driftDetected: boolean | null;
  driftedFeatures: string[];
  externalJobId: string;
  ksStatistic: number | null;
  psiScore: number | null;
  status: "completed" | "failed" | "offline" | "pending" | "unknown";
  userId: number;
}) {
  const db = await requireDb();
  await db.insert(driftJobs).values({
    ...input,
    ksStatistic: input.ksStatistic === null ? null : input.ksStatistic.toFixed(6),
    psiScore: input.psiScore === null ? null : input.psiScore.toFixed(6),
  }).onDuplicateKeyUpdate({
    set: {
      driftDetected: input.driftDetected,
      driftedFeatures: input.driftedFeatures,
      ksStatistic: input.ksStatistic === null ? null : input.ksStatistic.toFixed(6),
      psiScore: input.psiScore === null ? null : input.psiScore.toFixed(6),
      status: input.status,
    },
  });
}

export async function getTelemetryPreference(userId: number) {
  const db = await requireDb();
  const [preference] = await db
    .select()
    .from(telemetryPreferences)
    .where(eq(telemetryPreferences.userId, userId))
    .limit(1);
  return preference?.enabled ?? true;
}

export async function setTelemetryPreference(userId: number, enabled: boolean) {
  const db = await requireDb();
  await db.insert(telemetryPreferences).values({ enabled, userId }).onDuplicateKeyUpdate({ set: { enabled } });
}
