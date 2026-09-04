// breedPublicRoutes.ts
import { Router } from "express";
import { getBreedBySlug } from "../controllers/breedPublicController.js";

const router = Router();
router.get("/:slug", getBreedBySlug);
export default router;