import multer from "multer";
import path from "path";
import { AppError } from "../utils/AppError.js";

// 1. Storage engine configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Files will be stored in 'backend/uploads'
    cb(null, "uploads/");
  },
  filename: (_req, file, cb) => {
    // Generates: avatar-1724845200000-123456789.png
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// 2. File type validation filter
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

// 3. Export configured Multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size limit
  },
});