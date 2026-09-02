import { put } from "@vercel/blob";
import fs from "fs/promises";
import path from "path";

/**
 * Uploads a single file buffer.
 * - On Vercel (process.env.VERCEL is set): uploads to Vercel Blob, returns a full https URL.
 * - Locally: writes to the local /uploads folder, returns a relative "/uploads/xxx" path,
 *   served by your existing express.static("/uploads") route.
 */
export const uploadFile = async (
  file: Express.Multer.File,
  folder: string // e.g. "ads" or "avatars"
): Promise<string> => {
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = path.extname(file.originalname);
  const filename = `${file.fieldname}-${uniqueSuffix}${ext}`;

  if (process.env.VERCEL) {
    // Production / Preview on Vercel — disk is read-only, use Blob
    const blob = await put(`${folder}/${filename}`, file.buffer, {
      access: "public",
      contentType: file.mimetype,
    });
    return blob.url;
  } else {
    // Local development — write straight to disk, same as before
    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, filename), file.buffer);
    return `/uploads/${filename}`;
  }
};

export const uploadFiles = async (
  files: Express.Multer.File[],
  folder: string
): Promise<string[]> => {
  return Promise.all(files.map((file) => uploadFile(file, folder)));
};