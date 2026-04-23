import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4300";

type SyncState = {
  lastSyncedAt: string | null;
  lastCursor: string | null;
  lastHash: string | null;
} | null;

type RecentRecord = {
  id: number;
  sourceRecordId: string;
  sender?: string | null;
  status: string;
  eventDate: string | null;
  location: string | null;
  pointOfContact: string | null;
  assignedStaff: string | null;
  updatedAt: string;
  summary?: string;
  missingFields?: string;
  priority?: string;
  category?: string;
  imageCount?: number;
  imageInsights?: string;
};

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (s.includes("error") || s.includes("fail")) return "destructive";
  if (s.includes("pending") || s.includes("sync")) return "secondary";
  if (s.includes("done") || s.includes("complete") || s.includes("ok"))
    return "default";
  return "outline";
}

function priorityBadgeVariant(
  priority: string | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  const p = (priority ?? "").toLowerCase();
  if (p.includes("high") || p.includes("urgent")) return "destructive";
  if (p.includes("medium")) return "secondary";
  if (p.includes("low")) return "outline";
  return "secondary";
}

function LogText({ children }: { children: string }) {
  if (!children || children === "-") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
      {children}
    </span>
  );
}

/** Keeps table rows short; long text scrolls inside the cell. */
function TableLogCell({ children }: { children: string }) {
  if (!children || children === "-") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div
      className={cn(
        "max-h-36 w-full min-w-0 overflow-y-auto overscroll-y-contain rounded-md",
        "border border-border/50 bg-muted/20 px-2 py-1.5 [scrollbar-width:thin]",
      )}
      title="Scroll to read full text"
    >
      <span className="block whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
        {children}
      </span>
    </div>
  );
}

type RecordImageMeta = {
  id: number;
  imageKind: string;
  filename: string;
  mimeType: string;
  insightJson: string | null;
};

