import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { simpleParser } from "mailparser";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { isSensitiveEvidence } from "@/lib/evidence/snippet";
import { profileTable } from "@/lib/ingestion/table-profile";

const execFileAsync = promisify(execFile);
/** Bump when parsing or profiling changes, to re-ingest every file once. */
const PARSER_VERSION = "2026-11-19.1";
const supportedExtensions = new Set([".csv", ".docx", ".eml", ".pdf", ".txt", ".xlsx"]);

export type ParsedFile = {
  absolutePath: string;
  relativePath: string;
  contentHash: string;
  title: string;
  sourceType: "transcript" | "spreadsheet" | "pdf" | "email" | "template";
  text: string;
  availableAt: string;
  releaseDay: string;
  sensitive: boolean;
  /** Data-room records are primary evidence; call transcripts are secondary. */
  tier: "primary" | "secondary";
};

function sourceType(filePath: string): ParsedFile["sourceType"] {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".docx") return "transcript";
  if (extension === ".xlsx" || extension === ".csv") return "spreadsheet";
  if (extension === ".eml") return "email";
  if (extension === ".pdf") return "pdf";
  return "template";
}

function releaseDay(relativePath: string) {
  const folder = relativePath.split("/")[0];
  const match = folder.match(/^Day\d+_[A-Za-z]+_(\d{2})([A-Za-z]{3})$/);
  if (!match) return null;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = months.indexOf(match[2].toLowerCase());
  return month >= 0
    ? `${new Date().getUTCFullYear()}-${String(month + 1).padStart(2, "0")}-${match[1]}`
    : null;
}

/**
 * A release pack becomes available at 10:00 IST on its release day. Using the
 * file's mtime made point-in-time answers depend on when the repo was copied.
 */
function availableAt(relativePath: string, fallback: Date) {
  const day = releaseDay(relativePath);
  return day ? `${day}T10:00:00+05:30` : fallback.toISOString();
}

function emailSubject(filePath: string, text: string) {
  if (path.extname(filePath).toLowerCase() !== ".eml") return null;
  const subject = text.match(/^Subject:\s*(.+)$/m)?.[1]?.trim();
  return subject ? `Email: ${subject}` : null;
}

async function extractText(filePath: string, buffer: Buffer) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".docx") {
    return (await mammoth.extractRawText({ buffer })).value;
  }
  if (extension === ".xlsx") {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    return workbook.SheetNames.map((name) => {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
      const profile = profileTable(csv, `${path.basename(filePath)} / ${name}`);
      return `${profile ? `${profile}\n\n` : ""}Sheet: ${name}\n${csv}`;
    }).join("\n\n");
  }
  if (extension === ".csv") {
    const csv = buffer.toString("utf8");
    const profile = profileTable(csv, path.basename(filePath));
    // The profile comes first so it is the first evidence chunk.
    return profile ? `${profile}\n\nRaw rows:\n${csv}` : csv;
  }
  if (extension === ".txt") return buffer.toString("utf8");
  if (extension === ".eml") {
    const parsed = await simpleParser(buffer);
    const addressText = (value: typeof parsed.from | typeof parsed.to) =>
      Array.isArray(value) ? value.map((item) => item.text).join(", ") : value?.text ?? "";
    return [
      `From: ${addressText(parsed.from)}`,
      `To: ${addressText(parsed.to)}`,
      `Subject: ${parsed.subject ?? ""}`,
      parsed.date ? `Date: ${parsed.date.toISOString()}` : "",
      parsed.text ?? "",
    ].filter(Boolean).join("\n");
  }
  if (extension === ".pdf") {
    // The release-pack mount is read-only, so never write beside the source.
    const temporaryPath = path.join(
      os.tmpdir(),
      `veloxa-${createHash("sha256").update(buffer).digest("hex").slice(0, 16)}.pdf`,
    );
    await fs.writeFile(temporaryPath, buffer);
    try {
      const result = await execFileAsync("pdftotext", [temporaryPath, "-"]);
      return result.stdout;
    } finally {
      await fs.unlink(temporaryPath).catch(() => undefined);
    }
  }
  return "";
}

export function dataRoomRoot() {
  return path.resolve(/* turbopackIgnore: true */
    process.env.VELOXA_DATA_ROOM_PATH ??
      path.join(process.cwd(), "Veloxa_Hackathon_Release_Packs"),
  );
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "templates") {
      files.push(...(await listFiles(fullPath)));
    }
    else if (
      entry.name !== "README.txt" &&
      // CEO voice notes are the CEO's own thinking, not company evidence.
      !/^T6[a-z]?_/i.test(entry.name) &&
      supportedExtensions.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function chunks(text: string, size = 1800, overlap = 220) {
  const normalized = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  const result: string[] = [];
  for (let start = 0; start < normalized.length; start += size - overlap) {
    const chunk = normalized.slice(start, start + size).trim();
    if (chunk.length >= 80) result.push(chunk);
  }
  return result;
}

export async function readDataRoom(): Promise<ParsedFile[]> {
  const root = dataRoomRoot();
  // Scope is configurable; by default the Day 1-4 packs are
  // ingested. availableAt still gates visibility inside that scope.
  const releaseDays = (process.env.VELOXA_RELEASE_DAYS ?? "Day1,Day2,Day3,Day4")
    .split(",")
    .map((day) => day.trim())
    .filter(Boolean);
  const allowedDays = (await fs.readdir(root, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isDirectory() &&
        releaseDays.some((day) => entry.name.startsWith(`${day}_`)),
    )
    .map((entry) => entry.name)
    .sort();
  const files: string[] = [];
  for (const day of allowedDays) {
    for (const folder of ["data_room", "transcripts"]) {
      // The release-pack directory is a runtime mount, not part of the image.
      const directory = path.join(/* turbopackIgnore: true */ root, day, folder);
      try {
        files.push(...(await listFiles(directory)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  const parsed: ParsedFile[] = [];
  for (const absolutePath of files) {
    const buffer = await fs.readFile(absolutePath);
    const stat = await fs.stat(absolutePath);
    const text = await extractText(absolutePath, buffer);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    const sensitive =
      /payroll[\s_-]*register|salary[\s_-]*(sheet|register)|payslip/i.test(
        relativePath,
      ) || isSensitiveEvidence(text);
    parsed.push({
      absolutePath,
      relativePath,
      // The parser version is part of the hash, so improving how files are
      // read (e.g. table profiles) re-ingests them once.
      contentHash: createHash("sha256").update(PARSER_VERSION).update(buffer).digest("hex"),
      // Emails are titled by their subject; everything else by file name.
      title: emailSubject(absolutePath, text) ?? path.basename(absolutePath),
      tier: relativePath.includes("/transcripts/") ? "secondary" : "primary",
      sourceType: sourceType(absolutePath),
      text,
      availableAt: availableAt(relativePath, stat.mtime),
      releaseDay: releaseDay(relativePath) ?? new Date(stat.mtime).toISOString().slice(0, 10),
      sensitive,
    });
  }
  return parsed;
}

export function splitEvidence(text: string) {
  return chunks(text);
}
