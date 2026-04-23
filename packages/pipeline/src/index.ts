import type { GmailCapturedRecord, NormalizedRecord } from "@local-sync/shared";

function firstMatch(input: string, pattern: RegExp): string | null {
  const match = input.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function inferStatus(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("urgent") || lower.includes("asap")) return "urgent";
  if (lower.includes("confirmed") || lower.includes("booked")) return "confirmed";
  if (lower.includes("cancel") || lower.includes("resched")) return "attention";
  return "new";
}

export function normalizeGmailRecord(rawRecordId: number, record: GmailCapturedRecord): NormalizedRecord {
  const combinedText = [record.subject, record.snippet, record.bodyText].join("\n");
  const eventDate =
    firstMatch(combinedText, /(?:event|date|on)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?)/i) ??
    firstMatch(combinedText, /\b(\d{4}-\d{2}-\d{2})\b/);
  const location = firstMatch(combinedText, /(?:location|venue|address)\s*[:\-]\s*([^\n]+)/i);
  const pointOfContact = firstMatch(combinedText, /(?:contact|poc|point of contact)\s*[:\-]\s*([^\n]+)/i);
  const assignedStaff = firstMatch(combinedText, /(?:staff|assigned to|owner)\s*[:\-]\s*([^\n]+)/i);

  return {
    rawRecordId,
    source: "gmail",
    sourceRecordId: record.sourceRecordId,
    eventDate,
    location,
    pointOfContact,
    assignedStaff,
    status: inferStatus(combinedText),
    notes: record.snippet || null,
    updatedAt: new Date().toISOString(),
    rawText: combinedText,
  };
}
