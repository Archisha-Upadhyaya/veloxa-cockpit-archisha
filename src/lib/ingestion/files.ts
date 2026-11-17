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

const execFileAsync = promisify(execFile);
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
  const match = folder.match(/^Day[12]_[A-Za-z]+_(\d{2})([A-Za-z]{3})$/);
  if (!match) return null;
  const month = { nov: "11" }[match[2].toLowerCase()];
  return month ? `${new Date().getUTCFullYear()}-${month}-${match[1]}` : null;
}

/**
 * A release pack becomes available at 10:00 IST on its release day. Using the
 * file's mtime made point-in-time answers depend on when the repo was copied.
 */
function availableAt(relativePath: string, fallback: Date) {
  const day = releaseDay(relativePath);
  return day ? `${day}T10:00:00+05:30` : fallback.toISOString();
}

async function extractText(filePath: string, buffer: Buffer) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".docx") {
    return (await mammoth.extractRawText({ buffer })).value;
  }
  if (extension === ".xlsx") {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    return workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      return `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`;
    }).join("\n\n");
  }
  if (extension === ".csv" || extension === ".txt") return buffer.toString("utf8");
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
  const allowedDays = ["Day1_Mon_16Nov", "Day2_Tue_17Nov"];
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
      contentHash: createHash("sha256").update(buffer).digest("hex"),
      title: path.basename(absolutePath),
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
