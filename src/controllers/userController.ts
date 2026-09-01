import { User } from "../models/userModel.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendTokenResponse, type AuthenticatedRequest } from "../middlewares/authMiddleware.js";
import type { Request, Response } from "express";
import { sendOtpEvent } from "../utils/kafka.js";

// 1. Register User & Send Verification OTP via Kafka
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, isPetParent } = req.body;

  if (!name || !email || !password) {
    throw new AppError("Please provide all required fields", 400);
  }

  const existingUser = await User.findOne({ email });
  if (existingUser && existingUser.isVerified) {
    throw new AppError("Email is already registered", 400);
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

  const isNewUser = !existingUser;
  let user = existingUser;

  if (user) {
    user.name = name;
    user.password = password;
    user.isPetParent = isPetParent;
    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();
  } else {
    user = await User.create({
      name,
      email,
      password,
      isPetParent,
      otp,
      otpExpires,
      isVerified: false,
    });
  }

  // Dispatch OTP via clean helper (handles fallback internally)
  try {
    await sendOtpEvent({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      otp,
      type: "SEND_OTP",
      isPetParent: String(user.isPetParent),
    });
  } catch (kafkaError) {
    console.error("Kafka OTP dispatch failed:", kafkaError);

    if (isNewUser) {
      await User.findByIdAndDelete(user._id);
    }

    throw new AppError(
      "The provided email is invalid or could not receive verification code.",
      400
    );
  }

  res.status(200).json({
    status: "success",
    message: "OTP sent successfully to your email.",
    email: user.email,
    redirectTo: "/verify-otp",
  });
});

// 2. Verify OTP
export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new AppError("Email and OTP are required", 400);
  }

  const user = await User.findOne({ email }).select("+otp +otpExpires");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (user.isVerified) {
    throw new AppError("Account is already verified", 400);
  }

  if (!user.otp || user.otp !== otp) {
    throw new AppError("Invalid verification code", 400);
  }

  if (user.otpExpires && user.otpExpires < new Date()) {
    throw new AppError("Verification code has expired. Please sign up again", 400);
  }

  user.isVerified = true;
  user.set("otp", undefined);
  user.set("otpExpires", undefined);
  await user.save();

  sendTokenResponse(user, 200, res, "Email verified successfully!");
});

// 3. Login
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("Please provide email and password", 400);
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password", 401);
  }

  sendTokenResponse(user, 200, res, "Login successful");
});

// 4. Logout
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.cookie("jwt", "", {
    expires: new Date(0),
    httpOnly: true,
  });
  res.status(200).json({ message: "Logged out successfully" });
});

// 5. Get Current User (/me)
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ user: (req as AuthenticatedRequest).user });
});

// 6. Update Profile
// 5. Update Profile (Supports Name, Email, and Avatar Upload)
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const { name, email } = req.body;
  const user = await User.findById(authenticatedReq.user!._id);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Update name if provided
  if (name) {
    user.name = name;
  }

  // Handle avatar upload (works for new uploads or updates)
  if (authenticatedReq.file) {
    user.avatar = `/uploads/${authenticatedReq.file.filename}`;
  }

  // Handle email update logic
  let isEmailUpdated = false;
  if (email && email !== user.email) {
    const existingEmailUser = await User.findOne({ email });
    if (existingEmailUser) {
      throw new AppError("This email address is already in use by another account", 400);
    }

    user.email = email;
    user.isVerified = false;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await sendOtpEvent({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      otp,
      type: "SEND_OTP",
    });

    isEmailUpdated = true;
  }

  await user.save();

  res.status(200).json({
    status: "success",
    message: isEmailUpdated
      ? "Profile updated. Please verify your new email with the OTP sent."
      : "Profile updated successfully",
    user,
    emailChanged: isEmailUpdated,
  });
});
// 7. Change Password
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new AppError("Please provide both old and new passwords", 400);
  }

  const user = await User.findById(authenticatedReq.user!._id).select("+password");
  if (!user || !(await user.comparePassword(oldPassword))) {
    throw new AppError("Incorrect old password", 400);
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({ message: "Password changed successfully" });
});

// 8. Forgot Password
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) throw new AppError("Please provide an email", 400);

  const user = await User.findOne({ email });
  if (!user) throw new AppError("User not found with this email", 404);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.resetOTP = otp;
  user.resetOTPExpire = new Date(Date.now() + 10 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  await sendOtpEvent({
    id: user._id.toString(),
    email: user.email,
    otp,
    type: "FORGOT_PASSWORD_OTP",
  });

  res.status(200).json({ message: "OTP sent to your email" });
});

// 9. Reset Password
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { otp, newPassword } = req.body;

  if (!otp || !newPassword) {
    throw new AppError("Please provide OTP and new password", 400);
  }

  const user = await User.findOne({
    resetOTP: otp,
    resetOTPExpire: { $gt: new Date() },
  });

  if (!user) {
    throw new AppError("OTP is invalid or has expired", 400);
  }

  user.password = newPassword;
  user.set("resetOTP", undefined);
  user.set("resetOTPExpire", undefined);
  await user.save();

  res.status(200).json({ message: "Password reset successful" });
});