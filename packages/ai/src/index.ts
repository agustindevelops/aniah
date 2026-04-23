import type { AiSummary, NormalizedRecord } from "@local-sync/shared";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";

interface AiResult {
  category: AiSummary["category"];
  summary: string;
  missing_fields: string[];
  priority: AiSummary["priority"];
}

const DEFAULT_RESULT: AiResult = {
  category: "client comms",
  summary: "Update available. Review normalized details for context.",
  missing_fields: [],
  priority: "medium",
};

function promptForRecord(record: NormalizedRecord): string {
  return `
You are an assistant for event operations triage.
Return ONLY valid JSON with this exact shape:
{
  "category": "event logistics|staffing|delivery|client comms|venue",
  "summary": "three short lines separated by \\n",
  "missing_fields": ["event_date","location","point_of_contact","assigned_staff","load_in_time"],
  "priority": "low|medium|high"
}

Record:
${JSON.stringify(
    {
      source: record.source,
      sourceRecordId: record.sourceRecordId,
      eventDate: record.eventDate,
      location: record.location,
      pointOfContact: record.pointOfContact,
      assignedStaff: record.assignedStaff,
      status: record.status,
      notes: record.notes,
      rawText: record.rawText.slice(0, 4000),
    },
    null,
    2,
  )}
`;
}

function parseJsonResponse(text: string): AiResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return DEFAULT_RESULT;
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<AiResult>;
    const allowedCategories: AiSummary["category"][] = ["event logistics", "staffing", "delivery", "client comms", "venue"];
    const category = allowedCategories.includes(parsed.category as AiSummary["category"])
      ? (parsed.category as AiSummary["category"])
      : DEFAULT_RESULT.category;
    const priority = parsed.priority === "low" || parsed.priority === "medium" || parsed.priority === "high" ? parsed.priority : "medium";
    const summary = typeof parsed.summary === "string" && parsed.summary.trim().length > 0 ? parsed.summary.trim() : DEFAULT_RESULT.summary;
    const missingFields = Array.isArray(parsed.missing_fields)
      ? parsed.missing_fields.filter((v): v is string => typeof v === "string")
      : DEFAULT_RESULT.missing_fields;
    return { category, priority, summary, missing_fields: missingFields };
  } catch {
    return DEFAULT_RESULT;
  }
}

export async function generateAiSummary(normalizedRecord: NormalizedRecord): Promise<AiSummary> {
  const requestBody = {
    model: OLLAMA_MODEL,
    prompt: promptForRecord(normalizedRecord),
    stream: false,
    options: {
      temperature: 0.1,
    },
  };

  let result = DEFAULT_RESULT;
  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const payload = (await response.json()) as { response?: string };
    const raw = payload.response ?? "";
    result = parseJsonResponse(raw);
  } catch {
    result = DEFAULT_RESULT;
  }

  return {
    normalizedRecordId: normalizedRecord.id ?? 0,
    category: result.category,
    summary: result.summary,
    missingFields: result.missing_fields,
    priority: result.priority,
    generatedAt: new Date().toISOString(),
  };
}
