import { Router } from "express";
import { handleStripeWebhook } from "../controllers/webhookController.js";

const router = Router();

// Matches POST /api/webhooks/stripe
router.post("/stripe", handleStripeWebhook);

export default router;