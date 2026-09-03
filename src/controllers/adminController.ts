import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import AdminModel, { seedDefaultAdmin, type IAdmin } from "../models/adminModel.js";
import AdminBreedModel from "../models/adminBreedModel.js";
import AdminBlogModel from "../models/adminBlogModel.js";
import UserAd from "../models/userAdsModel.js";
import Pet from "../models/petSlugModel.js";
import { User } from "../models/userModel.js";
import { Order } from "../models/orderModel.js";
import { uploadFile } from "../utils/uploadFile.js";
import { sendAdRejectionEmail, sendAdApprovalEmail } from "../utils/sendEmail.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export interface AuthenticatedAdminRequest extends Request {
  admin?: IAdmin;
}

const normalizeParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return value || "";
};

// ─────────────────────────────────────────────────────────────
// 1. ADMIN AUTHENTICATION
// ─────────────────────────────────────────────────────────────

export const adminLogin = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Support either email or username (user prompt specifies username means email)
    const email = (req.body.email || req.body.username || "").toLowerCase().trim();
    const { password } = req.body;

    if (!email || !password) {
      return next(new AppError("Please provide both email/username and password", 400));
    }

    // Ensure default admin exists if DB is freshly seeded
    await seedDefaultAdmin();

    // 1. Look in AdminModel first
    let admin = await AdminModel.findOne({ email }).select("+password");

    // 2. Fallback: check User model if someone with role === "admin" exists
    if (!admin) {
      const userAdmin = await User.findOne({ email, role: "admin" }).select("+password");
      if (userAdmin && (await userAdmin.comparePassword(password))) {
        // Create an AdminModel record seamlessly
        admin = await AdminModel.create({
          name: userAdmin.name,
          email: userAdmin.email,
          password: password,
          role: "admin",
          avatar: userAdmin.avatar || "",
        });
      }
    }

    if (!admin) {
      return next(new AppError("Invalid admin credentials", 401));
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return next(new AppError("Invalid admin credentials", 401));
    }

    if (!admin.isActive) {
      return next(new AppError("This administrator account has been deactivated", 403));
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save({ validateBeforeSave: false });

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: admin.role, isAdmin: true },
      process.env.JWT_SECRET || "thepetspot_admin_secret_key_2026",
      { expiresIn: "7d" }
    );

    const cookieOptions = {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
    };

    const adminData = admin.toObject();
    delete adminData.password;

    res.cookie("admin_token", token, cookieOptions).status(200).json({
      status: "success",
      message: "Admin login successful",
      token,
      admin: adminData,
    });
  }
);

export const getAdminMe = asyncHandler(
  async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    res.status(200).json({
      status: "success",
      admin: req.admin,
    });
  }
);

export const adminLogout = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    res.cookie("admin_token", "", {
      expires: new Date(Date.now() - 1000),
      httpOnly: true,
    });
    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  }
);

// ─────────────────────────────────────────────────────────────
// 2. DASHBOARD ANALYTICS & STATS
// ─────────────────────────────────────────────────────────────

export const getAdminDashboardStats = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const [
      totalUsers,
      totalAds,
      pendingAds,
      approvedAds,
      rejectedAds,
      totalBreeds,
      totalBlogs,
      totalProducts,
      totalOrders,
      recentAds,
      recentUsers,
      recentOrders,
    ] = await Promise.all([
      User.countDocuments(),
      UserAd.countDocuments(),
      UserAd.countDocuments({ isApproved: "pending" }),
      UserAd.countDocuments({ isApproved: "approved" }),
      UserAd.countDocuments({ isApproved: "rejected" }),
      AdminBreedModel.countDocuments(),
      AdminBlogModel.countDocuments(),
      Pet.countDocuments(),
      Order.countDocuments().catch(() => 0),
      UserAd.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .populate("user", "name email avatar"),
      User.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .select("name email role createdAt isVerified avatar"),
      Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .catch(() => []),
    ]);

    // Categories breakdown for ads
    const categoryBreakdown = await UserAd.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    res.status(200).json({
      status: "success",
      data: {
        counts: {
          totalUsers,
          totalAds,
          pendingAds,
          approvedAds,
          rejectedAds,
          totalBreeds,
          totalBlogs,
          totalProducts,
          totalOrders,
        },
        categoryBreakdown,
        recentAds,
        recentUsers,
        recentOrders,
      },
    });
  }
);

// ─────────────────────────────────────────────────────────────
// 3. BREEDS MANAGEMENT (CRUD)
// ─────────────────────────────────────────────────────────────

export const getAdminBreeds = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.category && req.query.category !== "all") {
      query.category = req.query.category;
    }
    if (req.query.search) {
      query.name = { $regex: req.query.search as string, $options: "i" };
    }

    const total = await AdminBreedModel.countDocuments(query);
    const breeds = await AdminBreedModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      status: "success",
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      breeds,
    });
  }
);

