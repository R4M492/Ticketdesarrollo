import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { env } from "../config/env.js";

export const UPLOAD_DIR = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Extensiones y MIME permitidos para adjuntos
export const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg",
  "pdf",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "txt", "csv", "log",
  "zip", "rar", "7z",
]);

export const ALLOWED_MIMES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
  "application/zip", "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/octet-stream",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(".", "") || "bin";
    const storedName = `${Date.now()}-${crypto.randomBytes(12).toString("hex")}.${ext}`;
    cb(null, storedName);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(".", "");
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error(`Tipo de archivo no permitido: ${file.originalname}`));
    }
    cb(null, true);
  },
});

/** Convierte un error de multer en un mensaje claro. */
export function uploadErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === "LIMIT_FILE_SIZE") return `El archivo supera el límite de ${env.UPLOAD_MAX_MB} MB`;
  if (e?.code === "LIMIT_FILE_COUNT") return "Se permite un máximo de 5 archivos por carga";
  return e?.message ?? "Error al subir el archivo";
}
