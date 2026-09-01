import express, { type Application, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { AppError } from "./utils/AppError.js";
import { errorHandler } from "./middlewares/errorMiddleware.js";
import userRoutes from "./routes/userRoutes.js";
import userAdsRoutes from "./routes/userAdsRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import { handleStripeWebhook } from "./controllers/webhookController.js";
import petSlugRoutes from "./routes/petSlugRoutes.js";
const app: Application = express();

// 1. Security HTTP Headers (Configured to allow local uploads serving)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

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
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000"; // Default to localhost if not set

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"]
  })
);
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