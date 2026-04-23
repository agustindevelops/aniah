import { Db } from "@local-sync/db";
import { normalizeGmailRecord } from "@local-sync/pipeline";
import { captureGmailSinceToday } from "@local-sync/scraper";
import { generateAiSummary } from "@local-sync/ai";

export interface SyncResult {
  captured: number;
  insertedRaw: number;
  normalized: number;
  aiSummaries: number;
  previousCursor: string;
  runStartedAt: string;
  runCompletedAt: string;
  nextCursor: string;
  lastCursor: string | null;
}

function getDefaultInitialCursor(runStartedAt: string): string {
  const manualStart = process.env.GMAIL_SYNC_START_AT;
  if (manualStart) {
    const parsed = Date.parse(manualStart);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  // Default first sync to start of local day if no explicit start is provided.
  const now = new Date(runStartedAt);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export async function runGmailSync(): Promise<SyncResult> {
  const db = new Db();
  const runStartedAt = new Date().toISOString();
  const syncState = db.getSourceState("gmail");
  const previousCursor = syncState?.lastCursor ?? getDefaultInitialCursor(runStartedAt);
  const records = await captureGmailSinceToday({ sinceIso: previousCursor });

  let insertedRaw = 0;
  let normalized = 0;
  let aiSummaries = 0;
  let nextCursor = previousCursor;

  try {
    for (const record of records) {
      if (record.receivedAt <= previousCursor) {
        continue;
      }
      if (record.receivedAt > nextCursor) {
        nextCursor = record.receivedAt;
      }

      const rawText = `${record.subject}\n${record.snippet}\n${record.bodyText}`;
      const rawRecordId = db.insertRawRecord({
        source: "gmail",
        sourceRecordId: record.sourceRecordId,
        capturedAt: new Date().toISOString(),
        rawJson: JSON.stringify(record),
        rawTextHash: db.hashText(rawText),
        rawText,
      });

      if (!rawRecordId) {
        continue;
      }

      insertedRaw += 1;
      const normalizedRecord = normalizeGmailRecord(rawRecordId, record);
      const normalizedId = db.insertNormalizedRecord(normalizedRecord);
      normalized += 1;

      const aiSummary = await generateAiSummary({ ...normalizedRecord, id: normalizedId });
      db.insertAiSummary({ ...aiSummary, normalizedRecordId: normalizedId });
      aiSummaries += 1;
    }

    const runCompletedAt = new Date().toISOString();
    db.upsertSourceState({
      name: "gmail",
      lastSyncedAt: runCompletedAt,
      lastCursor: nextCursor,
      lastHash: db.hashText(nextCursor),
    });

    return {
      captured: records.length,
      insertedRaw,
      normalized,
      aiSummaries,
      previousCursor,
      runStartedAt,
      runCompletedAt,
      nextCursor,
      lastCursor: nextCursor,
    };
  } finally {
    db.close();
  }
}
