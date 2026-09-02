import { Kafka, type Producer, type Consumer } from "kafkajs";
import sendEmail from "./sendEmail.js";

const kafka = new Kafka({
  clientId: "petspot-backend",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
});

let producer: Producer | null = null;
let consumer: Consumer | null = null;

const ORDER_TOPIC = "order-confirmed";
const OTP_TOPIC = "user-registered";

const ensureTopicExists = async (topicName: string) => {
  const admin = kafka.admin();
  try {
    await admin.connect();
    const topics = await admin.listTopics();
    if (!topics.includes(topicName)) {
      console.log(`🔨 Topic "${topicName}" does not exist. Creating...`);
      await admin.createTopics({
        topics: [{ topic: topicName, numPartitions: 1, replicationFactor: 1 }],
      });
      console.log(`✅ Topic "${topicName}" created.`);
    }
  } catch (err) {
    console.warn("⚠️ Admin creation check failed, proceeding anyway:", err);
  } finally {
    await admin.disconnect();
  }
};

export const getKafkaProducer = async (): Promise<Producer> => {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
    console.log("🚀 Kafka Producer Connected");
  }
  return producer;
};

export type OtpEventType = "SEND_OTP" | "FORGOT_PASSWORD_OTP" | "USER_REGISTERED";

export interface OtpEventData {
  id: string;
  email: string;
  otp: string;
  name?: string;
  type?: OtpEventType;
  isPetParent?: string;
}

export const sendOtpEvent = async (userData: OtpEventData) => {
  const eventType = userData.type || "SEND_OTP";
  const subject =
    eventType === "FORGOT_PASSWORD_OTP" ? "PetSpot - Password Reset OTP" : "Your PetSpot Verification Code";

  try {
    const p = await getKafkaProducer();
    await p.send({
      topic: OTP_TOPIC,
      messages: [
        {
          key: userData.id,
          value: JSON.stringify({
            event: eventType,
            subject,
            timestamp: new Date().toISOString(),
            data: userData,
          }),
        },
      ],
    });
    console.log(`✉️ Published ${eventType} event to Kafka for: ${userData.email}`);
  } catch (error) {
    console.error("⚠️ Kafka Producer Error, falling back to direct Nodemailer delivery:", error);
    await sendEmail({ email: userData.email, subject, message: userData.otp });
  }
};

export const sendRegistrationEvent = sendOtpEvent;

// ==========================================
// Order confirmation email (new)
// ==========================================
export interface OrderConfirmationData {
  _id: string;
  petId: string;
  title: string;
  price: number;
  petImage?: string;
  customerInfo: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
  };
}

const buildOrderEmailHtml = (order: OrderConfirmationData): string => `
  <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
    <h2 style="color: #ea580c;">Thank you for your purchase, ${order.customerInfo.fullName}!</h2>
    <p>Here are your order details:</p>
    ${
      order.petImage
        ? `<img src="${order.petImage}" alt="${order.title}" style="width:100%; max-width:400px; border-radius:12px; margin: 12px 0;" />`
        : ""
    }
    <table style="width:100%; border-collapse: collapse; margin-top: 12px;">
      <tr><td style="padding:6px 0;"><strong>Pet:</strong></td><td>${order.title}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Price:</strong></td><td>PKR ${order.price}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Order ID:</strong></td><td>${order._id}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Delivery to:</strong></td><td>${order.customerInfo.address}, ${order.customerInfo.city}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Contact:</strong></td><td>${order.customerInfo.phone}</td></tr>
    </table>
    <p style="margin-top:20px; color:#666;">We'll be in touch with next steps shortly. Thanks for choosing PetSpot!</p>
  </div>
`;

export const sendOrderConfirmationEvent = async (order: OrderConfirmationData) => {
  const subject = `Your PetSpot Order Confirmation — ${order.title}`;

  try {
    const p = await getKafkaProducer();
    await p.send({
      topic: ORDER_TOPIC,
      messages: [
        {
          key: order._id,
          value: JSON.stringify({
            event: "ORDER_CONFIRMED",
            subject,
            timestamp: new Date().toISOString(),
            data: order,
          }),
        },
      ],
    });
    console.log(`📦 Published order confirmation event to Kafka for: ${order.customerInfo.email}`);
  } catch (error) {
    console.error("⚠️ Kafka Producer Error, falling back to direct Nodemailer delivery:", error);
    await sendEmail({
      email: order.customerInfo.email,
      subject,
      message: buildOrderEmailHtml(order),
    });
  }
};

export const initKafkaConsumer = async () => {
  try {
    await ensureTopicExists(OTP_TOPIC);
    await ensureTopicExists(ORDER_TOPIC);

    consumer = kafka.consumer({ groupId: "petspot-email-group-v1" });
    await consumer.connect();

    await consumer.subscribe({ topics: [OTP_TOPIC, ORDER_TOPIC], fromBeginning: false });

    console.log(`📥 Kafka Consumer Connected & Listening on topics: ${OTP_TOPIC}, ${ORDER_TOPIC}`);

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        const payload = JSON.parse(message.value.toString());
        const { data, subject, event } = payload;

        if (topic === OTP_TOPIC && data?.email && data?.otp) {
          console.log(`📨 Kafka Consumer processing OTP email for: ${data.email}`);
          await sendEmail({ email: data.email, subject: subject || "Your PetSpot Verification Code", message: data.otp });
          console.log(`✅ Email successfully sent to: ${data.email}`);
        }

        if (topic === ORDER_TOPIC && event === "ORDER_CONFIRMED" && data?.customerInfo?.email) {
          console.log(`📨 Kafka Consumer processing order confirmation for: ${data.customerInfo.email}`);
          await sendEmail({ email: data.customerInfo.email, subject, message: buildOrderEmailHtml(data) });
          console.log(`✅ Order confirmation email sent to: ${data.customerInfo.email}`);
        }
      },
    });
  } catch (error) {
    console.error("❌ Kafka Consumer initialization failed:", error);
  }
};