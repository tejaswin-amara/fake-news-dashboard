import { describe, expect, it } from "vitest";
import { getIntegrationMode, getHealthSnapshot, predictArticle } from "./fakeNewsService";

describe("configured FastAPI service", () => {
  it("uses the safe offline integration mode unless live mode is explicitly enabled", async () => {
    expect(getIntegrationMode()).toBe("offline");
    await expect(predictArticle({ text: "A local-only development article." })).resolves.toMatchObject({
      label: "unavailable",
      mode: "offline",
    });
    await expect(getHealthSnapshot()).resolves.toEqual({
      health: "offline",
      inferenceQueueDepth: null,
      queueDepth: null,
      rateLimiterState: "offline",
      ready: "offline",
    });
  });
});
