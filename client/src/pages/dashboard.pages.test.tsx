import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiKeyCreate: vi.fn(),
  apiKeyRevoke: vi.fn(),
  driftSubmit: vi.fn(),
  feedback: vi.fn(),
  predict: vi.fn(),
  telemetrySet: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    dashboard: {
      apiKeys: {
        create: { useMutation: () => ({ isPending: false, mutate: mocks.apiKeyCreate }) },
        list: { useQuery: () => ({ data: [], isLoading: false }) },
        revoke: { useMutation: () => ({ isPending: false, mutate: mocks.apiKeyRevoke }) },
      },
      drift: {
        status: { useQuery: () => ({ data: undefined, isFetching: false, isLoading: false }) },
        submit: { useMutation: () => ({ isPending: false, mutate: mocks.driftSubmit }) },
      },
      feedback: { useMutation: () => ({ isPending: false, mutate: mocks.feedback }) },
      health: { useQuery: () => ({ data: { health: "offline", inferenceQueueDepth: null, queueDepth: null, rateLimiterState: "offline", ready: "offline" }, dataUpdatedAt: 0 }) },
      history: { useQuery: () => ({ data: { records: [], total: 0 }, isLoading: false }) },
      predict: { useMutation: () => ({ isPending: false, mutate: mocks.predict }) },
      telemetry: {
        get: { useQuery: () => ({ data: true, isLoading: false, refetch: vi.fn() }) },
        set: { useMutation: () => ({ isPending: false, mutate: mocks.telemetrySet }) },
      },
    },
    useUtils: () => ({ dashboard: { apiKeys: { list: { invalidate: vi.fn() } } } }),
  },
}));

import AnalyzePage from "./AnalyzePage";
import ApiKeysPage from "./ApiKeysPage";
import DriftPage from "./DriftPage";
import HealthPage from "./HealthPage";
import HistoryPage from "./HistoryPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("dashboard page safety and empty states", () => {
  it("renders every operational page with its protected empty or offline state", () => {
    const { unmount } = render(<AnalyzePage />);
    expect(screen.getByText(/records derived metadata/i)).toBeTruthy();
    expect(screen.getByText(/no analysis in this session/i)).toBeTruthy();
    unmount();

    render(<HistoryPage />);
    expect(screen.getByText(/no protected history yet/i)).toBeTruthy();
    cleanup();

    render(<DriftPage />);
    expect(screen.getByText(/awaiting a drift window/i)).toBeTruthy();
    cleanup();

    render(<HealthPage />);
    expect(screen.getAllByText(/^offline$/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/raw article content is never collected/i)).toBeTruthy();
    cleanup();

    render(<ApiKeysPage />);
    expect(screen.getByText(/no API keys have been issued/i)).toBeTruthy();
    expect(screen.getByText(/plaintext value appears once/i)).toBeTruthy();
  });

  it("submits only the typed article fields to the protected prediction procedure", async () => {
    const user = userEvent.setup();
    render(<AnalyzePage />);

    await user.type(screen.getByLabelText(/headline or reference title/i), "Evidence-led title");
    await user.type(screen.getByLabelText(/^article text$/i), "An article body that remains outside dashboard persistence.");
    await user.click(screen.getByRole("button", { name: /run analysis/i }));

    expect(mocks.predict).toHaveBeenCalledWith({
      text: "An article body that remains outside dashboard persistence.",
      title: "Evidence-led title",
    });
  });

  it("submits validated probability windows to the asynchronous drift procedure", async () => {
    const user = userEvent.setup();
    render(<DriftPage />);

    await user.click(screen.getByRole("button", { name: /submit drift job/i }));

    expect(mocks.driftSubmit).toHaveBeenCalledWith({
      currentProbabilities: [0.42, 0.51, 0.63, 0.58, 0.47],
      referenceProbabilities: [0.11, 0.16, 0.24, 0.21, 0.18],
    });
  });
});
