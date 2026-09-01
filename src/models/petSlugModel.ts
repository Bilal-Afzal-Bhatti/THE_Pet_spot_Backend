import { Schema, model, Document } from "mongoose";

// Optional: Define a TypeScript interface for strict type checking on documents
export interface IPet extends Document {
  name: string;
  title?: string;
  category: string;
  breed: string;
  age?: string;
  gender?: string;
  price: number;
  description?: string;
  img?: string;
  images?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const petSchema = new Schema<IPet>(
  {
    name: { type: String, required: true },
    title: { type: String },
    category: { type: String, required: true },
    breed: { type: String, required: true },
    age: { type: String },
    gender: { type: String },
    price: { type: Number, required: true },
    description: { type: String },
    img: { type: String },
    images: [{ type: String }],
  },
  { timestamps: true }
);

// Default export so you can cleanly import it as: import Pet from "../models/petsSlugModel.js";
const Pet = model<IPet>("Pet", petSchema);

export default Pet;