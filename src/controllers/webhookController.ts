import  type { Request, Response } from "express";
import Stripe from "stripe";
import { Order } from "../models/orderModel.js";

// Lazy-load Stripe instance to ensure env vars are loaded
const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is missing from environment variables.");
  }
  return new (Stripe as any)(secretKey, {
    apiVersion: "2026-02-25.acacia" as any,
  });
};

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

// Idempotency tracking cache set (or Redis in large-scale multi-instance production environments)
const processedEventIds = new Set<string>();

export const handleStripeWebhook = async (req: Request, res: Response): Promise<any> => {
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).send("Webhook Error: Missing Stripe signature header.");
  }

  let event: Stripe.Event;

  try {
    // [CORE METHOD] Construct and verify the event securely using the raw request body buffer
    event = getStripe().webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // [IDEMPOTENCY GUARD] Prevent duplicate event handling if Stripe retries
  if (processedEventIds.has(event.id)) {
    console.log(`[Idempotent Skip] Event ID ${event.id} was already processed.`);
    return res.status(200).json({ received: true, status: "already_processed" });
  }

  processedEventIds.add(event.id);

  // Handle specific event types securely
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const petId = session.metadata?.petId;

      console.log(`✅ Payment successful for Checkout Session: ${session.id}`);

      if (petId) {
        // Update order and payment status in database transaction safely
        await Order.findOneAndUpdate(
          { petId, idempotencyKey: session.id },
          { paymentStatus: "PAID", orderStatus: "COMPLETED" },
          { upsert: true, new: true }
        );
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`❌ Payment failed for Payment Intent: ${paymentIntent.id}`);
      
      await Order.findOneAndUpdate(
        { "customerInfo": { $exists: true } },
        { paymentStatus: "FAILED" }
      );
      break;
    }

    default:
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }

  // Acknowledge receipt back to Stripe successfully
  return res.status(200).json({ received: true });
};