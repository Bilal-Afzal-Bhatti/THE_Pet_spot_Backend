import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAdminBreed extends Document {
  name: string;
  slug: string;
  category: "dog" | "cat" | "bird" | "other";
  origin?: string;
  lifespan?: string;
  temperament?: string[];
  weight?: string;
  height?: string;
  description?: string;
  careGuide?: string;
  image?: string;
  images?: string[];
  isPopular: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const adminBreedSchema = new Schema<IAdminBreed>(
  {
    name: {
      type: String,
      required: [true, "Breed name is required"],
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
      enum: ["dog", "cat", "bird", "other"],
      default: "dog",
      required: true,
    },
    origin: { type: String, default: "" },
    lifespan: { type: String, default: "" },
    temperament: [{ type: String }],
    weight: { type: String, default: "" },
    height: { type: String, default: "" },
    description: { type: String, default: "" },
    careGuide: { type: String, default: "" },
    image: { type: String, default: "" },
    images: [{ type: String }],
    isPopular: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Slug auto-generation fallback
adminBreedSchema.pre<IAdminBreed>("validate", function () {
  if (this.name && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  }
});

export const AdminBreedModel =
  (mongoose.models.AdminBreed as Model<IAdminBreed>) ||
  mongoose.model<IAdminBreed>("AdminBreed", adminBreedSchema);

export default AdminBreedModel;
