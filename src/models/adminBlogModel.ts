import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAdminBlog extends Document {
  title: string;
  slug: string;
  category: string;
  author: string;
  authorAvatar?: string;
  coverImage?: string;
  excerpt: string;
  content: string;
  tags?: string[];
  isPublished: boolean;
  readTime: string;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}

const adminBlogSchema = new Schema<IAdminBlog>(
  {
    title: {
      type: String,
      required: [true, "Blog title is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      default: "general",
      trim: true,
    },
    author: {
      type: String,
      default: "PetSpot Editorial",
      trim: true,
    },
    authorAvatar: {
      type: String,
      default: "",
    },
    coverImage: {
      type: String,
      default: "",
    },
    excerpt: {
      type: String,
      required: [true, "Excerpt is required"],
      trim: true,
    },
    content: {
      type: String,
      required: [true, "Content is required"],
    },
    tags: [{ type: String }],
    isPublished: {
      type: Boolean,
      default: true,
    },
    readTime: {
      type: String,
      default: "4 min read",
    },
    views: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Slug auto-generation fallback
adminBlogSchema.pre<IAdminBlog>("validate", function () {
  if (this.title && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  }
});

export const AdminBlogModel =
  (mongoose.models.AdminBlog as Model<IAdminBlog>) ||
  mongoose.model<IAdminBlog>("AdminBlog", adminBlogSchema);

export default AdminBlogModel;
