import { objectStorageClient } from "./replit_integrations/object_storage";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || "";
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const LOCAL_MEDIA_DIR = path.join(process.cwd(), "uploads");

function ensureLocalDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function localPath(key: string): string {
  return path.join(LOCAL_MEDIA_DIR, key);
}

function getBucket() {
  if (!BUCKET_ID) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
  return objectStorageClient.bucket(BUCKET_ID);
}

function parseBase64(base64Data: string): { buffer: Buffer; ext: string; mimeType: string } {
  const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid base64 image format");

  const formatMap: Record<string, string> = { jpeg: "jpg", jpg: "jpg", png: "png", webp: "webp", gif: "gif" };
  const rawType = matches[1].toLowerCase();
  const ext = formatMap[rawType];
  if (!ext) throw new Error(`Unsupported image type: ${rawType}. Use JPEG, PNG, WebP, or GIF.`);

  const buffer = Buffer.from(matches[2], "base64");
  if (buffer.length > MAX_FILE_SIZE) throw new Error(`Image too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Max is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);

  return { buffer, ext, mimeType: `image/${rawType === "jpg" ? "jpeg" : rawType}` };
}

async function saveToObjectStorage(key: string, buffer: Buffer, contentType: string): Promise<boolean> {
  try {
    const bucket = getBucket();
    const file = bucket.file(key);
    await file.save(buffer, { contentType, resumable: false });
    const [exists] = await file.exists();
    if (!exists) {
      console.warn(`[media] Object storage save succeeded but file not found immediately: ${key}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[media] Object storage upload failed for ${key}: ${err.message}`);
    return false;
  }
}

function saveToLocal(key: string, buffer: Buffer): void {
  const fp = localPath(key);
  ensureLocalDir(fp);
  fs.writeFileSync(fp, buffer);
}

export async function uploadMedia(
  base64Data: string,
  category: string,
  id: string | number
): Promise<{ url: string; key: string }> {
  const { buffer, ext, mimeType } = parseBase64(base64Data);
  const timestamp = Date.now();
  const key = `public/media/${category}/${id}_${timestamp}.${ext}`;

  saveToLocal(key, buffer);
  await saveToObjectStorage(key, buffer, mimeType);

  const url = `/api/media/file/${key}`;
  return { url, key };
}

export async function uploadMediaWithThumbnail(
  base64Data: string,
  category: string,
  id: string | number
): Promise<{ url: string; thumbnailUrl: string; key: string; thumbnailKey: string }> {
  const { buffer, ext, mimeType } = parseBase64(base64Data);
  const timestamp = Date.now();
  const key = `public/media/${category}/${id}_${timestamp}.${ext}`;
  const thumbnailKey = `public/media/${category}/${id}_${timestamp}_thumb.webp`;

  const thumbBuffer = await sharp(buffer)
    .resize(300, 300, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  saveToLocal(key, buffer);
  saveToLocal(thumbnailKey, thumbBuffer);

  await Promise.all([
    saveToObjectStorage(key, buffer, mimeType),
    saveToObjectStorage(thumbnailKey, thumbBuffer, "image/webp"),
  ]);

  const url = `/api/media/file/${key}`;
  const thumbnailUrl = `/api/media/file/${thumbnailKey}`;
  return { url, thumbnailUrl, key, thumbnailKey };
}

export async function deleteMedia(key: string): Promise<void> {
  const fp = localPath(key);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  try {
    const bucket = getBucket();
    const file = bucket.file(key);
    const [exists] = await file.exists();
    if (exists) await file.delete();
  } catch {}
}

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
};

export async function streamMediaToResponse(key: string, res: any): Promise<void> {
  const fp = localPath(key);
  if (fs.existsSync(fp)) {
    const ext = path.extname(fp).toLowerCase();
    const stat = fs.statSync(fp);
    res.set({
      "Content-Type": MIME_MAP[ext] || "application/octet-stream",
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    fs.createReadStream(fp).pipe(res);
    return;
  }

  try {
    const bucket = getBucket();
    const file = bucket.file(key);
    const [exists] = await file.exists();
    if (!exists) {
      console.warn(`[media] File not found (local or object storage): ${key}`);
      res.status(404).json({ message: "File not found" });
      return;
    }

    const [metadata] = await file.getMetadata();
    res.set({
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Content-Length": String(metadata.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    });

    const stream = file.createReadStream();
    stream.on("error", (err: Error) => {
      console.error("Stream error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Error streaming file" });
    });
    stream.pipe(res);
  } catch (err: any) {
    console.warn(`[media] Object storage error for ${key}: ${err.message}`);
    res.status(404).json({ message: "File not found" });
  }
}
