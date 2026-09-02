import { Router } from "express";
import { createCheckoutOrder, verifyAndCompleteOrder } from "../controllers/orderController.js";

const router = Router();

router.post("/checkout", createCheckoutOrder);
// In your order routes file (e.g., orderRoutes.ts)
router.get("/verify-payment", verifyAndCompleteOrder);
export default router;