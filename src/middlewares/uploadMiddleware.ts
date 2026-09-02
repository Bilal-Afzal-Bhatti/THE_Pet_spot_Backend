import multer from "multer";
import { AppError } from "../utils/AppError.js";

// Memory storage — files are held in RAM as a buffer, never touch disk.
// Required for Vercel serverless, which has no persistent/writable filesystem.
const storage = multer.memoryStorage();

const fileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new AppError("Only image files (JPEG, PNG, WEBP) are allowed!", 400) as any, false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size limit
  },
});