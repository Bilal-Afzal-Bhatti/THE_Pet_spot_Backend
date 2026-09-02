import type { Request, Response } from "express";
import Stripe from "stripe";
import { Order } from "../models/orderModel.js";
import { sendOrderConfirmationEvent } from "../utils/kafka.js";

const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is missing from environment variables.");
  return new (Stripe as any)(secretKey, { apiVersion: "2023-10-16" });
};

export const handleStripeWebhook = async (req: Request, res: Response): Promise<any> => {
  const stripeInstance = getStripe();
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    event = stripeInstance.webhooks.constructEvent(req.body, sig!, endpointSecret!);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    try {
      const updatedOrder = await Order.findOneAndUpdate(
        { stripeSessionId: session.id },
        {
          paymentStatus: "PAID",
          orderStatus: "CONFIRMED",
        },
        { new: true }
      );

      if (updatedOrder) {
        console.log(`✅ [Webhook] Order ${updatedOrder.orderId} successfully marked as PAID.`);
        // Send the confirmation email now that payment is actually confirmed
        await sendOrderConfirmationEvent({
          ...updatedOrder.toObject(),
          _id: updatedOrder._id.toString(),
        });
      } else {
        console.warn(`⚠️ [Webhook] No order found for Stripe Session ID: ${session.id}`);
      }
    } catch (dbError: any) {
      console.error("Database update error on webhook:", dbError.message);
      return res.status(500).json({ error: "Database update failed" });
    }
  }

  return res.status(200).json({ received: true });
};