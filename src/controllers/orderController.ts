import type { Request, Response } from "express";
import Stripe from "stripe";
import { Order } from "../models/orderModel.js";
import { sendOrderConfirmationEvent } from "../utils/kafka.js";

const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is missing from environment variables.");
  return new (Stripe as any)(secretKey, { apiVersion: "2023-10-16" });
};

const idempotencyCache = new Map<string, any>();

// ✅ Unique Order ID generator combining timestamp and Math.random
const generateUniqueOrderId = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${timestamp}-${randomStr}`;
};

interface CheckoutRequestBody {
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
    postalCode: string;
    paymentMethod: "ONLINE" | "COD";
  };
}

export const createCheckoutOrder = async (
  req: Request<{}, {}, CheckoutRequestBody>,
  res: Response
): Promise<any> => {
  try {
    const idempotencyKey = req.headers["idempotency-key"] as string;
    if (!idempotencyKey) {
      return res.status(400).json({ success: false, message: "Missing Idempotency-Key header." });
    }

    if (idempotencyCache.has(idempotencyKey)) {
      return res.status(200).json(idempotencyCache.get(idempotencyKey));
    }

    const { petId, title, price, petImage, customerInfo } = req.body;
    if (!petId || !price || !customerInfo) {
      return res.status(400).json({ success: false, message: "Invalid payload details." });
    }

    // ✅ Generate order ID upfront to guarantee it's never null
    const orderId = generateUniqueOrderId();
    if (!orderId) {
      return res.status(500).json({ success: false, message: "Failed to generate order ID." });
    }

    let responsePayload: any;

    if (customerInfo.paymentMethod === "COD") {
      const order = await Order.create({
        orderId,
        petId,
        title,
        price,
        petImage: petImage || "",
        idempotencyKey,
        customerInfo,
        paymentStatus: "PENDING",
        orderStatus: "PROCESSING",
      });

      await sendOrderConfirmationEvent({ ...order.toObject(), _id: order._id.toString() });

      responsePayload = {
        success: true,
        message: "COD order placed successfully.",
        orderId,
        successUrl: `/orders/success?type=cod&orderId=${orderId}&petId=${petId}`,
      };
    } else {
      const stripeInstance = getStripe();
      const frontendUrl = process.env.CLIENT_URL || "https://the-pet-spot-pink.vercel.app";

      if (!customerInfo?.email) {
        return res.status(400).json({ success: false, message: "Customer email is required for online payment." });
      }

      // Create Stripe Checkout Session
      const session = await stripeInstance.checkout.sessions.create(
        {
          payment_method_types: ["card"],
          customer_email: customerInfo.email,
          billing_address_collection: "required",
          line_items: [
            {
              price_data: {
                currency: "inr", // Update if using a different currency
                product_data: { 
                  name: title,
                  images: petImage ? [petImage] : [],
                },
                unit_amount: Math.round(price * 100),
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${frontendUrl}/orders/success?session_id={CHECKOUT_SESSION_ID}&orderId=${orderId}`,
          cancel_url: `${frontendUrl}/pets/${petId}`,
          metadata: { petId, orderId, customerName: customerInfo.fullName },
        },
        { idempotencyKey: `stripe_${idempotencyKey}` }
      );

      // Save order to database with the generated orderId
      await Order.create({
        orderId,
        petId,
        title,
        price,
        petImage: petImage || "",
        idempotencyKey,
        stripeSessionId: session.id,
        customerInfo,
        paymentStatus: "PENDING",
        orderStatus: "PROCESSING",
      });

      responsePayload = { success: true, url: session.url, orderId };
    }

    idempotencyCache.set(idempotencyKey, responsePayload);
    return res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error("Checkout Controller Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
};
export const verifyAndCompleteOrder = async (req: Request, res: Response): Promise<any> => {
  try {
    const { session_id, orderId } = req.query;

    if (!session_id) {
      return res.status(400).json({ success: false, message: "Missing session_id" });
    }

    const stripeInstance = getStripe();
    
    // Retrieve the checkout session from Stripe directly
    const session = await stripeInstance.checkout.sessions.retrieve(session_id as string);

    if (session.payment_status === "paid") {
      // Find and update order status to PAID
      const updatedOrder = await Order.findOneAndUpdate(
        { $or: [{ stripeSessionId: session.id }, { orderId }] },
        { 
          paymentStatus: "PAID", 
          orderStatus: "CONFIRMED" 
        },
        { new: true }
      );

      if (updatedOrder) {
        console.log(`✅ [Instant Verify API] Order ${updatedOrder.orderId} successfully marked as PAID.`);
        return res.status(200).json({ 
          success: true, 
          message: "Payment verified and order status updated successfully.", 
          order: updatedOrder 
        });
      } else {
        console.warn(`⚠️ [Instant Verify API] Session is paid on Stripe, but order not found in DB for session: ${session.id}`);
        return res.status(404).json({ success: false, message: "Order record not found in database." });
      }
    } else {
      return res.status(400).json({ success: false, message: "Payment has not been completed yet." });
    }
  } catch (error: any) {
    console.error("Error verifying payment session:", error.message);
    return res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
};