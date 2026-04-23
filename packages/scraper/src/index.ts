import { chromium, type BrowserContext, type Page } from "playwright";
import type { GmailCapturedRecord } from "@local-sync/shared";

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

async function openGmailPage(context: BrowserContext): Promise<Page> {
  const existing = context.pages().find((p) => p.url().includes("mail.google.com"));
  if (existing) {
    return existing;
  }
  const page = await context.newPage();
  await page.goto("https://mail.google.com/mail/u/0/#inbox", { waitUntil: "domcontentloaded" });
  return page;
}

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
    await page.fill('input[name="q"]', `in:anywhere after:${queryDate}`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);

    const rows = page.locator("tr.zA:visible");
    const timeoutAt = Date.now() + 20000;
    let rowCount = await rows.count();
    while (rowCount === 0 && Date.now() < timeoutAt) {
      await page.waitForTimeout(350);
      rowCount = await rows.count();
    }

    if (rowCount === 0) {
      throw new Error(`No Gmail message rows found for query: in:anywhere after:${queryDate}`);
    }

    const count = Math.min(await rows.count(), maxEmails);
    const records: GmailCapturedRecord[] = [];

    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      await row.scrollIntoViewIfNeeded().catch(() => undefined);
      const subject = ((await row.locator(".bog").first().textContent()) ?? "").trim();
      const from = ((await row.locator(".yW span").first().textContent()) ?? "").trim();
      const snippet = ((await row.locator(".y2").first().textContent()) ?? "").replace(/^-/, "").trim();
      const receivedTitle = ((await row.locator("td.xW span").first().getAttribute("title")) ?? "").trim();
      const receivedAt = toIso(receivedTitle);

      // Gmail rows are sometimes present in the DOM but not click-targetable.
      // Prefer clicking visible subject/sender cells, then fallback to row click.
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
      const threadId = url.split("/").pop() ?? `${Date.now()}-${i}`;
      const bodyText = ((await page.locator("div.a3s").first().innerText().catch(() => "")) ?? "").trim();

      records.push({
        source: "gmail",
        sourceRecordId: threadId,
        threadId,
        subject,
        from,
        receivedAt,
        snippet,
        bodyText,
        url,
      });

      const backButton = page.locator('div[aria-label="Back to Inbox"]');
      if ((await backButton.count()) > 0) {
        await backButton.first().click();
      } else {
        await page.goBack().catch(() => undefined);
      }
      await page.waitForTimeout(1000);
    }

    return records;
  } finally {
    await browser.close();
  }
}
