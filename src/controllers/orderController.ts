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
      try {
        const order: any = await Order.create({
          petId,
          title,
          price,
          petImage: petImage || "",
          idempotencyKey,
          customerInfo,
          paymentStatus: "PENDING",
          orderStatus: "CONFIRMED", // COD orders are accepted immediately
        });

        // Send email/Kafka event and update emailSent flag in DB
        if (!order.emailSent) {
          await sendOrderConfirmationEvent({
            ...order.toObject(),
            _id: order._id.toString(),
          });
          await Order.findByIdAndUpdate(order._id, { emailSent: true });
        }

        responsePayload = {
          success: true,
          message: "COD order placed successfully.",
          orderId: order.orderId,
          successUrl: `/orders/success?type=cod&orderId=${order.orderId}&petId=${petId}`,
        };
      } catch (dbError: any) {
        if (dbError.code === 11000) {
          const existingOrder = await Order.findOne({ idempotencyKey });
          if (existingOrder) {
            responsePayload = {
              success: true,
              message: "COD order already placed.",
              orderId: existingOrder.orderId,
              successUrl: `/orders/success?type=cod&orderId=${existingOrder.orderId}&petId=${petId}`,
            };
            idempotencyCache.set(idempotencyKey, responsePayload);
            return res.status(200).json(responsePayload);
          }
        }
        throw dbError;
      }
    } else {
      const stripeInstance = getStripe();
      const frontendUrl = process.env.CLIENT_URL || "https://the-pet-spot-pink.vercel.app";

      if (!customerInfo?.email) {
        return res.status(400).json({ success: false, message: "Customer email is required for online payment." });
      }

      let tempOrder;
      try {
        tempOrder = await Order.create({
          petId,
          title,
          price,
          petImage: petImage || "",
          idempotencyKey,
          customerInfo,
          paymentStatus: "PENDING",
          orderStatus: "PROCESSING",
        });
      } catch (dbError: any) {
        if (dbError.code === 11000) {
          const existingOrder = await Order.findOne({ idempotencyKey });
          if (existingOrder) {
            responsePayload = { success: true, orderId: existingOrder.orderId };
            idempotencyCache.set(idempotencyKey, responsePayload);
            return res.status(200).json(responsePayload);
          }
        }
        throw dbError;
      }

      // Create Stripe Checkout Session
      const session = await stripeInstance.checkout.sessions.create(
        {
          payment_method_types: ["card"],
          customer_email: customerInfo.email,
          shipping_address_collection: {
            allowed_countries: ["PK", "IN", "US", "GB", "CA"],
          },
          line_items: [
            {
              price_data: {
                currency: "inr",
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
          success_url: `${frontendUrl}/orders/success?session_id={CHECKOUT_SESSION_ID}&orderId=${tempOrder.orderId}`,
          cancel_url: `${frontendUrl}/pets/${petId}`,
          metadata: { petId, orderId: tempOrder.orderId, customerName: customerInfo.fullName },
        },
        { idempotencyKey: `stripe_${idempotencyKey}` }
      );

      tempOrder.stripeSessionId = session.id;
      await tempOrder.save();

      responsePayload = { success: true, url: session.url, orderId: tempOrder.orderId };
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
    const session = await stripeInstance.checkout.sessions.retrieve(session_id as string);

    if (session.payment_status === "paid") {
      const orderFilter: any = {
        $or: [
          { stripeSessionId: session.id },
          ...(typeof orderId === "string" ? [{ orderId }] : []),
        ],
        paymentStatus: { $ne: "PAID" },
      };

      const updatedOrder = await Order.findOneAndUpdate(
        orderFilter,
        { paymentStatus: "PAID", orderStatus: "CONFIRMED" },
        { new: true }
      );

      if (updatedOrder) {
        console.log(`✅ [Instant Verify API] Order ${updatedOrder.orderId} successfully marked as PAID.`);

        if (!updatedOrder.emailSent) {
          await sendOrderConfirmationEvent({
            ...updatedOrder.toObject(),
            _id: updatedOrder._id.toString(),
          });
          await Order.findByIdAndUpdate(updatedOrder._id, { emailSent: true });
        }

        return res.status(200).json({
          success: true,
          message: "Payment verified and order status updated successfully.",
          order: updatedOrder,
        });
      } else {
        const alreadyPaidOrder = await Order.findOne({
          $or: [
            { stripeSessionId: session.id },
            ...(typeof orderId === "string" ? [{ orderId }] : []),
          ],
        });

        if (alreadyPaidOrder && alreadyPaidOrder.paymentStatus === "PAID") {
          return res.status(200).json({
            success: true,
            message: "Payment already verified previously.",
            order: alreadyPaidOrder,
          });
        }

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