export const getAdminBreedById = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = normalizeParam(req.params.id);
    const breed = await AdminBreedModel.findById(id);
    if (!breed) {
      return next(new AppError("Breed not found", 404));
    }
    res.status(200).json({ status: "success", breed });
  }
);

export const createAdminBreed = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body;
    let imageUrl = body.image || "";

    // Upload file if provided via multer
    if (req.file) {
      imageUrl = await uploadFile(req.file, "breeds");
    }

    let temperamentArr: string[] = [];
    if (body.temperament) {
      if (typeof body.temperament === "string") {
        temperamentArr = body.temperament.split(",").map((t: string) => t.trim());
      } else if (Array.isArray(body.temperament)) {
        temperamentArr = body.temperament;
      }
    }

    const breed = await AdminBreedModel.create({
      name: body.name,
      slug: body.slug || undefined,
      category: body.category || "dog",
      origin: body.origin || "",
      maxlife: body.maxlife || "",
      temperament: temperamentArr,
      weight: body.weight || "",
      height: body.height || "",
      description: body.description || "",
      careGuide: body.careGuide || "",
      suitableFor: body.suitableFor || "",
      image: imageUrl,
      isPopular: body.isPopular === "true" || body.isPopular === true,
    });

    res.status(201).json({
      status: "success",
      message: "Breed created successfully",
      breed,
    });
  }
);

export const updateAdminBreed = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = normalizeParam(req.params.id);
    const breed = await AdminBreedModel.findById(id);
    if (!breed) {
      return next(new AppError("Breed not found", 404));
    }

    const body = req.body;
    if (req.file) {
      breed.image = await uploadFile(req.file, "breeds");
    } else if (body.image !== undefined) {
      breed.image = body.image;
    }

    if (body.temperament) {
      if (typeof body.temperament === "string") {
        breed.temperament = body.temperament.split(",").map((t: string) => t.trim());
      } else if (Array.isArray(body.temperament)) {
        breed.temperament = body.temperament;
      }
    }

    if (body.name) breed.name = body.name;
    if (body.slug) breed.slug = body.slug;
    if (body.category) breed.category = body.category;
    if (body.origin !== undefined) breed.origin = body.origin;
    if (body.maxlife !== undefined) breed.maxlife = body.maxlife;
    if (body.weight !== undefined) breed.weight = body.weight;
    if (body.height !== undefined) breed.height = body.height;
    if (body.description !== undefined) breed.description = body.description;
    if (body.careGuide !== undefined) breed.careGuide = body.careGuide;
    if (body.suitableFor !== undefined) breed.suitableFor = body.suitableFor; 
    if (body.isPopular !== undefined) {
      breed.isPopular = body.isPopular === "true" || body.isPopular === true;
    }

    await breed.save();

    res.status(200).json({
      status: "success",
      message: "Breed updated successfully",
      breed,
    });
  }
);

export const deleteAdminBreed = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = normalizeParam(req.params.id);
    const breed = await AdminBreedModel.findByIdAndDelete(id);
    if (!breed) {
      return next(new AppError("Breed not found", 404));
    }
    res.status(200).json({
      status: "success",
      message: "Breed deleted successfully",
    });
  }
);

// ─────────────────────────────────────────────────────────────
// 4. BLOGS MANAGEMENT (CRUD)
// ─────────────────────────────────────────────────────────────

export const getAdminBlogs = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.category && req.query.category !== "all") {
      query.category = req.query.category;
    }
    if (req.query.search) {
      query.title = { $regex: req.query.search as string, $options: "i" };
    }
    if (req.query.status && req.query.status !== "all") {
      query.isPublished = req.query.status === "published";
    }

    const total = await AdminBlogModel.countDocuments(query);
    const blogs = await AdminBlogModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      status: "success",
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      blogs,
    });
  }
);

export const getAdminBlogById = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = normalizeParam(req.params.id);
    const blog = await AdminBlogModel.findById(id);
    if (!blog) {
      return next(new AppError("Blog not found", 404));
    }
    res.status(200).json({ status: "success", blog });
  }
);

export const createAdminBlog = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body;
    let coverUrl = body.coverImage || "";

    if (req.file) {
      coverUrl = await uploadFile(req.file, "blogs");
    }

    let tagsArr: string[] = [];
    if (body.tags) {
      if (typeof body.tags === "string") {
        tagsArr = body.tags.split(",").map((t: string) => t.trim());
      } else if (Array.isArray(body.tags)) {
        tagsArr = body.tags;
      }
    }

    const blog = await AdminBlogModel.create({
      title: body.title,
      slug: body.slug || undefined,
      category: body.category || "general",
      author: body.author || "PetSpot Editorial",
      coverImage: coverUrl,
      excerpt: body.excerpt,
      content: body.content,
      tags: tagsArr,
      readTime: body.readTime || "4 min read",
      isPublished: body.isPublished === "true" || body.isPublished === true,
    });

    res.status(201).json({
      status: "success",
      message: "Blog post published successfully",
      blog,
    });
  }
);

