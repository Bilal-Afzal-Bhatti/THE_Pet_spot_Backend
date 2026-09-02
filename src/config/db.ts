import mongoose from "mongoose";

let cachedDb: typeof mongoose | null = null;

export const connectDB = async () => {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI as string, {
      bufferCommands: false, // Disable Mongoose buffering
    });
    cachedDb = conn;
    console.log("MongoDB Connected Successfully");
    return cachedDb;
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
    throw error;
  }
};