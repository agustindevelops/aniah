import { useEffect, useState } from "react";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4300";

type SyncState = {
  lastSyncedAt: string | null;
  lastCursor: string | null;
  lastHash: string | null;
} | null;

type RecentRecord = {
  id: number;
  sourceRecordId: string;
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
};

export function App() {
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<SyncState>(null);
  const [records, setRecords] = useState<RecentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      if (!res.ok) {
        throw new Error("Sync failed");
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected sync error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData().catch((e) => setError(e instanceof Error ? e.message : "Failed loading"));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", margin: "2rem", maxWidth: 1200 }}>
      <h1>Gmail Local Sync v1</h1>
      <p>Local-first Gmail capture, normalization, and Gemma-based summarization.</p>
      <button onClick={triggerSync} disabled={loading} style={{ padding: "0.7rem 1rem", marginBottom: "1rem" }}>
        {loading ? "Syncing..." : "Sync Gmail"}
      </button>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      <section style={{ marginBottom: "1.5rem" }}>
        <h2>Last Sync</h2>
        <p>Last synced at: {state?.lastSyncedAt ?? "Never"}</p>
        <p>Last cursor: {state?.lastCursor ?? "None"}</p>
      </section>
      <section>
        <h2>Recent Changes</h2>
        <table width="100%" cellPadding={8} style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Record</th>
              <th align="left">Status</th>
              <th align="left">Category</th>
              <th align="left">Priority</th>
              <th align="left">Summary</th>
              <th align="left">Missing</th>
            </tr>
          </thead>
          <tbody>
            {records.map((row) => (
              <tr key={row.id} style={{ borderTop: "1px solid #ddd" }}>
                <td>{row.sourceRecordId}</td>
                <td>{row.status}</td>
                <td>{row.category ?? "-"}</td>
                <td>{row.priority ?? "-"}</td>
                <td style={{ whiteSpace: "pre-line" }}>{row.summary ?? "-"}</td>
                <td>{row.missingFields ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
