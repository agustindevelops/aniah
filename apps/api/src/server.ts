import Fastify from "fastify";
import cors from "@fastify/cors";
import { Db } from "@local-sync/db";

const app = Fastify({ logger: true });
const port = Number(process.env.API_PORT ?? 4300);
const host = process.env.HOST ?? "0.0.0.0";
const workerUrl = process.env.WORKER_URL ?? "http://localhost:4301";

await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true }));

app.post("/sync", async (_request, reply) => {
  try {
    const response = await fetch(`${workerUrl}/sync/gmail`, { method: "POST" });
    const payload = await response.json();
    return reply.send(payload);
  } catch {
    return reply.status(500).send({ ok: false, message: "Failed to trigger sync worker." });
  }
});

app.get("/sync/status", async () => {
  const db = new Db();
  const state = db.getSourceState("gmail");
  db.close();
  return { ok: true, source: "gmail", state };
});

app.get("/records/recent", async (request) => {
  const query = request.query as { limit?: string };
  const limit = query.limit ? Number(query.limit) : 50;
  const db = new Db();
  const records = db.getRecentRecords(limit);
  db.close();
  return { ok: true, records };
});

app.get("/records/:id/summary", async (request, reply) => {
  const params = request.params as { id: string };
  const normalizedId = Number(params.id);
  const db = new Db();
  const summary = db.getAiSummaryForRecord(normalizedId);
  db.close();
  if (!summary) {
    return reply.status(404).send({ ok: false, message: "Summary not found." });
  }
  return { ok: true, summary };
});

app.listen({ port, host }).catch((err) => {
  console.error(err);
  process.exit(1);
});
