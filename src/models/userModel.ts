import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
  orderId: string;
  petId: string;
  title: string;
  price: number;
  petImage?: string;
  idempotencyKey: string;
  stripeSessionId?: string;
  customerInfo: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
    paymentMethod: "ONLINE" | "COD";
  };
  paymentStatus: "PENDING" | "PAID" | "FAILED";
  orderStatus: "PROCESSING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
}
const UserSchema = new Schema<IUser>({
    orderId: { type: String, required: true, unique: true, index: true },
    petId: { type: String, required: true },
    title: { type: String, required: true },
    price: { type: Number, required: true },
    petImage: { type: String },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    stripeSessionId: { type: String, unique: true, sparse: true, index: true },
    customerInfo: {
      fullName: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, default: "" },
      paymentMethod: { type: String, enum: ["ONLINE", "COD"], required: true },
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING",
    },
    orderStatus: {
      type: String,
      enum: ["PROCESSING", "CONFIRMED", "COMPLETED", "CANCELLED"],
      default: "PROCESSING",
    },
  },
  { timestamps: true }
);
export const User = model<IUser>("User", UserSchema);