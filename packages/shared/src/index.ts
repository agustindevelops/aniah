export type SourceName = "gmail";

export interface RawRecord {
  id?: number;
  source: SourceName;
  sourceRecordId: string;
  capturedAt: string;
  rawJson: string;
  rawTextHash: string;
  rawText: string;
}

export interface NormalizedRecord {
  id?: number;
  rawRecordId: number;
  source: SourceName;
  sourceRecordId: string;
  eventDate: string | null;
  location: string | null;
  pointOfContact: string | null;
  assignedStaff: string | null;
  status: string;
  notes: string | null;
  updatedAt: string;
  rawText: string;
}

export interface AiSummary {
  id?: number;
  normalizedRecordId: number;
  summary: string;
  missingFields: string[];
  priority: "low" | "medium" | "high";
  category: "event logistics" | "staffing" | "delivery" | "client comms" | "venue";
  generatedAt: string;
}

export interface SyncSourceState {
  id?: number;
  name: SourceName;
  lastSyncedAt: string | null;
  lastCursor: string | null;
  lastHash: string | null;
}

export interface GmailCapturedRecord {
  source: "gmail";
  sourceRecordId: string;
  threadId: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
  bodyText: string;
  url: string;
}
