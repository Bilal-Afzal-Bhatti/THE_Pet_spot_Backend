import { Router } from "express";
import { upload } from "../middlewares/uploadMiddleware.js";
import {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyOtp,
} from "../controllers/userController.js";
import { authMiddleware as protect } from "../middlewares/authMiddleware.js";

const router = Router();

// Public Routes
router.post("/register", register);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);
router.get("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Protected Routes
router.get("/me", protect, getMe);
router.patch("/profile", protect, upload.single("avatar"), updateProfile);
router.patch("/change-password", protect, changePassword);

export default router;