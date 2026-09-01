import { Kafka } from "kafkajs";
import { sendEmail } from "./sendEmail.js";
const kafka = new Kafka({
    clientId: "petspot-backend",
    brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
});
let producer = null;
let consumer = null;
export const getKafkaProducer = async () => {
    if (!producer) {
        producer = kafka.producer();
        await producer.connect();
        console.log("🚀 Kafka Producer Connected");
    }
    return producer;
};
export const sendRegistrationEvent = async (userData) => {
    try {
        const p = await getKafkaProducer();
        await p.send({
            topic: "user-registered",
            messages: [
                {
                    key: userData.id,
                    value: JSON.stringify({
                        event: userData.type || "SEND_OTP",
                        timestamp: new Date().toISOString(),
                        data: userData,
                    }),
                },
            ],
        });
        console.log(`✉️ Published ${userData.type || "SEND_OTP"} event to Kafka for: ${userData.email}`);
    }
    catch (error) {
        console.error("⚠️ Kafka Producer Error, falling back to direct Nodemailer delivery:", error);
        await sendEmail({
            email: userData.email,
            subject: "Your PetSpot Verification Code",
            message: userData.otp,
        });
    }
};
export const initKafkaConsumer = async () => {
    try {
        consumer = kafka.consumer({ groupId: "petspot-email-group" });
        await consumer.connect();
        await consumer.subscribe({ topic: "user-registered", fromBeginning: false });
        console.log("📥 Kafka Consumer Connected & Listening on topic: user-registered");
        await consumer.run({
            eachMessage: async ({ message }) => {
                if (!message.value)
                    return;
                const payload = JSON.parse(message.value.toString());
                const { data } = payload;
                if (data?.email && data?.otp) {
                    console.log(`📨 Kafka Consumer processing email for: ${data.email}`);
                    await sendEmail({
                        email: data.email,
                        subject: "Your PetSpot Verification Code",
                        message: data.otp,
                    });
                    console.log(`✅ Email successfully sent to: ${data.email}`);
                }
            },
        });
    }
    catch (error) {
        console.error("❌ Kafka Consumer initialization failed:", error);
    }
};
//# sourceMappingURL=kafka.js.map