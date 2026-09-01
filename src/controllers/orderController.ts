import type  { Request, Response } from "express";
import Stripe from "stripe";

// Helper function to get initialized Stripe instance safely
const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is missing from environment variables.");
  }
  return new (Stripe as any)(secretKey, {
    apiVersion: '2023-10-16', // Use a stable version string
  });
};
// Idempotency cache storage (Use Redis in production)
const idempotencyCache = new Map<string, any>();

interface CheckoutRequestBody {
  petId: string;
  title: string;
  price: number;
  customerInfo: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
    paymentMethod: "ONLINE" | "COD";
  };
}

export const createCheckoutOrder = async (req: Request<{}, {}, CheckoutRequestBody>, res: Response): Promise<any> => {
  try {
    const idempotencyKey = req.headers["idempotency-key"] as string;

    if (!idempotencyKey) {
      return res.status(400).json({ success: false, message: "Missing Idempotency-Key header." });
    }

    if (idempotencyCache.has(idempotencyKey)) {
      console.log(`[Idempotent Replay] Returning cached response for key: ${idempotencyKey}`);
      return res.status(200).json(idempotencyCache.get(idempotencyKey));
    }

    const { petId, title, price, customerInfo } = req.body;

    if (!petId || !price || !customerInfo) {
      return res.status(400).json({ success: false, message: "Invalid payload details." });
    }

    let responsePayload: any;

    if (customerInfo.paymentMethod === "COD") {
      responsePayload = {
        success: true,
        message: "COD order placed successfully.",
        successUrl: `/orders/success?type=cod&petId=${petId}`,
      };
    } else {
      const stripeInstance = getStripe();
      const session = await stripeInstance.checkout.sessions.create(
        {
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "inr",
                product_data: { name: title },
                unit_amount: price * 100, // Stripe expects subunit values
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${process.env.FRONTEND_URL}/orders/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.FRONTEND_URL}/pets/${petId}`,
          metadata: { petId, customerName: customerInfo.fullName },
        },
        {
          idempotencyKey: `stripe_${idempotencyKey}`,
        }
      );

      responsePayload = {
        success: true,
        url: session.url,
      };
    }

    idempotencyCache.set(idempotencyKey, responsePayload);

    return res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error("Checkout Controller Error:", error.message);
    return res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
};