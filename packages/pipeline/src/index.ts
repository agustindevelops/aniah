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

const EMAIL_IN_ANGLE = /<([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})>/;
const EMAIL_LOOSE = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/;

function emailFromDisplayLine(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const a = t.match(EMAIL_IN_ANGLE);
  if (a) return a[1].trim();
  const b = t.match(EMAIL_LOOSE);
  return b ? b[0].trim() : null;
}

/** Prefer scraped address; fall back to parsing the list-preview line. */
function buildSender(record: GmailCapturedRecord): string | null {
  const name = record.from?.trim() ?? "";
  const email =
    (record.fromEmail?.trim() ? record.fromEmail.trim() : null) ?? emailFromDisplayLine(name);
  if (email && name) {
    const nameHasEmail =
      name.toLowerCase().includes(email.toLowerCase()) ||
      EMAIL_IN_ANGLE.test(name) ||
      EMAIL_LOOSE.test(name);
    if (nameHasEmail) return name;
    return `${name} <${email}>`;
  }
  return email || name || null;
}

export function normalizeGmailRecord(rawRecordId: number, record: GmailCapturedRecord): NormalizedRecord {
  const combinedText = [record.subject, record.snippet, record.bodyText].join("\n");
  const eventDate =
    firstMatch(combinedText, /(?:event|date|on)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?)/i) ??
    firstMatch(combinedText, /\b(\d{4}-\d{2}-\d{2})\b/);
  const location = firstMatch(combinedText, /(?:location|venue|address)\s*[:\-]\s*([^\n]+)/i);
  const pointOfContact = firstMatch(combinedText, /(?:contact|poc|point of contact)\s*[:\-]\s*([^\n]+)/i);
  const assignedStaff = firstMatch(combinedText, /(?:staff|assigned to|owner)\s*[:\-]\s*([^\n]+)/i);

  const sender = buildSender(record);

  return {
    rawRecordId,
    source: "gmail",
    sourceRecordId: record.sourceRecordId,
    sender,
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
