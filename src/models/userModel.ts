import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role?: "user" | "admin";
  isPetParent?: string;
  avatar?: string;
  otp?: string;
  otpExpires?: Date;
  isVerified: boolean;
  resetOTP?: string;
  resetOTPExpire?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: [true, "Name is required"], trim: true },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: [true, "Password is required"], select: false },
    isPetParent: { type: String, enum: ["Yes", "No", ""], default: "" },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    avatar: { type: String, default: "" },
    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    isVerified: { type: Boolean, default: false },
    resetOTP: { type: String, select: false },
    resetOTPExpire: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.pre<IUser>("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  const user = this as IUser;
  if (!user.password) {
    throw new Error("Password field not selected");
  }
  return await bcrypt.compare(candidatePassword, user.password);
};

export const User = (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>("User", userSchema);