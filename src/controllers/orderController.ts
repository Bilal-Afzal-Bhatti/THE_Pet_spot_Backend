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

    let responsePayload: any;

    if (customerInfo.paymentMethod === "COD") {
      const order = await Order.create({
        petId,
        title,
        price,
        petImage,
        idempotencyKey,
        customerInfo,
        paymentStatus: "PENDING",
        orderStatus: "PROCESSING",
      });

      // COD orders are confirmed immediately, no webhook involved
      await sendOrderConfirmationEvent({ ...order.toObject(), _id: order._id.toString() });

      responsePayload = {
        success: true,
        message: "COD order placed successfully.",
        successUrl: `/orders/success?type=cod&petId=${petId}`,
      };
    } else {
      const stripeInstance = getStripe();
      const frontendUrl = process.env.CLIENT_URL || "https://the-pet-spot-pink.vercel.app";

      const session = await stripeInstance.checkout.sessions.create(
        {
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "inr",
                product_data: { name: title },
                unit_amount: Math.round(price * 100),
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${frontendUrl}/orders/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${frontendUrl}/pets/${petId}`,
          metadata: { petId, customerName: customerInfo.fullName },
        },
        { idempotencyKey: `stripe_${idempotencyKey}` }
      );

      // Create the order BEFORE redirecting to Stripe, in PENDING state.
      // The webhook will find and update this exact document by stripeSessionId
      // once payment completes — it no longer needs to (and can't) create it from scratch.
      await Order.create({
        petId,
        title,
        price,
        petImage,
        idempotencyKey,
        stripeSessionId: session.id,
        customerInfo,
        paymentStatus: "PENDING",
        orderStatus: "PROCESSING",
      });

      responsePayload = { success: true, url: session.url };
    }

    idempotencyCache.set(idempotencyKey, responsePayload);
    return res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error("Checkout Controller Error:", error.message);
    return res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
};