export const updateAdminBlog = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = normalizeParam(req.params.id);
    const blog = await AdminBlogModel.findById(id);
    if (!blog) {
      return next(new AppError("Blog not found", 404));
    }

    const body = req.body;
    if (req.file) {
      blog.coverImage = await uploadFile(req.file, "blogs");
    } else if (body.coverImage !== undefined) {
      blog.coverImage = body.coverImage;
    }

    if (body.tags) {
      if (typeof body.tags === "string") {
        blog.tags = body.tags.split(",").map((t: string) => t.trim());
      } else if (Array.isArray(body.tags)) {
        blog.tags = body.tags;
      }
    }

    if (body.title) blog.title = body.title;
    if (body.slug) blog.slug = body.slug;
    if (body.category) blog.category = body.category;
    if (body.author) blog.author = body.author;
    if (body.excerpt) blog.excerpt = body.excerpt;
    if (body.content) blog.content = body.content;
    if (body.readTime) blog.readTime = body.readTime;
    if (body.isPublished !== undefined) {
      blog.isPublished = body.isPublished === "true" || body.isPublished === true;
    }

    await blog.save();

    res.status(200).json({
      status: "success",
      message: "Blog post updated successfully",
      blog,
    });
  }
);

export const deleteAdminBlog = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = normalizeParam(req.params.id);
    const blog = await AdminBlogModel.findByIdAndDelete(id);
    if (!blog) {
      return next(new AppError("Blog not found", 404));
    }
    res.status(200).json({
      status: "success",
      message: "Blog deleted successfully",
    });
  }
);

// ─────────────────────────────────────────────────────────────
// 5. ADS APPROVAL SYSTEM & EMAIL NOTIFICATIONS
// ─────────────────────────────────────────────────────────────

export const getAdminAds = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.status && req.query.status !== "all") {
      query.isApproved = req.query.status;
    }
    if (req.query.category && req.query.category !== "all") {
      query.category = { $regex: new RegExp(`^${req.query.category}`, "i") };
    }
    if (req.query.search) {
      const searchRegex = { $regex: req.query.search as string, $options: "i" };
      query.$or = [{ name: searchRegex }, { breed: searchRegex }, { city: searchRegex }];
    }

    const total = await UserAd.countDocuments(query);
    const ads = await UserAd.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "name email avatar");

    res.status(200).json({
      status: "success",
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      ads,
    });
  }
);

export const getAdminAdById = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = normalizeParam(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid Ad ID", 400));
    }

    const ad = await UserAd.findById(id).populate("user", "name email avatar isVerified createdAt");
    if (!ad) {
      return next(new AppError("Ad not found", 404));
    }

    res.status(200).json({ status: "success", ad });
  }
);

export const updateAdminAdStatus = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = normalizeParam(req.params.id);
    const { status, rejectionReason } = req.body;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return next(new AppError("Status must be 'approved', 'rejected', or 'pending'", 400));
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid Ad ID", 400));
    }

    const ad = await UserAd.findById(id).populate("user", "name email");
    if (!ad) {
      return next(new AppError("Ad not found", 404));
    }

    ad.isApproved = status;
    await ad.save();

    let emailSent = false;
    const userEmail = (ad.user as any)?.email;

    // Send email when rejected or approved
    if (userEmail) {
      try {
        if (status === "rejected") {
          await sendAdRejectionEmail(
            userEmail,
            ad.name,
            rejectionReason || "Ad details did not adhere to community and pet welfare guidelines."
          );
          emailSent = true;
        } else if (status === "approved") {
          await sendAdApprovalEmail(userEmail, ad.name);
          emailSent = true;
        }
      } catch (emailError) {
        console.error("⚠️ Failed to dispatch status notification email:", emailError);
        // Continue flow so status update is preserved
      }
    }

    res.status(200).json({
      status: "success",
      message: `Ad has been ${status}${emailSent ? " and owner notified via email." : "."}`,
      ad,
      emailSent,
    });
  }
);

export const deleteAdminAd = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = normalizeParam(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid Ad ID", 400));
    }

    const ad = await UserAd.findByIdAndDelete(id);
    if (!ad) {
      return next(new AppError("Ad not found", 404));
    }

    res.status(200).json({
      status: "success",
      message: "Ad deleted successfully",
    });
  }
);