function useRecordImages(recordId: number, enabled: boolean) {
  const [images, setImages] = useState<RecordImageMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`${apiBase}/records/${recordId}/images`)
      .then(async (res) => {
        if (!res.ok) throw new Error("bad response");
        return res.json() as Promise<{ images?: Record<string, unknown>[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        const list = (data.images ?? []).map((raw) => ({
          id: Number(raw.id),
          imageKind: String(raw.imageKind ?? ""),
          filename: String(raw.filename ?? ""),
          mimeType: String(raw.mimeType ?? ""),
          insightJson:
            raw.insightJson != null ? String(raw.insightJson) : null,
        }));
        setImages(list);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load images.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recordId, enabled]);

  return { images, loading, loadError };
}

function RecordImagesCell({
  recordId,
  imageCount,
}: {
  recordId: number;
  imageCount: number;
}) {
  const [open, setOpen] = useState(false);
  const { images, loading, loadError } = useRecordImages(
    recordId,
    open && imageCount > 0,
  );

  if (imageCount === 0) {
    return <span className="text-muted-foreground tabular-nums">0</span>;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="h-7 gap-1 tabular-nums"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <ImageIcon className="size-3.5 opacity-70" aria-hidden />
        {imageCount}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Images</DialogTitle>
            <DialogDescription>
              {imageCount} image{imageCount === 1 ? "" : "s"} for record{" "}
              <span className="font-mono text-foreground">#{recordId}</span>
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : images.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No image metadata returned for this record.
            </p>
          ) : (
            <ScrollArea className="h-[min(65vh,640px)] pr-3">
              <div className="grid gap-6 sm:grid-cols-2">
                {images.map((img) => (
                  <figure key={img.id} className="space-y-2">
                    <a
                      href={`${apiBase}/records/${recordId}/images/${img.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg border bg-muted/40"
                    >
                      <img
                        src={`${apiBase}/records/${recordId}/images/${img.id}/file`}
                        alt={img.filename}
                        className="mx-auto max-h-72 w-full object-contain"
                        loading="lazy"
                      />
                    </a>
                    <figcaption className="space-y-1 text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">
                        <Badge variant="outline" className="mr-2 font-normal">
                          {img.imageKind}
                        </Badge>
                        <span className="break-all font-mono">{img.filename}</span>
                      </div>
                      {img.insightJson ? (
                        <LogText>{img.insightJson}</LogText>
                      ) : null}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="break-words text-sm text-foreground">{children}</p>
    </div>
  );
}

function EventDetailDialog({
  record,
  onOpenChange,
}: {
  record: RecentRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = record !== null;
  const recordId = record?.id ?? 0;
  const imageCount = record?.imageCount ?? 0;
  const { images, loading, loadError } = useRecordImages(
    recordId,
    open && imageCount > 0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        showCloseButton
      >
        {record ? (
          <>
            <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-4 py-4 pr-12">
              <DialogTitle className="text-lg">Event</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                #{record.id} · {record.sourceRecordId}
              </DialogDescription>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant={statusBadgeVariant(record.status)}>
                  {record.status}
                </Badge>
                {record.category ? (
                  <Badge variant="outline">{record.category}</Badge>
                ) : null}
                {record.priority ? (
                  <Badge variant={priorityBadgeVariant(record.priority)}>
                    {record.priority}
                  </Badge>
                ) : null}
                {imageCount > 0 ? (
                  <Badge variant="secondary" className="tabular-nums">
                    {imageCount} image{imageCount === 1 ? "" : "s"}
                  </Badge>
                ) : null}
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailField label="Sender">
                  {record.sender?.trim() ? record.sender : "—"}
                </DetailField>
                <DetailField label="Event date">
                  {record.eventDate ?? "—"}
                </DetailField>
                <DetailField label="Updated">
                  {record.updatedAt}
                </DetailField>
                <DetailField label="Location">
                  {record.location ?? "—"}
                </DetailField>
                <DetailField label="Point of contact">
                  {record.pointOfContact ?? "—"}
                </DetailField>
                <DetailField label="Assigned staff">
                  {record.assignedStaff ?? "—"}
                </DetailField>
              </div>

              <div className="mt-6 space-y-6 border-t border-border/60 pt-6">
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Summary
                  </h3>
                  <div className="rounded-lg border border-border/60 bg-muted/25 p-4">
                    <LogText>{record.summary ?? "-"}</LogText>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Image insights
                  </h3>
                  <div className="rounded-lg border border-border/60 bg-muted/25 p-4">
                    <LogText>{record.imageInsights ?? "-"}</LogText>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Missing fields
                  </h3>
                  <div
                    className={cn(
                      "rounded-lg border p-4 text-sm",
                      record.missingFields
                        ? "border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200"
                        : "border-border/60 bg-muted/25 text-muted-foreground",
                    )}
                  >
                    {record.missingFields ?? "—"}
                  </div>
                </section>

                {imageCount > 0 ? (
                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Images
                    </h3>
                    {loading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="size-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : loadError ? (
                      <p className="text-sm text-destructive">{loadError}</p>
                    ) : images.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No image metadata returned.
                      </p>
                    ) : (
                      <div className="grid gap-6 sm:grid-cols-2">
                        {images.map((img) => (
                          <figure key={img.id} className="space-y-2">
                            <a
                              href={`${apiBase}/records/${recordId}/images/${img.id}/file`}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded-lg border bg-muted/40"
                            >
                              <img
                                src={`${apiBase}/records/${recordId}/images/${img.id}/file`}
                                alt={img.filename}
                                className="mx-auto max-h-[min(50vh,420px)] w-full object-contain"
                                loading="lazy"
                              />
                            </a>
                            <figcaption className="space-y-1 text-xs text-muted-foreground">
                              <div className="font-medium text-foreground">
                                <Badge
                                  variant="outline"
                                  className="mr-2 font-normal"
                                >
                                  {img.imageKind}
                                </Badge>
                                <span className="break-all font-mono">
                                  {img.filename}
                                </span>
                              </div>
                              {img.insightJson ? (
                                <LogText>{img.insightJson}</LogText>
                              ) : null}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                  </section>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function App() {
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [state, setState] = useState<SyncState>(null);
  const [records, setRecords] = useState<RecentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [detailRecord, setDetailRecord] = useState<RecentRecord | null>(null);

  const loadData = async () => {
    setError(null);
    const statusRes = await fetch(`${apiBase}/sync/status`);
    const statusJson = await statusRes.json();
    setState(statusJson.state ?? null);

    const recordsRes = await fetch(`${apiBase}/records/recent?limit=100`);
    const recordsJson = await recordsRes.json();
    setRecords(recordsJson.records ?? []);
  };

  const triggerSync = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/sync`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || data.ok === false) {
        throw new Error(
          typeof data.message === "string" && data.message.length > 0
            ? data.message
            : "Sync failed",
        );
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected sync error");
    } finally {
      setLoading(false);
    }
  };

  const clearAll = async () => {
    if (
      !window.confirm(
        "Delete all synced records, summaries, local image files, and reset Gmail sync (cursor)? The next sync will start fresh. This cannot be undone.",
      )
    ) {
      return;
    }
    setClearing(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/records?confirm=1&wipeFiles=1`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Clear failed");
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected clear error");
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    loadData().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed loading"),
    );
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 md:px-8">
      <div className="mb-8 space-y-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
          Gmail Local Sync
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Local-first Gmail capture, normalization, and Gemma-based summarization.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={triggerSync} disabled={loading || clearing} size="default">
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            {loading ? "Syncing…" : "Sync Gmail"}
          </Button>
          <Button
            variant="destructive"
            onClick={clearAll}
            disabled={loading || clearing}
          >
            {clearing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
            {clearing ? "Clearing…" : "Delete all data"}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-6">
        <Card className="h-fit w-full">
          <CardHeader>
            <CardTitle className="text-base">Last sync</CardTitle>
            <CardDescription>Worker cursor and timing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 font-mono text-xs">
            <div>
              <p className="text-muted-foreground">Last synced at</p>
              <p className="break-all text-foreground">
                {state?.lastSyncedAt ?? "Never"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Last cursor</p>
              <p className="break-all text-foreground">
                {state?.lastCursor ?? "None"}
              </p>
            </div>
            {state?.lastHash ? (
              <div>
                <p className="text-muted-foreground">Last hash</p>
                <p className="break-all text-foreground">{state.lastHash}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="min-w-0 w-full">
          <CardHeader className="flex flex-row items-start gap-2 space-y-0 pb-4">
            <Activity className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="text-base">Activity log</CardTitle>
              <CardDescription>
                Recent normalized records ({records.length} loaded). Click a row
                for full details.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="overflow-x-auto rounded-xl border border-border/70 bg-gradient-to-b from-card via-card to-muted/15 shadow-sm ring-1 ring-foreground/[0.04]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/60 hover:bg-transparent">
                      <TableHead className="sticky top-0 z-20 h-11 bg-card/95 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm border-b border-border/80 shadow-[0_1px_0_0_var(--border)]">
                        Record
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 h-11 min-w-[140px] max-w-[220px] bg-card/95 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm border-b border-border/80 shadow-[0_1px_0_0_var(--border)]">
                        Sender
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 h-11 bg-card/95 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm border-b border-border/80 shadow-[0_1px_0_0_var(--border)]">
                        Status
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 h-11 bg-card/95 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm border-b border-border/80 shadow-[0_1px_0_0_var(--border)]">
                        Category
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 h-11 bg-card/95 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm border-b border-border/80 shadow-[0_1px_0_0_var(--border)]">
                        Priority
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 h-11 bg-card/95 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm border-b border-border/80 shadow-[0_1px_0_0_var(--border)]">
                        Images
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 h-11 min-w-[200px] bg-card/95 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm border-b border-border/80 shadow-[0_1px_0_0_var(--border)]">
                        Summary
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 h-11 min-w-[180px] bg-card/95 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm border-b border-border/80 shadow-[0_1px_0_0_var(--border)]">
                        Image insight
                      </TableHead>
                      <TableHead className="sticky top-0 z-20 h-11 bg-card/95 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm border-b border-border/80 shadow-[0_1px_0_0_var(--border)]">
                        Missing
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={9}
                          className="h-28 text-center text-sm text-muted-foreground"
                        >
                          No records yet. Run a sync to populate this log.
                        </TableCell>
                      </TableRow>
                    ) : (
                      records.map((row, i) => (
                        <TableRow
                          key={row.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`View event ${row.sourceRecordId}`}
                          className={cn(
                            "cursor-pointer border-border/40 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                            i % 2 === 1 && "bg-muted/15",
                          )}
                          onClick={() => setDetailRecord(row)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setDetailRecord(row);
                            }
                          }}
                        >
                          <TableCell className="max-w-[140px] whitespace-normal align-top px-3 py-2 font-mono text-xs">
                            <div className="max-h-20 overflow-y-auto overscroll-y-contain [scrollbar-width:thin]">
                              <span className="break-all text-foreground/90">
                                {row.sourceRecordId}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[220px] whitespace-normal align-top px-3 py-2 text-xs">
                            <div className="max-h-20 overflow-y-auto overscroll-y-contain [scrollbar-width:thin]">
                              {row.sender?.trim() ? (
                                <span className="break-words text-foreground/90">
                                  {row.sender}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="align-top px-3 py-2">
                            <Badge variant={statusBadgeVariant(row.status)}>
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top px-3 py-2">
                            {row.category ? (
                              <Badge variant="outline">{row.category}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="align-top px-3 py-2">
                            {row.priority ? (
                              <Badge variant={priorityBadgeVariant(row.priority)}>
                                {row.priority}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="align-top px-3 py-2">
                            <RecordImagesCell
                              recordId={row.id}
                              imageCount={row.imageCount ?? 0}
                            />
                          </TableCell>
                          <TableCell className="max-w-[min(24rem,45vw)] whitespace-normal align-top px-3 py-2">
                            <TableLogCell>{row.summary ?? "-"}</TableLogCell>
                          </TableCell>
                          <TableCell className="max-w-[min(24rem,45vw)] whitespace-normal align-top px-3 py-2">
                            <TableLogCell>{row.imageInsights ?? "-"}</TableLogCell>
                          </TableCell>
                          <TableCell className="max-w-[180px] whitespace-normal align-top px-3 py-2">
                            {row.missingFields ? (
                              <div
                                className={cn(
                                  "max-h-36 overflow-y-auto overscroll-y-contain rounded-md border border-border/50 px-2 py-1.5 [scrollbar-width:thin]",
                                  "text-xs leading-snug text-amber-700 dark:text-amber-400",
                                )}
                              >
                                {row.missingFields}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <EventDetailDialog
        record={detailRecord}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDetailRecord(null);
        }}
      />
    </main>
  );
}
