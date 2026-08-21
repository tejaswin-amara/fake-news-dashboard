import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Activity, Loader2, RadioTower } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

function parseWindow(value: string): number[] {
  const parsed = value.split(/[\s,]+/).filter(Boolean).map(Number);
  if (parsed.length < 2 || parsed.some(item => !Number.isFinite(item) || item < 0 || item > 1)) {
    throw new Error("Provide at least two numeric probabilities between 0 and 1.");
  }
  return parsed;
}

function terminal(status?: string) {
  return status === "completed" || status === "failed" || status === "offline" || status === "unknown";
}

export default function DriftPage() {
  const [referenceWindow, setReferenceWindow] = useState("0.11, 0.16, 0.24, 0.21, 0.18");
  const [currentWindow, setCurrentWindow] = useState("0.42, 0.51, 0.63, 0.58, 0.47");
  const [jobId, setJobId] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);
  const status = trpc.dashboard.drift.status.useQuery({ jobId: jobId ?? "pending" }, { enabled: Boolean(jobId), refetchInterval: polling ? 2_000 : false });
  const submit = trpc.dashboard.drift.submit.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: result => { setPolling(true); setJobId(result.jobId); toast.success(result.status === "offline" ? "Offline drift record created." : "Drift job accepted; polling has started."); },
  });
  useEffect(() => {
    if (status.data?.status === "failed") toast.error("The drift job reported a failure.");
    if (terminal(status.data?.status)) setPolling(false);
  }, [status.data?.status]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const referenceProbabilities = parseWindow(referenceWindow);
      const currentProbabilities = parseWindow(currentWindow);
      if (referenceProbabilities.length !== currentProbabilities.length) throw new Error("Reference and current windows must be the same size.");
      submit.mutate({ currentProbabilities, referenceProbabilities });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid probability window.");
    }
  }

  const snapshot = status.data;
  const statusTone = snapshot?.status === "completed" ? snapshot.driftDetected ? "red" : "green" : snapshot?.status === "offline" || snapshot?.status === "pending" ? "amber" : snapshot?.status === "failed" ? "red" : "slate";
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col justify-between gap-3 border-b border-border pb-6 sm:flex-row sm:items-end"><div><p className="text-xs font-bold tracking-[0.16em] text-muted-foreground">DISTRIBUTION WATCH</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">Drift monitoring</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Submit probability windows to the asynchronous detector. No source articles are submitted or stored from this screen.</p></div>{jobId && <StatusBadge label={`JOB ${snapshot?.status?.toUpperCase() ?? "PENDING"}`} tone={statusTone} />}</section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)]">
        <Card className="data-card border-border bg-card"><CardHeader><CardTitle className="text-lg">Submit probability windows</CardTitle><CardDescription>Comma- or newline-separated calibrated fake probabilities, each from 0 to 1.</CardDescription></CardHeader><CardContent><form className="space-y-5" onSubmit={handleSubmit}><div className="space-y-2"><Label htmlFor="reference-window">Reference window</Label><Textarea id="reference-window" className="min-h-28 bg-background font-mono text-sm" value={referenceWindow} onChange={event => setReferenceWindow(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="current-window">Current window</Label><Textarea id="current-window" className="min-h-28 bg-background font-mono text-sm" value={currentWindow} onChange={event => setCurrentWindow(event.target.value)} /></div><Button disabled={submit.isPending} type="submit">{submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RadioTower className="mr-2 h-4 w-4" />}Submit drift job</Button></form></CardContent></Card>
        <Card className="data-card border-border bg-card"><CardHeader className="border-b border-border"><CardTitle className="text-lg">Job status</CardTitle><CardDescription>Live polling pauses automatically once the job reaches a terminal state.</CardDescription></CardHeader><CardContent className="pt-6">{!jobId ? <div className="flex min-h-[310px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/40 p-8 text-center"><Activity className="mb-4 h-9 w-9 text-muted-foreground" /><p className="font-semibold">Awaiting a drift window.</p><p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Use the form to enqueue an asynchronous drift comparison.</p></div> : status.isLoading || status.isFetching && !snapshot ? <div className="flex min-h-[310px] items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Polling detector…</div> : snapshot ? <div className="space-y-5"><div className="flex items-center justify-between rounded-xl bg-secondary/50 p-4"><div><p className="text-xs font-bold tracking-wide text-muted-foreground">JOB IDENTIFIER</p><p className="mt-1 max-w-[220px] truncate font-mono text-sm">{snapshot.jobId}</p></div><StatusBadge label={snapshot.status.toUpperCase()} tone={statusTone} /></div>{snapshot.status === "offline" ? <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Offline mode records the request but cannot execute local FastAPI drift monitoring from this hosted environment.</p> : <><div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-border p-4"><p className="text-xs font-bold tracking-wide text-muted-foreground">KS STATISTIC</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{snapshot.ks === null ? "—" : snapshot.ks.toFixed(4)}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs font-bold tracking-wide text-muted-foreground">PSI SCORE</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{snapshot.psi === null ? "—" : snapshot.psi.toFixed(4)}</p></div></div><div className="rounded-xl border border-border p-4"><p className="text-xs font-bold tracking-wide text-muted-foreground">DRIFTED FEATURES</p><p className="mt-2 text-sm">{snapshot.driftedFeatures.length ? snapshot.driftedFeatures.join(", ") : snapshot.driftDetected === false ? "No feature drift detected." : "Awaiting completed diagnostics."}</p></div></>}</div> : null}</CardContent></Card>
      </div>
    </div>
  );
}
