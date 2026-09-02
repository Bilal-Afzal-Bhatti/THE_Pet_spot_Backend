import type { Request, Response } from "express";
import Stripe from "stripe";
import { Order } from "../models/orderModel.js";
import { sendOrderConfirmationEvent } from "../utils/kafka.js";

const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is missing from environment variables.");
  return new (Stripe as any)(secretKey, { apiVersion: "2026-02-25.acacia" as any });
};

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;
const processedEventIds = new Set<string>();

export const handleStripeWebhook = async (req: Request, res: Response): Promise<any> => {
  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).send("Webhook Error: Missing Stripe signature header.");
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (processedEventIds.has(event.id)) {
    return res.status(200).json({ received: true, status: "already_processed" });
  }
  processedEventIds.add(event.id);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`✅ Payment successful for Checkout Session: ${session.id}`);

      const order = await Order.findOneAndUpdate(
        { stripeSessionId: session.id },
        { paymentStatus: "PAID", orderStatus: "COMPLETED" },
        { new: true }
      );

      if (order) {
        await sendOrderConfirmationEvent({ ...order.toObject(), _id: order._id.toString() });
      } else {
        // This means createCheckoutOrder didn't create the pending order first —
        // check that flow if this ever logs.
        console.warn(`⚠️ No matching order found for Stripe session ${session.id}`);
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`❌ Payment failed for Payment Intent: ${paymentIntent.id}`);
      // Note: matching this back to a specific order reliably requires storing
      // the payment_intent ID too. For standard Checkout card payments, failures
      // are usually handled client-side before redirect, so this event is rare —
      // safe to leave as a log-only fallback unless you see it firing in practice.
      break;
    }

    default:
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }

  return res.status(200).json({ received: true });
};