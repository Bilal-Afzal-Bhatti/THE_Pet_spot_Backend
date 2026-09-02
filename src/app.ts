import express, { type Application, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
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

app.set("trust proxy", 1);

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "OK", message: "Server is healthy" });
});

// Stripe webhook — must stay before express.json() (needs raw body for
// signature verification). Its own connectDB() call is inside the
// controller now, since it can't rely on the shared DB-gate middleware below.
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "Success",
    message: "Welcome to ThePetSpot API Server!",
  });
});

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests from this IP, please try again later." },
});
app.use("/api", limiter);

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

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/users", userRoutes);
app.use("/api/ads", userAdsRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/pets", petSlugRoutes);

app.all("{*path}", (req, _res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(errorHandler);

export default app;