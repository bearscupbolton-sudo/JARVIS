import { objectStorageClient } from "./replit_integrations/object_storage";
import sharp from "sharp";

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || "";
const MAX_FILE_SIZE = 15 * 1024 * 1024;

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

export async function uploadMedia(
  base64Data: string,
  category: string,
  id: string | number
): Promise<{ url: string; key: string }> {
  const { buffer, ext, mimeType } = parseBase64(base64Data);
  const timestamp = Date.now();
  const key = `public/media/${category}/${id}_${timestamp}.${ext}`;

  const bucket = getBucket();
  const file = bucket.file(key);
  await file.save(buffer, { contentType: mimeType, resumable: false });

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

  const bucket = getBucket();

  const thumbBuffer = await sharp(buffer)
    .resize(300, 300, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const file = bucket.file(key);
  const thumbFile = bucket.file(thumbnailKey);

  await Promise.all([
    file.save(buffer, { contentType: mimeType, resumable: false }),
    thumbFile.save(thumbBuffer, { contentType: "image/webp", resumable: false }),
  ]);

  const url = `/api/media/file/${key}`;
  const thumbnailUrl = `/api/media/file/${thumbnailKey}`;
  return { url, thumbnailUrl, key, thumbnailKey };
}

export async function deleteMedia(key: string): Promise<void> {
  const bucket = getBucket();
  const file = bucket.file(key);
  const [exists] = await file.exists();
  if (exists) await file.delete();
}

export async function streamMediaToResponse(key: string, res: any): Promise<void> {
  const bucket = getBucket();
  const file = bucket.file(key);
  const [exists] = await file.exists();
  if (!exists) {
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
}
