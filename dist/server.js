import dotenv from "dotenv";
dotenv.config();
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { initKafkaConsumer } from "./utils/kafka.js";
const PORT = Number(process.env.PORT) || 5000;
const startServer = async () => {
    try {
        await connectDB();
        // Connect consumer once MongoDB connects
        await initKafkaConsumer();
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error("❌ Server initialization error:", error);
        process.exit(1);
    }
};
startServer();
//# sourceMappingURL=server.js.map