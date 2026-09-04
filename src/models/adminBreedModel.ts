import mongoose, { Schema, Document, Model } from "mongoose";

export interface IOverviewPoint {
  title: string;
  description: string;
}

export interface IAdminBreed extends Document {
  name: string;
  slug: string;
  category: "dog" | "cat" | "bird" | "other";
  origin?: string;
  maxlife?: string;
  temperament?: string[];
  weight?: string;
  height?: string;
  suitableFor?: string;
  overviewPoints?: IOverviewPoint[];
  breedInfoPoints?: IOverviewPoint[];
  commonNicknames?: string;
  trainability?: string;
  shedding?: string;
  grooming?: string;
  breedType?: string;
  size?: string;
  image?: string;
  images?: string[];
  isPopular: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const overviewPointSchema = new Schema<IOverviewPoint>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
  },
  { _id: false }
);

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
    maxlife: { type: String, default: "" },
    temperament: [{ type: String }],
    weight: { type: String, default: "" },
    height: { type: String, default: "" },
    suitableFor: { type: String, default: "" },

    overviewPoints: { type: [overviewPointSchema], default: [] },
    breedInfoPoints: { type: [overviewPointSchema], default: [] },
    commonNicknames: { type: String, default: "" },
    trainability: { type: String, default: "" },
    shedding: { type: String, default: "" },
    grooming: { type: String, default: "" },
    breedType: { type: String, default: "" },
    size: { type: String, default: "" },

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
















// import mongoose, { Schema, Document, Model } from "mongoose";

// export interface IAdminBreed extends Document {
//   name: string;
//   slug: string;
//   category: "dog" | "cat" | "bird" | "other";
//   origin?: string;
//   maxlife?: string;
//   temperament?: string[];
//   weight?: string;
//   height?: string;
//   description?: string;
//   careGuide?: string;
//   suitableFor?: string;
//   image?: string;
//   images?: string[];
//   isPopular: boolean;
//   createdAt: Date;
//   updatedAt: Date;
// }

// const adminBreedSchema = new Schema<IAdminBreed>(
//   {
//     name: {
//       type: String,
//       required: [true, "Breed name is required"],
//       trim: true,
//     },
//     slug: {
//       type: String,
//       required: [true, "Slug is required"],
//       unique: true,
//       lowercase: true,
//       trim: true,
//     },
//     category: {
//       type: String,
//       enum: ["dog", "cat", "bird", "other"],
//       default: "dog",
//       required: true,
//     },
//     origin: { type: String, default: "" },
//     maxlife: { type: String, default: "" },
//     temperament: [{ type: String }],
//     weight: { type: String, default: "" },
//     height: { type: String, default: "" },
//     description: { type: String, default: "" },
//     careGuide: { type: String, default: "" },
//     suitableFor: { type: String, default: "" },
//     image: { type: String, default: "" },
//     images: [{ type: String }],
//     isPopular: { type: Boolean, default: false },
//   },
//   { timestamps: true }
// );

// // Slug auto-generation fallback
// adminBreedSchema.pre<IAdminBreed>("validate", function () {
//   if (this.name && !this.slug) {
//     this.slug = this.name
//       .toLowerCase()
//       .replace(/[^a-z0-9]+/g, "-")
//       .replace(/(^-|-$)+/g, "");
//   }
// });

// export const AdminBreedModel =
//   (mongoose.models.AdminBreed as Model<IAdminBreed>) ||
//   mongoose.model<IAdminBreed>("AdminBreed", adminBreedSchema);

// export default AdminBreedModel;
