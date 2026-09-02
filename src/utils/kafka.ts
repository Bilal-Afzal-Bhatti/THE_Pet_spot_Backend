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
  orderId: string; // <-- Added custom orderId field
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
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 400px; margin: 0 auto; padding: 14px; color: #e5e7eb; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 10px;">
    
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 8px; margin-bottom: 10px;">
      <span style="font-size: 13px; font-weight: 700; color: #38bdf8; letter-spacing: 0.5px;">PetSpot</span>
      <span style="font-size: 10px; font-weight: 600; background: #064e3b; color: #34d399; padding: 2px 6px; border-radius: 99px;">Confirmed</span>
    </div>

    <!-- Main Text -->
    <p style="font-size: 12px; color: #94a3b8; margin: 0 0 10px 0;">
      Thanks, <strong style="color: #f8fafc;">${order.customerInfo.fullName}</strong>! Your order has been placed successfully.
    </p>

    <!-- Compact Thumbnail & Info Row -->
    <div style="display: flex; gap: 10px; background: #1e293b; padding: 8px; border-radius: 6px; margin-bottom: 10px; align-items: center;">
      ${
        order.petImage
          ? `<img src="${order.petImage}" alt="${order.title}" style="width: 42px; height: 42px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" />`
          : ""
      }
      <div style="font-size: 12px; overflow: hidden; width: 100%;">
        <div style="font-weight: 600; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${order.title}</div>
        <div style="font-weight: 700; color: #38bdf8; font-size: 12px; margin-top: 1px;">PKR ${order.price}</div>
      </div>
    </div>

    <!-- Details Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; color: #94a3b8;">
      <tr>
        <td style="padding: 3px 0; color: #64748b;">Order ID</td>
        <td style="text-align: right; font-family: monospace; color: #cbd5e1; font-weight: 600;">${order.orderId }</td>
      </tr>
      <tr>
        <td style="padding: 3px 0; color: #64748b;">Delivery</td>
        <td style="text-align: right; color: #cbd5e1;">${order.customerInfo.address}, ${order.customerInfo.city}</td>
      </tr>
      <tr>
        <td style="padding: 3px 0; color: #64748b;">Phone</td>
        <td style="text-align: right; color: #cbd5e1;">${order.customerInfo.phone}</td>
      </tr>
    </table>

    <!-- Footer -->
    <div style="border-top: 1px solid #1e293b; text-align: center; font-size: 10px; color: #64748b; padding-top: 8px;">
      Need help? Reply directly to this email.<br/>
      &copy; ${new Date().getFullYear()} PetSpot. All rights reserved.
    </div>
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
  } catch (error: any) {
    console.error("⚠️ Kafka Producer Error, falling back to direct Nodemailer delivery:", error.message || error);
    try {
      await sendEmail({
        email: order.customerInfo.email,
        subject,
        message: buildOrderEmailHtml(order),
      });
      console.log(`📧 Fallback Nodemailer successfully sent email to: ${order.customerInfo.email}`);
    } catch (emailError: any) {
      console.error("❌ Critical: Fallback Nodemailer also failed to send email:", emailError.message || emailError);
    }
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