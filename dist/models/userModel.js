import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
const userSchema = new Schema({
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
}, { timestamps: true });
userSchema.pre("save", async function () {
    if (!this.isModified("password") || !this.password)
        return;
    this.password = await bcrypt.hash(this.password, 10);
});
userSchema.methods.comparePassword = async function (candidatePassword) {
    const user = this;
    if (!user.password) {
        throw new Error("Password field not selected");
    }
    return await bcrypt.compare(candidatePassword, user.password);
};
export const User = mongoose.models.User || mongoose.model("User", userSchema);
