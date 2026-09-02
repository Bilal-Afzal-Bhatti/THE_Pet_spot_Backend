import express, { type Application, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
// import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import path from "path";
import { AppError } from "./utils/AppError.js";
import { errorHandler } from "./middlewares/errorMiddleware.js";
import userRoutes from "./routes/userRoutes.js";
import userAdsRoutes from "./routes/userAdsRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import { handleStripeWebhook } from "./controllers/webhookController.js";
import petSlugRoutes from "./routes/petSlugRoutes.js";
import mongoose from "mongoose";
const app: Application = express();

// // 1. Security HTTP Headers (Configured to allow local uploads serving)
// app.use(
//   helmet({
//     crossOriginResourcePolicy: { policy: "cross-origin" },
//     crossOriginEmbedderPolicy: false,
//   })
// );
// 5.5. Root welcome route
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "Success",
    message: "Welcome to ThePetSpot API Server!",
  });
});
// 2. HTTP Request Logger
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// 3. Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests from this IP, please try again later." },
});
app.use("/api", limiter);

// 4. CORS & Cookie Parsing
// ==========================================
// 1. CORS Configuration for ThePetSpot
// ==========================================
const allowedOrigins = [
  "http://localhost:3000",                    // Next.js Local Frontend
  "http://localhost:3001",                    // Local Admin Panel (if applicable)
  "http://localhost:5000",                    // Local Backend fallback
  "https://the-pet-spot-pink.vercel.app",     // Production Frontend (ThePetSpot)
  "https://the-pet-spot-backend.vercel.app",  // Production Backend
  "http://192.168.18.40:3000",                // Local Network Frontend IP access
  "http://192.168.18.40:5000",                // Local Network Backend IP access
];

const corsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    // 1. Allow requests with no origin (like mobile apps, curl, or Postman)
    if (!origin) return callback(null, true);

    // 2. Check if origin is in our whitelist OR is a Vercel preview branch (e.g. *-git-*.vercel.app)
    const isAllowed = allowedOrigins.includes(origin) || origin.endsWith(".vercel.app");

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error("CORS Policy: Access Denied"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Idempotency-Key"],
  credentials: true, // Required for cookies, sessions, and authentication tokens
  maxAge: 86400,     // Cache preflight response for 24 hours (Performance optimization)
};

// Apply CORS to your Express app
app.use(cors(corsOptions));


// ==========================================
// 2. MongoDB Connection (Serverless Safe)
// ==========================================
let cached = (globalThis as any).mongoose;

if (!cached) {
  cached = (globalThis as any).mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in environment variables");
    }

    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      bufferCommands: false,         // Disables Mongoose command buffering for serverless timeouts
      connectTimeoutMS: 30000,      // Connection timeout threshold
    }).then((mongooseInstance) => mongooseInstance);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

// Static Uploads Folder (Using process.cwd() for safe ES module resolution)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// 5. API Routes
app.use("/api/users", userRoutes);
app.use("/api/ads", userAdsRoutes);
app.use("/api/orders", orderRoutes);

app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);
app.use("/api/pets", petSlugRoutes);
// 6. Health Check Route
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "OK", message: "Server is healthy" });
});

// 7. Catch-all Unhandled Routes (Express 5 wildcard syntax)
app.all("{*path}", (req, _res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// 8. Global Centralized Error Handler
app.use(errorHandler);

export default app;