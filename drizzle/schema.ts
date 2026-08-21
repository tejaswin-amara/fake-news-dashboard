import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const predictionRecords = mysqlTable(
  "prediction_records",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    articleLength: int("article_length").notNull(),
    titleLength: int("title_length").notNull(),
    label: mysqlEnum("label", ["real", "fake", "unavailable"]).notNull(),
    probabilityReal: decimal("probability_real", { precision: 6, scale: 5 }),
    probabilityFake: decimal("probability_fake", { precision: 6, scale: 5 }),
    modelName: varchar("model_name", { length: 200 }).notNull(),
    artifactVersion: varchar("artifact_version", { length: 200 }).notNull(),
    source: mysqlEnum("source", ["live", "offline"]).notNull(),
    requestId: varchar("request_id", { length: 128 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [
    index("prediction_user_created_idx").on(table.userId, table.createdAt),
    index("prediction_model_created_idx").on(table.modelName, table.createdAt),
  ],
);

export const feedbackRecords = mysqlTable(
  "feedback_records",
  {
    id: int("id").autoincrement().primaryKey(),
    predictionId: int("prediction_id").notNull().references(() => predictionRecords.id, { onDelete: "cascade" }),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    signal: mysqlEnum("signal", ["up", "down"]).notNull(),
    correctionLabel: mysqlEnum("correction_label", ["real", "fake"]),
    idempotencyKey: varchar("idempotency_key", { length: 96 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("feedback_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    index("feedback_prediction_idx").on(table.predictionId),
  ],
);

export const apiKeys = mysqlTable(
  "api_keys",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 24 }).notNull(),
    keyHash: varchar("key_hash", { length: 128 }).notNull().unique(),
    scopes: json("scopes").$type<string[]>().notNull(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("api_key_user_created_idx").on(table.userId, table.createdAt)],
);

export const driftJobs = mysqlTable(
  "drift_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    externalJobId: varchar("external_job_id", { length: 128 }).notNull(),
    status: mysqlEnum("status", ["completed", "failed", "offline", "pending", "unknown"]).notNull(),
    driftDetected: boolean("drift_detected"),
    driftedFeatures: json("drifted_features").$type<string[]>().notNull(),
    ksStatistic: decimal("ks_statistic", { precision: 8, scale: 6 }),
    psiScore: decimal("psi_score", { precision: 8, scale: 6 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("drift_job_user_external_unique").on(table.userId, table.externalJobId),
    index("drift_job_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: mysqlEnum("event_type", [
      "api_key_created",
      "api_key_revoked",
      "drift_submitted",
      "feedback_submitted",
      "login",
      "logout",
      "prediction_submitted",
    ]).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 128 }),
    requestId: varchar("request_id", { length: 128 }),
    metadata: json("metadata").$type<Record<string, boolean | number | string | string[]>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("audit_user_event_created_idx").on(table.userId, table.eventType, table.createdAt)],
);

export const telemetryPreferences = mysqlTable("telemetry_preferences", {
  userId: int("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
