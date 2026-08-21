import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Copy, KeyRound, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

export default function ApiKeysPage() {
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const keys = trpc.dashboard.apiKeys.list.useQuery();
  const create = trpc.dashboard.apiKeys.create.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: response => { setCreatedKey(response.apiKey); setName(""); utils.dashboard.apiKeys.list.invalidate(); },
  });
  const revoke = trpc.dashboard.apiKeys.revoke.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => { toast.success("API key revoked."); utils.dashboard.apiKeys.list.invalidate(); },
  });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); create.mutate({ name, scopes: ["predict:read"] }); }
  function copyKey() { if (!createdKey) return; navigator.clipboard.writeText(createdKey).then(() => toast.success("Key copied to clipboard."), () => toast.error("Copy failed; select the key manually.")); }
  return (
    <div className="mx-auto max-w-7xl space-y-6"><section className="border-b border-border pb-6"><p className="text-xs font-bold tracking-[0.16em] text-muted-foreground">CREDENTIAL VAULT</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">API keys</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Generated secrets are hashed before storage. The plaintext value appears once, only immediately after creation.</p></section><div className="grid gap-6 lg:grid-cols-[minmax(300px,0.55fr)_minmax(0,1.45fr)]"><Card className="data-card h-fit border-border bg-card"><CardHeader><CardTitle className="text-lg">Create API key</CardTitle><CardDescription>Issue a scoped credential for supported dashboard integrations.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={submit}><div className="space-y-2"><Label htmlFor="key-name">Key name</Label><Input id="key-name" maxLength={80} minLength={3} onChange={event => setName(event.target.value)} placeholder="Production monitoring" required value={name} /></div><div className="rounded-lg bg-secondary/60 p-3 text-sm"><p className="font-semibold">Scope</p><p className="mt-1 text-muted-foreground">predict:read</p></div><Button className="w-full" disabled={create.isPending} type="submit">{create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Create key</Button></form></CardContent></Card><Card className="data-card overflow-hidden border-border bg-card"><CardHeader className="border-b border-border"><CardTitle className="text-lg">Issued keys</CardTitle><CardDescription>Prefixes and status are visible; hashes and plaintext secrets are never returned.</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Prefix</TableHead><TableHead>Scope</TableHead><TableHead>Created</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{keys.isLoading ? <TableRow><TableCell className="h-40 text-center text-muted-foreground" colSpan={6}>Loading credential metadata…</TableCell></TableRow> : keys.data?.length ? keys.data.map(key => <TableRow key={key.id}><TableCell className="font-semibold">{key.name}</TableCell><TableCell className="font-mono text-xs">{key.keyPrefix}…</TableCell><TableCell className="text-sm">{key.scopes.join(", ")}</TableCell><TableCell className="whitespace-nowrap text-sm text-muted-foreground">{new Date(key.createdAt).toLocaleString()}</TableCell><TableCell><StatusBadge label={key.revokedAt ? "REVOKED" : "ACTIVE"} tone={key.revokedAt ? "red" : "green"} /></TableCell><TableCell>{!key.revokedAt && <Button disabled={revoke.isPending} onClick={() => { if (window.confirm(`Revoke “${key.name}”? This cannot be undone.`)) revoke.mutate({ id: key.id }); }} size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /><span className="sr-only">Revoke {key.name}</span></Button>}</TableCell></TableRow>) : <TableRow><TableCell className="h-48" colSpan={6}><div className="flex flex-col items-center gap-3 text-center"><KeyRound className="h-7 w-7 text-muted-foreground" /><p className="font-semibold">No API keys have been issued.</p></div></TableCell></TableRow>}</TableBody></Table></div></CardContent></Card></div><Dialog onOpenChange={open => { if (!open) setCreatedKey(null); }} open={Boolean(createdKey)}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-700" />Copy this API key now</DialogTitle><DialogDescription>This is the only time its plaintext value will be available. Store it in a secure secret manager.</DialogDescription></DialogHeader><div className="flex gap-2"><code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-secondary p-3 text-xs">{createdKey}</code><Button onClick={copyKey} size="icon" type="button"><Copy className="h-4 w-4" /><span className="sr-only">Copy API key</span></Button></div></DialogContent></Dialog></div>
  );
}
