import Fastify from "fastify";
import { runGmailSync } from "./sync.js";

const app = Fastify({ logger: true });
const port = Number(process.env.WORKER_PORT ?? 4301);
const host = process.env.HOST ?? "0.0.0.0";

app.get("/health", async () => ({ ok: true }));

app.post("/sync/gmail", async (_request, reply) => {
  try {
    const result = await runGmailSync();
    return reply.send({ ok: true, result });
  } catch (error) {
    requestErrorLog(error);
    return reply.status(500).send({ ok: false, message: "Gmail sync failed." });
  }
});

function requestErrorLog(error: unknown): void {
  if (error instanceof Error) {
    console.error(error.message);
    return;
  }
  console.error("Unknown sync error");
}

app.listen({ port, host }).catch((err) => {
  console.error(err);
  process.exit(1);
});
