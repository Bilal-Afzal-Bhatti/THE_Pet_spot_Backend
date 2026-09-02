import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']); // Forces Node to bypass local DNS blocks
} catch (e) {
  // Ignore DNS override errors in restricted serverless environments like Vercel
}

import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { connectDB } from "./config/db.js";
import { initKafkaConsumer } from "./utils/kafka.js";

const PORT = Number(process.env.PORT) || 5000;

// ==========================================
// PRODUCTION MODE (Vercel Serverless)
// ==========================================
if (process.env.NODE_ENV === "production") {
  // No connectDB() call needed here — app.ts now has middleware that
  // awaits connectDB() before every request, so the connection is
  // guaranteed before any route handler runs. This avoids the cold-start
  // race condition that caused the findOne() buffering timeout.

  // ⚠️ Note: initKafkaConsumer() is intentionally skipped here.
  // Vercel serverless functions kill background processes instantly.
  // If you need Kafka in production, it must be hosted on a persistent
  // server like Render, Railway, or AWS EC2.
}
// ==========================================
// LOCAL DEVELOPMENT MODE (npm run dev)
// ==========================================
else {
  const startServer = async () => {
    try {
      // 1. Connect to Database
      await connectDB();

      // 2. Connect Kafka consumer once MongoDB connects
      await initKafkaConsumer();

      // 3. Start local server listener
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log("Stripe Key Loaded:", process.env.STRIPE_SECRET_KEY ? "Yes" : "No");
      });
    } catch (error) {
      console.error("❌ Server initialization error:", error);
      process.exit(1);
    }
  };

  startServer();
}

// Export the Express app for Vercel's serverless routing
export default app;