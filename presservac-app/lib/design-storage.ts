import { promises as fs } from "node:fs";
import path from "node:path";
import { createSupabaseStorageClient, getStorageBucket } from "@/lib/supabase-storage";

// Archivos de arte: se guardan tal cual (sin recomprimir) y solo se sirven por la API con sesión.
// Con Supabase configurado van al bucket; si no (desarrollo local), a .data/diseno.

export const DESIGN_MAX_BYTES = 30 * 1024 * 1024;

const TYPES: { mime: string; ext: string; magic: (h: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", magic: (h) => h.subarray(0, 4).toString("latin1") === "%PDF" },
  { mime: "image/png", ext: "png", magic: (h) => h[0] === 0x89 && h.subarray(1, 4).toString("latin1") === "PNG" },
  { mime: "image/jpeg", ext: "jpg", magic: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  { mime: "image/webp", ext: "webp", magic: (h) => h.subarray(0, 4).toString("latin1") === "RIFF" && h.subarray(8, 12).toString("latin1") === "WEBP" },
];

const LOCAL_ROOT = path.join(process.cwd(), ".data");
const KEY_RE = /^(diseno|pagos|entregas)\/\d{4}\/[\w-]+\.(pdf|png|jpg|webp)$/;

/** Detecta el tipo por los primeros bytes (el content-type del navegador no se usa). Un .ai con compatibilidad PDF entra como PDF. */
export function detectDesignType(head: Buffer) {
  return TYPES.find((t) => t.magic(head)) ?? null;
}

export async function saveDesignFile(file: File, folder: "diseno" | "pagos" | "entregas" = "diseno"): Promise<{ key: string; mimeType: string; size: number }> {
  if (file.size > DESIGN_MAX_BYTES) throw new Error("FILE_TOO_LARGE");
  const body = Buffer.from(await file.arrayBuffer());
  const type = detectDesignType(body.subarray(0, 16));
  if (!type) throw new Error("INVALID_FILE_TYPE");
  const key = `${folder}/${new Date().getFullYear()}/${Date.now()}-${crypto.randomUUID()}.${type.ext}`;

  const supabase = createSupabaseStorageClient();
  if (supabase) {
    const { error } = await supabase.storage.from(getStorageBucket()).upload(key, body, { contentType: type.mime, upsert: false });
    if (error) throw new Error(error.message);
  } else {
    const full = path.join(LOCAL_ROOT, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }
  return { key, mimeType: type.mime, size: body.length };
}

export async function readDesignFile(key: string): Promise<Buffer | null> {
  if (!KEY_RE.test(key)) return null;
  const supabase = createSupabaseStorageClient();
  if (supabase) {
    const { data, error } = await supabase.storage.from(getStorageBucket()).download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  try {
    return await fs.readFile(path.join(LOCAL_ROOT, key));
  } catch {
    return null;
  }
}

export async function deleteDesignFile(key: string): Promise<void> {
  if (!KEY_RE.test(key)) return;
  const supabase = createSupabaseStorageClient();
  if (supabase) {
    await supabase.storage.from(getStorageBucket()).remove([key]).catch(() => {});
    return;
  }
  await fs.unlink(path.join(LOCAL_ROOT, key)).catch(() => {});
}
