import { Schema, model, Document } from "mongoose";

interface IOrder extends Document {
  petId: string;
  title: string;
  price: number;
  idempotencyKey: string;
  customerInfo: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
    paymentMethod: "ONLINE" | "COD";
  };
  paymentStatus: "PENDING" | "PAID" | "FAILED";
  orderStatus: "PROCESSING" | "COMPLETED" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    petId: { type: String, required: true },
    title: { type: String, required: true },
    price: { type: Number, required: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    customerInfo: {
      fullName: { type: String, required: true },
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
      enum: ["PROCESSING", "COMPLETED", "CANCELLED"],
      default: "PROCESSING",
    },
  },
  {
    timestamps: true,
  }
);

export const Order = model<IOrder>("Order", OrderSchema);