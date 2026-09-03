import { Router, type Response, type NextFunction, type RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { upload } from "../middlewares/uploadMiddleware.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import AdminModel from "../models/adminModel.js";
import { User } from "../models/userModel.js";
import {
  adminLogin,
  getAdminMe,
  adminLogout,
  getAdminDashboardStats,
  getAdminBreeds,
  getAdminBreedById,
  createAdminBreed,
  updateAdminBreed,
  deleteAdminBreed,
  getAdminBlogs,
  getAdminBlogById,
  createAdminBlog,
  updateAdminBlog,
  deleteAdminBlog,
  getAdminAds,
  getAdminAdById,
  updateAdminAdStatus,
  deleteAdminAd,
  getAdminProducts,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  getAdminUsers,
  getAdminUserById,
  type AuthenticatedAdminRequest,
} from "../controllers/adminController.js";

const router = Router();

/**
 * Middleware: Verify Admin Authentication
 */
export const protectAdmin: RequestHandler = asyncHandler(
  async (req: AuthenticatedAdminRequest, _res: Response, next: NextFunction): Promise<void> => {
    let token = req.cookies?.admin_token || req.cookies?.jwt;

    if (!token && req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(new AppError("Admin authorization required. Please log in.", 401));
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "thepetspot_admin_secret_key_2026"
      ) as { id: string; role?: string; isAdmin?: boolean };

      // Check AdminModel first
      let admin = await AdminModel.findById(decoded.id);

      // Fallback check User model with role === 'admin'
      if (!admin) {
        const user = await User.findById(decoded.id);
        if (user && user.role === "admin") {
          admin = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: "admin",
            avatar: user.avatar,
            isActive: true,
          } as any;
        }
      }

      if (!admin || !admin.isActive) {
        return next(new AppError("Admin not found or account is deactivated.", 401));
      }

      req.admin = admin;
      next();
    } catch (err) {
      return next(new AppError("Invalid or expired session. Please log in again.", 401));
    }
  }
);

// ─────────────────────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────────────────────
router.post("/login", adminLogin);
router.get("/me", protectAdmin, getAdminMe);
router.post("/logout", adminLogout);

// ─────────────────────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────────────────────
router.get("/dashboard/stats", protectAdmin, getAdminDashboardStats);

// ─────────────────────────────────────────────────────────────
// BREEDS ROUTES (Public GET, Protected Write)
// ─────────────────────────────────────────────────────────────
router.get("/breeds", getAdminBreeds);
router.get("/breeds/:id", getAdminBreedById);
router.post("/breeds", protectAdmin, upload.single("image"), createAdminBreed);
router.put("/breeds/:id", protectAdmin, upload.single("image"), updateAdminBreed);
router.delete("/breeds/:id", protectAdmin, deleteAdminBreed);

// ─────────────────────────────────────────────────────────────
// BLOGS ROUTES (Public GET, Protected Write)
// ─────────────────────────────────────────────────────────────
router.get("/blogs", getAdminBlogs);
router.get("/blogs/:id", getAdminBlogById);
router.post("/blogs", protectAdmin, upload.single("coverImage"), createAdminBlog);
router.put("/blogs/:id", protectAdmin, upload.single("coverImage"), updateAdminBlog);
router.delete("/blogs/:id", protectAdmin, deleteAdminBlog);

// ─────────────────────────────────────────────────────────────
// USER ADS APPROVAL & MANAGEMENT ROUTES
// ─────────────────────────────────────────────────────────────
router.get("/ads", protectAdmin, getAdminAds);
router.get("/ads/:id", protectAdmin, getAdminAdById);
router.patch("/ads/:id/status", protectAdmin, updateAdminAdStatus);
router.delete("/ads/:id", protectAdmin, deleteAdminAd);

// ─────────────────────────────────────────────────────────────
// PRODUCTS / PETS MANAGEMENT ROUTES
// ─────────────────────────────────────────────────────────────
router.get("/products", getAdminProducts);
router.post("/products", protectAdmin, upload.single("img"), createAdminProduct);
router.put("/products/:id", protectAdmin, upload.single("img"), updateAdminProduct);
router.delete("/products/:id", protectAdmin, deleteAdminProduct);

// ─────────────────────────────────────────────────────────────
// USERS MANAGEMENT ROUTES
// ─────────────────────────────────────────────────────────────
router.get("/users", protectAdmin, getAdminUsers);
router.get("/users/:id", protectAdmin, getAdminUserById);

export default router;
