import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AiSummary, NormalizedRecord, RawRecord, SyncSourceState } from "@local-sync/shared";
import {
  REPO_ROOT,
  isPathUnderRoot,
  resolveDefaultSqlitePath,
  resolveImageStorageDir,
} from "@local-sync/shared";

const DEFAULT_DB_PATH = resolveDefaultSqlitePath();

export class Db {
  private readonly db: Database.Database;

  constructor(path = DEFAULT_DB_PATH) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        last_synced_at TEXT,
        last_cursor TEXT,
        last_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS raw_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        raw_text_hash TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        UNIQUE(source, source_record_id, raw_text_hash)
      );

      CREATE TABLE IF NOT EXISTS normalized_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_record_id INTEGER NOT NULL UNIQUE,
        source TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        sender TEXT,
        event_date TEXT,
        location TEXT,
        point_of_contact TEXT,
        assigned_staff TEXT,
        status TEXT NOT NULL,
        notes TEXT,
        updated_at TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        FOREIGN KEY(raw_record_id) REFERENCES raw_records(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ai_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        normalized_record_id INTEGER NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        missing_fields TEXT NOT NULL,
        priority TEXT NOT NULL,
        category TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        FOREIGN KEY(normalized_record_id) REFERENCES normalized_records(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS record_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_record_id INTEGER NOT NULL,
        source_record_id TEXT NOT NULL,
        image_kind TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        local_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(raw_record_id) REFERENCES raw_records(id) ON DELETE CASCADE,
        UNIQUE(raw_record_id, content_hash)
      );

      CREATE TABLE IF NOT EXISTS ai_image_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_image_id INTEGER NOT NULL UNIQUE,
        insight_json TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        FOREIGN KEY(record_image_id) REFERENCES record_images(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_raw_records_source_captured_at ON raw_records(source, captured_at);
      CREATE INDEX IF NOT EXISTS idx_normalized_records_updated_at ON normalized_records(updated_at);
      CREATE INDEX IF NOT EXISTS idx_record_images_raw_record_id ON record_images(raw_record_id);
    `);
    this.ensureNormalizedSenderColumn();
  }

  private ensureNormalizedSenderColumn(): void {
    const cols = this.db.prepare("PRAGMA table_info(normalized_records)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "sender")) {
      this.db.exec("ALTER TABLE normalized_records ADD COLUMN sender TEXT");
    }
  }

  upsertSourceState(state: SyncSourceState): void {
    this.db
      .prepare(
        `
      INSERT INTO sync_sources(name, last_synced_at, last_cursor, last_hash)
      VALUES (@name, @lastSyncedAt, @lastCursor, @lastHash)
      ON CONFLICT(name) DO UPDATE SET
        last_synced_at = excluded.last_synced_at,
        last_cursor = excluded.last_cursor,
        last_hash = excluded.last_hash
    `,
      )
      .run({
        name: state.name,
        lastSyncedAt: state.lastSyncedAt,
        lastCursor: state.lastCursor,
        lastHash: state.lastHash,
      });
  }

  getSourceState(source: string): SyncSourceState | null {
    const row = this.db
      .prepare("SELECT id, name, last_synced_at as lastSyncedAt, last_cursor as lastCursor, last_hash as lastHash FROM sync_sources WHERE name = ?")
      .get(source) as SyncSourceState | undefined;
    return row ?? null;
  }

  insertRawRecord(record: RawRecord): number | null {
    const result = this.db
      .prepare(
        `
      INSERT OR IGNORE INTO raw_records(source, source_record_id, captured_at, raw_json, raw_text_hash, raw_text)
      VALUES (@source, @sourceRecordId, @capturedAt, @rawJson, @rawTextHash, @rawText)
    `,
      )
      .run(record);

    if (result.changes === 0) {
      const existing = this.db
        .prepare("SELECT id FROM raw_records WHERE source = ? AND source_record_id = ? AND raw_text_hash = ?")
        .get(record.source, record.sourceRecordId, record.rawTextHash) as { id: number } | undefined;
      return existing?.id ?? null;
    }

    return Number(result.lastInsertRowid);
  }

  insertNormalizedRecord(record: NormalizedRecord): number {
    const result = this.db
      .prepare(
        `
      INSERT OR REPLACE INTO normalized_records(
        raw_record_id, source, source_record_id, sender, event_date, location, point_of_contact,
        assigned_staff, status, notes, updated_at, raw_text
      ) VALUES (
        @rawRecordId, @source, @sourceRecordId, @sender, @eventDate, @location, @pointOfContact,
        @assignedStaff, @status, @notes, @updatedAt, @rawText
      )
    `,
      )
      .run(record);
    return Number(result.lastInsertRowid);
  }

  insertAiSummary(summary: AiSummary): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO ai_summaries(normalized_record_id, summary, missing_fields, priority, category, generated_at)
      VALUES (@normalizedRecordId, @summary, @missingFields, @priority, @category, @generatedAt)
    `,
      )
      .run({
        normalizedRecordId: summary.normalizedRecordId,
        summary: summary.summary,
        missingFields: JSON.stringify(summary.missingFields),
        priority: summary.priority,
        category: summary.category,
        generatedAt: summary.generatedAt,
      });
  }

  insertRecordImage(image: {
    rawRecordId: number;
    sourceRecordId: string;
    imageKind: "inline" | "attachment";
    filename: string;
    mimeType: string;
    localPath: string;
    contentHash: string;
    createdAt: string;
  }): number | null {
    const result = this.db
      .prepare(
        `
      INSERT OR IGNORE INTO record_images(
        raw_record_id, source_record_id, image_kind, filename, mime_type, local_path, content_hash, created_at
      )
      VALUES(
        @rawRecordId, @sourceRecordId, @imageKind, @filename, @mimeType, @localPath, @contentHash, @createdAt
      )
    `,
      )
      .run(image);

    if (result.changes === 0) {
      const existing = this.db
        .prepare("SELECT id FROM record_images WHERE raw_record_id = ? AND content_hash = ?")
        .get(image.rawRecordId, image.contentHash) as { id: number } | undefined;
      return existing?.id ?? null;
    }

    return Number(result.lastInsertRowid);
  }

  upsertAiImageInsight(input: { recordImageId: number; insightJson: string; generatedAt: string }): void {
    this.db
      .prepare(
        `
      INSERT INTO ai_image_insights(record_image_id, insight_json, generated_at)
      VALUES(@recordImageId, @insightJson, @generatedAt)
      ON CONFLICT(record_image_id) DO UPDATE SET
        insight_json = excluded.insight_json,
        generated_at = excluded.generated_at
    `,
      )
      .run(input);
  }

  getRecentRecords(limit = 100): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `
      SELECT
        nr.id,
        nr.source,
        nr.source_record_id as sourceRecordId,
        nr.sender as sender,
        nr.event_date as eventDate,
        nr.location,
        nr.point_of_contact as pointOfContact,
        nr.assigned_staff as assignedStaff,
        nr.status,
        nr.notes,
        nr.updated_at as updatedAt,
        ai.summary,
        ai.missing_fields as missingFields,
        ai.priority,
        ai.category,
        COALESCE(img.imageCount, 0) as imageCount,
        img.imageInsights
      FROM normalized_records nr
      LEFT JOIN ai_summaries ai ON ai.normalized_record_id = nr.id
      LEFT JOIN (
        SELECT
          ri.raw_record_id,
          COUNT(*) as imageCount,
          GROUP_CONCAT(aii.insight_json, ' || ') as imageInsights
        FROM record_images ri
        LEFT JOIN ai_image_insights aii ON aii.record_image_id = ri.id
        GROUP BY ri.raw_record_id
      ) img ON img.raw_record_id = nr.raw_record_id
      ORDER BY nr.updated_at DESC
      LIMIT ?
    `,
      )
      .all(limit) as Array<Record<string, unknown>>;
  }

  getAiSummaryForRecord(normalizedRecordId: number): Record<string, unknown> | null {
    const row = this.db
      .prepare(
        "SELECT id, normalized_record_id as normalizedRecordId, summary, missing_fields as missingFields, priority, category, generated_at as generatedAt FROM ai_summaries WHERE normalized_record_id = ?",
      )
      .get(normalizedRecordId) as Record<string, unknown> | undefined;
    return row ?? null;
  }

  getImagesForNormalizedRecord(normalizedRecordId: number): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `
      SELECT
        ri.id,
        ri.raw_record_id as rawRecordId,
        ri.source_record_id as sourceRecordId,
        ri.image_kind as imageKind,
        ri.filename,
        ri.mime_type as mimeType,
        ri.local_path as localPath,
        ri.content_hash as contentHash,
        ri.created_at as createdAt,
        aii.insight_json as insightJson,
        aii.generated_at as insightGeneratedAt
      FROM normalized_records nr
      JOIN record_images ri ON ri.raw_record_id = nr.raw_record_id
      LEFT JOIN ai_image_insights aii ON aii.record_image_id = ri.id
      WHERE nr.id = ?
      ORDER BY ri.id DESC
    `,
      )
      .all(normalizedRecordId) as Array<Record<string, unknown>>;
  }

  /**
   * Resolves a stored image file for download if it belongs to the normalized record
   * and lives under the configured image storage directory.
   */
  getRecordImageFileForDownload(
    normalizedRecordId: number,
    recordImageId: number,
  ): { absolutePath: string; mimeType: string } | null {
    const row = this.db
      .prepare(
        `
      SELECT ri.local_path as localPath, ri.mime_type as mimeType
      FROM normalized_records nr
      JOIN record_images ri ON ri.raw_record_id = nr.raw_record_id
      WHERE nr.id = ? AND ri.id = ?
    `,
      )
      .get(normalizedRecordId, recordImageId) as { localPath: string; mimeType: string } | undefined;
    if (!row) return null;
    const absFile = resolve(row.localPath);
    if (!existsSync(absFile)) return null;
    const configuredDir = resolve(resolveImageStorageDir());
    const underImageDir = isPathUnderRoot(configuredDir, absFile);
    const underRepo = isPathUnderRoot(REPO_ROOT, absFile);
    if (!underImageDir && !underRepo) {
      return null;
    }
    return {
      absolutePath: absFile,
      mimeType: row.mimeType?.trim() ? row.mimeType : "application/octet-stream",
    };
  }

  /**
   * Deletes all app data for local testing. Optionally removes local image files.
   * Does not remove the SQLite file itself (tables are emptied).
   */
  wipeAllData(options: { wipeImageFiles: boolean }): { imageDir: string; wipedImageDir: boolean } {
    const imageDir = resolveImageStorageDir();
    this.db.exec("BEGIN");
    this.db.exec("DELETE FROM ai_image_insights");
    this.db.exec("DELETE FROM record_images");
    this.db.exec("DELETE FROM ai_summaries");
    this.db.exec("DELETE FROM normalized_records");
    this.db.exec("DELETE FROM raw_records");
    this.db.exec("DELETE FROM sync_sources");
    this.db.exec(
      `INSERT INTO sync_sources(name, last_synced_at, last_cursor, last_hash)
       VALUES ('gmail', NULL, NULL, NULL)`,
    );
    this.db.exec("COMMIT");
    this.db.exec("VACUUM");

    let wipedImageDir = false;
    if (options.wipeImageFiles) {
      if (existsSync(imageDir)) {
        rmSync(imageDir, { recursive: true, force: true });
        mkdirSync(imageDir, { recursive: true });
        wipedImageDir = true;
      }
    }

    return { imageDir, wipedImageDir };
  }

  hashText(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }

  close(): void {
    this.db.close();
  }
}
