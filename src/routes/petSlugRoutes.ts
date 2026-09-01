import { Router } from "express";
import { getPetBySlug } from "../controllers/petSlugController.js";

const router = Router();

// GET request for individual pet dynamic page
router.get("/:slug", getPetBySlug);

export default router;