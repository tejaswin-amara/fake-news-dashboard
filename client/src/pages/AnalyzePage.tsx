import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Check, CircleAlert, FileSearch, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

type AnalysisResult = {
  prediction: {
    artifactVersion: string;
    label: "fake" | "real" | "unavailable";
    modelName: string;
    mode: "live" | "offline";
    probabilityFake: number | null;
    probabilityReal: number | null;
  };
  predictionId: number;
};

function ProbabilityGauge({ value }: { value: number | null }) {
  if (value === null) {
    return <div className="flex h-36 w-36 items-center justify-center rounded-full border-[10px] border-secondary text-center text-sm font-semibold text-muted-foreground">Unavailable</div>;
  }
  const percent = Math.round(value * 100);
  return (
    <div className="relative h-36 w-36 rounded-full" style={{ background: `conic-gradient(oklch(0.54 0.19 27) ${percent}%, oklch(0.9 0.025 84) ${percent}% 100%)` }}>
      <div className="absolute inset-[10px] flex flex-col items-center justify-center rounded-full bg-card">
        <span className="text-3xl font-extrabold tracking-tight">{percent}%</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">fake signal</span>
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  const [article, setArticle] = useState("");
  const [title, setTitle] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const predict = trpc.dashboard.predict.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: payload => setResult(payload),
  });
  const feedback = trpc.dashboard.feedback.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => toast.success("Feedback recorded. Thank you for improving the review trail."),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!article.trim()) {
      toast.error("Enter article text before requesting an analysis.");
      return;
    }
    predict.mutate({ text: article, title });
  }

  function leaveFeedback(signal: "down" | "up") {
    if (!result) return;
    feedback.mutate({ idempotencyKey: crypto.randomUUID(), predictionId: result.predictionId, signal });
  }

  const prediction = result?.prediction;
  const fakeProbability = prediction?.probabilityFake ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col justify-between gap-4 border-b border-border pb-6 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-muted-foreground">ARTICLE TRIAGE</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Analyze an information claim.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The dashboard transmits article text only to the configured detector. It records derived metadata, never the submitted article content.</p>
        </div>
        <Badge className="w-fit border-amber-300 bg-amber-100 px-3 py-1 text-amber-900">Privacy-first metadata ledger</Badge>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.8fr)]">
        <Card className="data-card border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Article input</CardTitle>
            <CardDescription>Paste the text you want the model service to assess. Avoid sensitive personal information.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="article-title">Headline or reference title <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="article-title" maxLength={20000} onChange={event => setTitle(event.target.value)} placeholder="e.g. City council announces a public health initiative" value={title} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="article-text">Article text</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">{article.length.toLocaleString()} / 50,000</span>
                </div>
                <Textarea id="article-text" maxLength={50_000} onChange={event => setArticle(event.target.value)} placeholder="Paste article text for model inference…" className="min-h-[320px] resize-y bg-background leading-6" value={article} />
              </div>
              <div className="flex flex-col justify-between gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
                <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> Analysis does not prove factual accuracy. Use it as a review signal, alongside source verification.</p>
                <Button className="shrink-0" disabled={predict.isPending} type="submit">
                  {predict.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />} Run analysis
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="data-card border-border bg-card">
          <CardHeader className="border-b border-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Detection result</CardTitle>
                <CardDescription>Calibrated model output and artifact evidence.</CardDescription>
              </div>
              {prediction && <StatusBadge label={prediction.mode === "offline" ? "OFFLINE" : "LIVE"} tone={prediction.mode === "offline" ? "amber" : "green"} />}
            </div>
          </CardHeader>
          <CardContent className="pt-7">
            {!prediction ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/40 p-8 text-center">
                <FileSearch className="mb-4 h-9 w-9 text-muted-foreground" />
                <p className="font-semibold">No analysis in this session.</p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Submit an article to inspect the calibrated fake-signal probability and model provenance.</p>
              </div>
            ) : prediction.mode === "offline" ? (
              <div className="space-y-5 rounded-xl border border-amber-300 bg-amber-50 p-5">
                <StatusBadge label="MODEL SERVICE UNREACHABLE" tone="amber" />
                <p className="text-sm leading-6 text-amber-950">The hosted dashboard cannot access a FastAPI server at your computer’s localhost address. This request was stored only as privacy-safe metadata with no prediction content.</p>
                <p className="text-xs leading-5 text-amber-900">Run the dashboard locally with <code className="rounded bg-amber-100 px-1 py-0.5">FAKE_NEWS_INTEGRATION_MODE=live</code> and <code className="rounded bg-amber-100 px-1 py-0.5">FAKE_NEWS_API_BASE_URL=http://localhost:8000</code> to enable live analysis.</p>
              </div>
            ) : (
              <div className="space-y-7">
                <div className="flex flex-col items-center gap-5 rounded-xl bg-secondary/50 p-6 text-center sm:flex-row sm:text-left">
                  <ProbabilityGauge value={fakeProbability} />
                  <div className="space-y-2">
                    <p className="text-xs font-bold tracking-[0.16em] text-muted-foreground">PREDICTED CLASS</p>
                    <div className="flex items-center justify-center gap-2 sm:justify-start"><span className="text-3xl font-extrabold capitalize">{prediction.label}</span><StatusBadge label={prediction.label === "fake" ? "REVIEW" : "LOWER SIGNAL"} tone={prediction.label === "fake" ? "red" : "green"} /></div>
                    <p className="text-sm text-muted-foreground">Real probability: {prediction.probabilityReal === null ? "Unavailable" : `${Math.round(prediction.probabilityReal * 100)}%`}</p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm">
                  <div className="bg-card p-4"><dt className="text-xs font-bold tracking-wide text-muted-foreground">MODEL</dt><dd className="mt-1 break-words font-semibold">{prediction.modelName}</dd></div>
                  <div className="bg-card p-4"><dt className="text-xs font-bold tracking-wide text-muted-foreground">ARTIFACT</dt><dd className="mt-1 break-words font-semibold">{prediction.artifactVersion}</dd></div>
                </dl>
                <div className="border-t border-border pt-5">
                  <p className="text-sm font-semibold">Was this signal helpful?</p>
                  <div className="mt-3 flex gap-2">
                    <Button disabled={feedback.isPending} onClick={() => leaveFeedback("up")} size="sm" type="button" variant="outline"><ThumbsUp className="mr-2 h-4 w-4" />Useful</Button>
                    <Button disabled={feedback.isPending} onClick={() => leaveFeedback("down")} size="sm" type="button" variant="outline"><ThumbsDown className="mr-2 h-4 w-4" />Not useful</Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