// ─────────────────────────────────────────────────────────────
// 6. PRODUCTS MANAGEMENT (Pet Listings)
// ─────────────────────────────────────────────────────────────

export const getAdminProducts = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.category && req.query.category !== "all") {
      query.category = { $regex: new RegExp(`^${req.query.category}`, "i") };
    }
    if (req.query.search) {
      const searchRegex = { $regex: req.query.search as string, $options: "i" };
      query.$or = [{ name: searchRegex }, { breed: searchRegex }, { title: searchRegex }];
    }

    const total = await Pet.countDocuments(query);
    const products = await Pet.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      status: "success",
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      products,
    });
  }
);

export const createAdminProduct = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body;
    let imgUrl = body.img || "";

    if (req.file) {
      imgUrl = await uploadFile(req.file, "products");
    }

    const product = await Pet.create({
      name: body.name,
      title: body.title || body.name,
      category: body.category,
      breed: body.breed,
      age: body.age,
      gender: body.gender,
      price: Number(body.price),
      description: body.description,
      img: imgUrl,
      images: imgUrl ? [imgUrl] : [],
    });

    res.status(201).json({
      status: "success",
      message: "Product created successfully",
      product,
    });
  }
);

export const updateAdminProduct = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = normalizeParam(req.params.id);
    const product = await Pet.findById(id);
    if (!product) {
      return next(new AppError("Product not found", 404));
    }

    const body = req.body;
    if (req.file) {
      const newImg = await uploadFile(req.file, "products");
      product.img = newImg;
      product.images = [newImg, ...(product.images || [])];
    } else if (body.img) {
      product.img = body.img;
    }

    if (body.name) product.name = body.name;
    if (body.title) product.title = body.title;
    if (body.category) product.category = body.category;
    if (body.breed) product.breed = body.breed;
    if (body.age !== undefined) product.age = body.age;
    if (body.gender !== undefined) product.gender = body.gender;
    if (body.price !== undefined) product.price = Number(body.price);
    if (body.description !== undefined) product.description = body.description;

    await product.save();

    res.status(200).json({
      status: "success",
      message: "Product updated successfully",
      product,
    });
  }
);

export const deleteAdminProduct = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = normalizeParam(req.params.id);
    const product = await Pet.findByIdAndDelete(id);
    if (!product) {
      return next(new AppError("Product not found", 404));
    }
    res.status(200).json({
      status: "success",
      message: "Product deleted successfully",
    });
  }
);

// ─────────────────────────────────────────────────────────────
// 7. USERS MANAGEMENT
// ─────────────────────────────────────────────────────────────

export const getAdminUsers = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (req.query.search) {
      const searchRegex = { $regex: req.query.search as string, $options: "i" };
      query.$or = [{ name: searchRegex }, { email: searchRegex }];
    }
    if (req.query.role && req.query.role !== "all") {
      query.role = req.query.role;
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("name email role avatar isPetParent isVerified createdAt");

    // Fetch ad count for each user
    const usersWithStats = await Promise.all(
      users.map(async (u) => {
        const adCount = await UserAd.countDocuments({ user: u._id });
        return {
          ...u.toObject(),
          adCount,
        };
      })
    );

    res.status(200).json({
      status: "success",
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      users: usersWithStats,
    });
  }
);

export const getAdminUserById = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = normalizeParam(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError("Invalid User ID", 400));
    }

    const user = await User.findById(id).select("-password -otp -resetOTP");
    if (!user) {
      return next(new AppError("User not found", 404));
    }

    const ads = await UserAd.find({ user: user._id }).sort({ createdAt: -1 });
    const orders = await Order.find({ "customerInfo.email": user.email }).catch(() => []);

    res.status(200).json({
      status: "success",
      user,
      ads,
      orders,
    });
  }
);


//FOR USERS TO GET BLOGS BY CATEGORY  
export const getBlogsByCategory = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const categoryName = req.params.category; // e.g., "dog-care", "cat-care"
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const skip = (page - 1) * limit;

    const query: any = { 
      category: categoryName,
      isPublished: true // Usually public-facing pages only show published posts
    };

    if (req.query.search) {
      query.title = { $regex: req.query.search as string, $options: "i" };
    }

    const total = await AdminBlogModel.countDocuments(query);
    const blogs = await AdminBlogModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      status: "success",
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      blogs,
    });
  }
);


export const getsingleBlogBySlug = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { slug } = req.params;

    // Find the blog document by slug and ensure it is published (optional, remove if drafts should be viewable)
    const blog = await AdminBlogModel.findOne({ slug });

    if (!blog) {
      res.status(404).json({
        success: false,
        message: "Blog post not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      blog,
    });
  }
);