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
import { connectDB } from "./config/db.js";

const app: Application = express();

// 0. Trust Vercel's proxy — MUST be set before rate limiting, since
// express-rate-limit reads X-Forwarded-For and throws a ValidationError
// if Express doesn't know it's behind a proxy. This fixes the cats/dogs 500s.
app.set("trust proxy", 1);

// // 1. Security HTTP Headers (Configured to allow local uploads serving)
// app.use(
//   helmet({
//     crossOriginResourcePolicy: { policy: "cross-origin" },
//     crossOriginEmbedderPolicy: false,
//   })
// );

// Health check — placed before the DB gate so it responds even if Mongo is down
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "OK", message: "Server is healthy" });
});
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

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
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5000",
  "https://the-pet-spot-pink.vercel.app",
  "https://the-pet-spot-backend.vercel.app",
  "http://192.168.18.40:3000",
  "http://192.168.18.40:5000",
];

const corsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.includes(origin) || origin.endsWith(".vercel.app");
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error("CORS Policy: Access Denied"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Idempotency-Key"],
  credentials: true,
  maxAge: 86400,
};

app.use(cors(corsOptions));

// Gate every request below this point on a live DB connection.
// This was missing before — connectDB() was defined but never called
// from within app.ts, so routes could run before Mongoose had connected,
// causing the findOne() buffering timeout.
app.use(async (_req: Request, res: Response, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("DB connection error:", err);
    res.status(503).json({ message: "Database unavailable, please try again shortly" });
  }
});

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

// Static Uploads Folder
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

// 7. Catch-all Unhandled Routes (Express 5 wildcard syntax)
app.all("{*path}", (req, _res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// 8. Global Centralized Error Handler
app.use(errorHandler);

export default app;