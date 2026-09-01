import { Router } from "express";
import { createCheckoutOrder } from "../controllers/orderController.js";

const router = Router();

router.post("/checkout", createCheckoutOrder);

export default router;