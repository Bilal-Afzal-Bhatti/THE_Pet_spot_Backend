import mongoose from "mongoose";

// ==========================================
// MongoDB Connection (Serverless Safe)
// ==========================================
// Uses globalThis instead of a plain module-level variable because Vercel's
// serverless runtime can reuse the same module instance across invocations
// in ways that make a simple `let` unreliable — globalThis survives more
// consistently across warm starts.

let cached = (globalThis as any).mongoose;

if (!cached) {
  cached = (globalThis as any).mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in environment variables");
    }

    cached.promise = mongoose
      .connect(process.env.MONGO_URI, {
        bufferCommands: false,     // Disable Mongoose command buffering for serverless timeouts
        connectTimeoutMS: 30000,   // Connection timeout threshold
      })
      .then((mongooseInstance) => {
        console.log("MongoDB Connected Successfully");
        return mongooseInstance;
      })
      .catch((err) => {
        // Reset the cached promise on failure so the NEXT request retries
        // the connection instead of being permanently stuck on a rejected promise.
        console.error("MongoDB Connection Error:", err);
        cached.promise = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}