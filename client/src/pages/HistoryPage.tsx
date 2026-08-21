import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { useState } from "react";

const PAGE_SIZE = 10;

function formatProbability(value: string | null) {
  return value === null ? "—" : `${Math.round(Number(value) * 100)}%`;
}

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const history = trpc.dashboard.history.useQuery({ page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil((history.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col justify-between gap-3 border-b border-border pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-muted-foreground">REVIEW LEDGER</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Prediction history</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The ledger intentionally shows only derived metadata. Submitted article text is not saved here.</p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">{history.data?.total ?? 0} recorded analyses</p>
      </section>
      <Card className="data-card overflow-hidden border-border bg-card">
        <CardHeader className="border-b border-border"><CardTitle className="text-lg">Metadata-only record</CardTitle><CardDescription>Character counts substitute for article snippets to protect submitted content.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Article fingerprint</TableHead><TableHead>Label</TableHead><TableHead>Fake signal</TableHead><TableHead>Model artifact</TableHead><TableHead>Recorded</TableHead></TableRow></TableHeader>
              <TableBody>
                {history.isLoading ? <TableRow><TableCell className="h-44 text-center text-muted-foreground" colSpan={5}>Loading protected ledger…</TableCell></TableRow> : history.data?.records.length ? history.data.records.map(record => (
                  <TableRow key={record.id}>
                    <TableCell><p className="font-semibold">{record.articleLength.toLocaleString()} character article</p><p className="text-xs text-muted-foreground">Title: {record.titleLength.toLocaleString()} characters · {record.source}</p></TableCell>
                    <TableCell><StatusBadge label={record.label.toUpperCase()} tone={record.label === "fake" ? "red" : record.label === "real" ? "green" : "amber"} /></TableCell>
                    <TableCell className="font-semibold tabular-nums">{formatProbability(record.probabilityFake)}</TableCell>
                    <TableCell><p className="max-w-[220px] truncate font-medium">{record.modelName}</p><p className="text-xs text-muted-foreground">{record.artifactVersion}</p></TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{new Date(record.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                )) : <TableRow><TableCell className="h-52" colSpan={5}><div className="flex flex-col items-center gap-3 text-center text-muted-foreground"><History className="h-7 w-7" /><p className="font-semibold text-foreground">No protected history yet.</p><p className="max-w-md text-sm">Analyze an article to create a metadata-only ledger record.</p></div></TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border p-4">
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex gap-2"><Button disabled={page === 1 || history.isLoading} onClick={() => setPage(current => current - 1)} size="sm" variant="outline"><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button disabled={page >= totalPages || history.isLoading} onClick={() => setPage(current => current + 1)} size="sm" variant="outline">Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
