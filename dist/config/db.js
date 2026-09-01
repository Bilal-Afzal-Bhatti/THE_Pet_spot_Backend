import mongoose from "mongoose";
export const connectDB = async () => {
    try {
        const connStr = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/PetSpot";
        console.log(`Attempting connection to: ${connStr}`);
        const conn = await mongoose.connect(connStr, {
            serverSelectionTimeoutMS: 5000, // Timeout fast after 5s instead of 10s
        });
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    }
    catch (error) {
        console.error("❌ MongoDB connection error:", error);
        process.exit(1);
    }
};
//# sourceMappingURL=db.js.map