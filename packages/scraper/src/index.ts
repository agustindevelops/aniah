import { chromium, type BrowserContext, type Page } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import type { GmailCapturedImage, GmailCapturedRecord } from "@local-sync/shared";
import { resolveImageStorageDir } from "@local-sync/shared";

interface CaptureOptions {
  cdpUrl?: string;
  maxEmails?: number;
  sinceIso?: string;
}

function toIso(input: string | null): string {
  if (!input) return new Date().toISOString();
  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function buildTodayQueryDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function buildQueryDateFromCursor(sinceIso?: string): string {
  if (!sinceIso) {
    return buildTodayQueryDate();
  }
  const parsed = Date.parse(sinceIso);
  if (Number.isNaN(parsed)) {
    return buildTodayQueryDate();
  }
  const date = new Date(parsed);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function fileSafeName(input: string): string {
  const sanitized = input.replace(/[^\w.-]+/g, "_").slice(0, 80);
  return sanitized.length > 0 ? sanitized : `image_${Date.now()}`;
}

function hashBuffer(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function contentTypeToExt(contentType: string | null): string {
  if (!contentType) return ".png";
  if (contentType.includes("jpeg")) return ".jpg";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  return ".png";
}

function imageStorageRoot(): string {
  return resolveImageStorageDir();
}

async function saveImageBuffer(
  sourceRecordId: string,
  filenameSeed: string,
  mimeType: string,
  imageKind: "inline" | "attachment",
  imageBuffer: Buffer,
): Promise<GmailCapturedImage> {
  const contentHash = hashBuffer(imageBuffer);
  const ext = extname(filenameSeed) || contentTypeToExt(mimeType);
  const finalFileName = `${fileSafeName(filenameSeed)}_${contentHash.slice(0, 8)}${ext}`;
  const root = imageStorageRoot();
  const targetDir = resolve(root, fileSafeName(sourceRecordId));
  await mkdir(targetDir, { recursive: true });
  const localPath = resolve(targetDir, finalFileName);
  await writeFile(localPath, imageBuffer);

  return {
    kind: imageKind,
    filename: finalFileName,
    mimeType,
    localPath,
    contentHash,
  };
}

async function captureInlineImages(page: Page, sourceRecordId: string): Promise<GmailCapturedImage[]> {
  const maxImages = Number(process.env.GMAIL_MAX_INLINE_IMAGES ?? 8);
  const images: GmailCapturedImage[] = [];
  const imgNodes = page.locator("div.a3s img:visible");
  const count = Math.min(await imgNodes.count(), maxImages);
  for (let i = 0; i < count; i += 1) {
    const img = imgNodes.nth(i);
    const screenshotBuffer = await img.screenshot({ timeout: 5000 }).catch(() => null);
    if (!screenshotBuffer) continue;
    const src = (await img.getAttribute("src").catch(() => null)) ?? "";
    const filename = src ? basename(src.split("?")[0]) : `inline_${i + 1}.png`;
    images.push(await saveImageBuffer(sourceRecordId, filename, "image/png", "inline", screenshotBuffer));
  }
  return images;
}

async function captureAttachmentImages(page: Page, sourceRecordId: string): Promise<GmailCapturedImage[]> {
  const maxImages = Number(process.env.GMAIL_MAX_ATTACHMENT_IMAGES ?? 8);
  const images: GmailCapturedImage[] = [];
  const attachmentThumbs = page.locator("div.aQH img:visible, div.aZo img:visible");
  const count = Math.min(await attachmentThumbs.count(), maxImages);
  for (let i = 0; i < count; i += 1) {
    const img = attachmentThumbs.nth(i);
    const screenshotBuffer = await img.screenshot({ timeout: 5000 }).catch(() => null);
    if (!screenshotBuffer) continue;
    const alt = (await img.getAttribute("alt").catch(() => null)) ?? `attachment_${i + 1}`;
    images.push(await saveImageBuffer(sourceRecordId, alt, "image/png", "attachment", screenshotBuffer));
  }
  return images;
}

async function openGmailPage(context: BrowserContext): Promise<Page> {
  const existing = context.pages().find((p) => p.url().includes("mail.google.com"));
  if (existing) {
    return existing;
  }
  const page = await context.newPage();
  await page.goto("https://mail.google.com/mail/u/0/#inbox", { waitUntil: "domcontentloaded" });
  return page;
}

/** Gmail thread / conversation view back control (label varies by folder / locale). */
const EMAIL_IN_ANGLE = /<([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})>/;
const EMAIL_LOOSE = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/;

function normalizeMailtoHref(href: string): string | null {
  const raw = href.replace(/^mailto:/i, "").split("?")[0].trim();
  if (!raw.includes("@")) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Best-effort sender address from the opened thread (first message), for inbox and sent.
 */
async function extractSenderEmailFromOpenMessage(page: Page): Promise<string | null> {
  const firstCard = page.locator("div.adn, div.gs").first();

  const fromSpan = firstCard.locator("span.gD[email], span[email]").first();
  const attr = await fromSpan.getAttribute("email").catch(() => null);
  if (attr?.includes("@")) {
    return attr.trim();
  }

  const mailto = firstCard.locator('a[href^="mailto:"]').first();
  const href = await mailto.getAttribute("href").catch(() => null);
  if (href) {
    const parsed = normalizeMailtoHref(href);
    if (parsed) return parsed;
  }

  const pageMailto = page.locator('div.adn a[href^="mailto:"], .h7 a[href^="mailto:"]').first();
  const href2 = await pageMailto.getAttribute("href").catch(() => null);
  if (href2) {
    const parsed = normalizeMailtoHref(href2);
    if (parsed) return parsed;
  }

  const globalEmailSpan = page.locator("span[email]").first();
  const g = await globalEmailSpan.getAttribute("email").catch(() => null);
  if (g?.includes("@")) return g.trim();

  const title = await firstCard.locator(".gD").first().getAttribute("title").catch(() => null);
  if (title) {
    const m = title.match(EMAIL_LOOSE);
    if (m) return m[0];
  }

  const gDText = await firstCard.locator(".gD").first().innerText().catch(() => "");
  const angle = gDText.match(EMAIL_IN_ANGLE);
  if (angle) return angle[1].trim();
  const loose = gDText.match(EMAIL_LOOSE);
  if (loose) return loose[0].trim();

  return null;
}

async function goBackToList(page: Page): Promise<void> {
  const back = page.locator(
    [
      'div[aria-label="Back to Inbox"]',
      'div[aria-label="Back to Sent Mail"]',
      'div[aria-label^="Back to "]',
    ].join(", "),
  );
  if ((await back.count()) > 0) {
    await back.first().click();
  } else {
    await page.goBack().catch(() => undefined);
  }
  await page.waitForTimeout(1000);
}

/**
 * Same list → open → capture → back flow as inbox: reads visible `tr.zA` rows for the current search.
 */
async function captureRecordsFromCurrentSearch(
  page: Page,
  maxTake: number,
  seenThreadIds: Set<string>,
  listIndexOffset: number,
): Promise<GmailCapturedRecord[]> {
  const rows = page.locator("tr.zA:visible");
  const timeoutAt = Date.now() + 20000;
  let rowCount = await rows.count();
  while (rowCount === 0 && Date.now() < timeoutAt) {
    await page.waitForTimeout(350);
    rowCount = await rows.count();
  }
  if (rowCount === 0) {
    return [];
  }

  const count = Math.min(rowCount, maxTake);
  const records: GmailCapturedRecord[] = [];

  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    await row.scrollIntoViewIfNeeded().catch(() => undefined);
    const subject = ((await row.locator(".bog").first().textContent()) ?? "").trim();
    const from = ((await row.locator(".yW span").first().textContent()) ?? "").trim();
    const snippet = ((await row.locator(".y2").first().textContent()) ?? "").replace(/^-/, "").trim();
    const receivedTitle = ((await row.locator("td.xW span").first().getAttribute("title")) ?? "").trim();
    const receivedAt = toIso(receivedTitle);

    const subjectCell = row.locator(".bog").first();
    const senderCell = row.locator(".yW span").first();
    const subjectVisible = await subjectCell.isVisible().catch(() => false);
    if (subjectVisible) {
      await subjectCell.click({ timeout: 10000 });
    } else {
      const senderVisible = await senderCell.isVisible().catch(() => false);
      if (senderVisible) {
        await senderCell.click({ timeout: 10000 });
      } else {
        await row.click({ timeout: 10000 });
      }
    }
    await page.waitForTimeout(1200);

    const url = page.url();
    const threadId = url.split("/").pop() ?? `${Date.now()}-${listIndexOffset + i}`;

    if (seenThreadIds.has(threadId)) {
      await goBackToList(page);
      continue;
    }

    const fromEmail = await extractSenderEmailFromOpenMessage(page);

    const bodyText = ((await page.locator("div.a3s").first().innerText().catch(() => "")) ?? "").trim();
    const inlineImages = await captureInlineImages(page, threadId);
    const attachmentImages = await captureAttachmentImages(page, threadId);
    const images = [...inlineImages, ...attachmentImages];

    seenThreadIds.add(threadId);
    records.push({
      source: "gmail",
      sourceRecordId: threadId,
      threadId,
      subject,
      from,
      fromEmail: fromEmail ?? null,
      receivedAt,
      snippet,
      bodyText,
      url,
      images,
    });

    await goBackToList(page);
  }

  return records;
}

const GMAIL_FOLDER_SEARCHES = ["in:inbox", "in:sent"] as const;

export async function captureGmailSinceToday(options: CaptureOptions = {}): Promise<GmailCapturedRecord[]> {
  const cdpUrl = options.cdpUrl ?? process.env.CHROME_CDP_URL ?? "http://127.0.0.1:9222";
  const maxEmails = options.maxEmails ?? Number(process.env.GMAIL_MAX_EMAILS ?? 200);
  const sinceIso = options.sinceIso;
  const browser = await chromium.connectOverCDP(cdpUrl);

  try {
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error("No browser context found in attached Chrome session.");
    }

    const context = contexts[0];
    const page = await openGmailPage(context);
    await page.bringToFront();
    await page.waitForSelector('input[name="q"]', { timeout: 20000 });

    const queryDate = buildQueryDateFromCursor(sinceIso);
    const seenThreadIds = new Set<string>();
    const allRecords: GmailCapturedRecord[] = [];
    let sawAnyListRows = false;
    let indexOffset = 0;

    for (const folderQuery of GMAIL_FOLDER_SEARCHES) {
      const remaining = maxEmails - allRecords.length;
      if (remaining <= 0) {
        break;
      }

      await page.fill('input[name="q"]', `${folderQuery} after:${queryDate}`);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2000);

      const rowCountBefore = await page.locator("tr.zA:visible").count();
      if (rowCountBefore > 0) {
        sawAnyListRows = true;
      }

      const batch = await captureRecordsFromCurrentSearch(page, remaining, seenThreadIds, indexOffset);
      indexOffset += batch.length;
      if (batch.length > 0) {
        sawAnyListRows = true;
      }
      allRecords.push(...batch);
    }

    if (allRecords.length === 0 && !sawAnyListRows) {
      throw new Error(
        `No Gmail message rows found for inbox/sent after:${queryDate} (tried ${GMAIL_FOLDER_SEARCHES.join(", ")})`,
      );
    }

    return allRecords;
  } finally {
    await browser.close();
  }
}
