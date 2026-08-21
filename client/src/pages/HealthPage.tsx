import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Activity, DatabaseZap, Gauge, HeartPulse, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

function healthTone(value?: string) { return value === "healthy" || value === "ready" || value === "active" ? "green" as const : value === "offline" || value === "not_exposed" ? "amber" as const : value === "checking" || !value ? "slate" as const : "red" as const; }

export default function HealthPage() {
  const health = trpc.dashboard.health.useQuery(undefined, { refetchInterval: 15_000 });
  const telemetry = trpc.dashboard.telemetry.get.useQuery();
  const updateTelemetry = trpc.dashboard.telemetry.set.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => telemetry.refetch(),
  });
  const snapshot = health.data;
  const tiles = [
    { icon: HeartPulse, label: "Health", value: snapshot?.health ?? "checking", detail: "FastAPI /health", tone: healthTone(snapshot?.health) },
    { icon: ShieldCheck, label: "Readiness", value: snapshot?.ready ?? "checking", detail: "Warm-up gated /ready", tone: healthTone(snapshot?.ready) },
    { icon: Gauge, label: "Rate limiter", value: snapshot?.rateLimiterState ?? "checking", detail: "Redis circuit state", tone: healthTone(snapshot?.rateLimiterState) },
    { icon: DatabaseZap, label: "Inference queue", value: snapshot?.inferenceQueueDepth === null || snapshot?.inferenceQueueDepth === undefined ? "—" : String(snapshot.inferenceQueueDepth), detail: "Prometheus bounded-admission queue gauge", tone: snapshot?.inferenceQueueDepth === null || snapshot?.inferenceQueueDepth === undefined ? "amber" as const : "green" as const },
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-6"><section className="flex flex-col justify-between gap-3 border-b border-border pb-6 sm:flex-row sm:items-end"><div><p className="text-xs font-bold tracking-[0.16em] text-muted-foreground">SERVICE OBSERVABILITY</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">System health</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Operational values refresh every 15 seconds. In offline mode, the dashboard clearly reports that it cannot inspect a local-only service.</p></div>{snapshot && <StatusBadge label={snapshot.health.toUpperCase()} tone={healthTone(snapshot.health)} />}</section><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{tiles.map(tile => <Card className="data-card border-border bg-card" key={tile.label}><CardContent className="p-5"><tile.icon className="h-5 w-5 text-primary" /><p className="mt-5 text-xs font-bold tracking-[0.13em] text-muted-foreground">{tile.label.toUpperCase()}</p><div className="mt-2 flex items-center gap-2"><p className="text-2xl font-extrabold capitalize">{tile.value}</p><StatusBadge label={tile.value.toUpperCase()} tone={tile.tone} /></div><p className="mt-2 text-xs text-muted-foreground">{tile.detail}</p></CardContent></Card>)}</div><Card className="data-card border-border bg-card"><CardHeader><CardTitle className="text-lg">Telemetry control</CardTitle><CardDescription>Control whether your dashboard telemetry preference is enabled. Raw article content is never collected by this dashboard.</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between rounded-xl border border-border p-5"><div><Label className="text-base font-semibold" htmlFor="telemetry-toggle">Dashboard telemetry preference</Label><p className="mt-1 text-sm leading-6 text-muted-foreground">Stores your preference only; it does not override the privacy rule against persisting raw articles.</p></div><Switch checked={telemetry.data ?? true} disabled={telemetry.isLoading || updateTelemetry.isPending} id="telemetry-toggle" onCheckedChange={enabled => updateTelemetry.mutate({ enabled })} /></div></CardContent></Card><div className="flex items-center gap-2 text-xs text-muted-foreground"><Activity className="h-4 w-4" />Last refresh: {health.dataUpdatedAt ? new Date(health.dataUpdatedAt).toLocaleTimeString() : "Awaiting response"}</div></div>
  );
}
