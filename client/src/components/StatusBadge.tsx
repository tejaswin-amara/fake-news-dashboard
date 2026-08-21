import { Badge } from "@/components/ui/badge";

type Tone = "amber" | "green" | "red" | "slate";

const toneClass: Record<Tone, string> = {
  amber: "border-amber-300 bg-amber-100 text-amber-900",
  green: "border-emerald-300 bg-emerald-100 text-emerald-900",
  red: "border-red-300 bg-red-100 text-red-900",
  slate: "border-border bg-secondary text-secondary-foreground",
};

export function StatusBadge({ label, tone = "slate" }: { label: string; tone?: Tone }) {
  return <Badge className={`border px-2 py-0.5 text-[11px] font-bold tracking-wide ${toneClass[tone]}`}>{label}</Badge>;
}
