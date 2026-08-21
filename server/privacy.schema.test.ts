import { describe, expect, it } from "vitest";
import { auditEvents, predictionRecords } from "../drizzle/schema";

describe("privacy-safe persistence schema", () => {
  it("contains derived prediction metadata but no raw article body or title columns", () => {
    const predictionColumns = Object.keys(predictionRecords);
    expect(predictionColumns).toEqual(expect.arrayContaining(["articleLength", "titleLength", "label", "probabilityFake", "probabilityReal"]));
    expect(predictionColumns).not.toEqual(expect.arrayContaining(["article", "articleText", "body", "content", "rawText", "text", "title"]));
  });

  it("defines a restricted audit event vocabulary with structured metadata", () => {
    expect(Object.keys(auditEvents)).toEqual(expect.arrayContaining(["eventType", "metadata", "requestId", "userId"]));
    expect(Object.keys(auditEvents)).not.toContain("rawArticle");
  });
});
