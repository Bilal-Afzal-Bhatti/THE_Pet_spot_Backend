import { User } from "../models/userModel.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendTokenResponse } from "../middlewares/authMiddleware.js";
import { sendRegistrationEvent } from "../utils/kafka.js";
export const register = asyncHandler(async (req, res) => {
    const { name, email, password, isPetParent } = req.body;
    // 1. Validate basic input fields
    if (!name || !email || !password) {
        throw new AppError("Please provide all required fields", 400);
    }
    // 2. Check for existing verified user
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.isVerified) {
        throw new AppError("Email is already registered", 400);
    }
    // 3. Generate 6-digit OTP and set expiration (10 minutes)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    let user = existingUser;
    if (user) {
        // Update pending unverified account with new OTP
        user.name = name;
        user.password = password;
        user.isPetParent = isPetParent;
        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();
    }
    else {
        // Create new unverified user record
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
    // 4. Dispatch OTP payload via Kafka producer
    try {
        await sendRegistrationEvent({
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            otp,
            type: "SEND_OTP",
        });
    }
    catch (kafkaError) {
        console.error("Kafka OTP dispatch failed:", kafkaError);
        // Rollback unverified user creation if message queue fails
        await User.findByIdAndDelete(user._id);
        // Express error handler will forward this to the frontend
        throw new AppError("The provided email is invalid or could not receive verification code.", 400);
    }
    // 5. Send successful response to direct user to OTP page
    res.status(200).json({
        status: "success",
        message: "OTP sent successfully to your email.",
        email: user.email,
        redirectTo: "/verify-otp",
    });
});
export const verifyOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        throw new AppError("Email and OTP are required", 400);
    }
    // Explicitly select OTP fields since select: false is set in schema
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
    // Mark user as verified and clear OTP credentials
    user.isVerified = true;
    user.set("otp", undefined);
    user.set("otpExpires", undefined);
    await user.save();
    // Send JWT token & cookie login session response
    sendTokenResponse(user, 200, res, "Email verified successfully!");
});
// 2. Login
export const login = asyncHandler(async (req, res) => {
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
// 3. Logout
export const logout = asyncHandler(async (_req, res) => {
    res.cookie("jwt", "", {
        expires: new Date(0),
        httpOnly: true,
    });
    res.status(200).json({ message: "Logged out successfully" });
});
// 4. Check Auth / Get Current User (/me)
export const getMe = asyncHandler(async (req, res) => {
    res.status(200).json({ user: req.user });
});
// 5. Update Profile
export const updateProfile = asyncHandler(async (req, res) => {
    const { name } = req.body;
    const user = req.user;
    if (name)
        user.name = name;
    if (req.file)
        user.avatar = `/uploads/${req.file.filename}`;
    await user.save();
    res.status(200).json({ user, message: "Profile updated successfully" });
});
// 6. Change Password
export const changePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
        throw new AppError("Please provide both old and new passwords", 400);
    }
    const user = await User.findById(req.user._id).select("+password");
    if (!user || !(await user.comparePassword(oldPassword))) {
        throw new AppError("Incorrect old password", 400);
    }
    user.password = newPassword;
    await user.save();
    res.status(200).json({ message: "Password changed successfully" });
});
// 7. Forgot Password (OTP Generation)
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email)
        throw new AppError("Please provide an email", 400);
    const user = await User.findOne({ email });
    if (!user)
        throw new AppError("User not found with this email", 404);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOTP = otp;
    user.resetOTPExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    await user.save({ validateBeforeSave: false });
    // Console log OTP for testing; configure Nodemailer for email sending in production
    console.log(`🔑 Reset OTP for ${email}: ${otp}`);
    res.status(200).json({ message: "OTP sent to your email" });
});
// 8. Reset Password
export const resetPassword = asyncHandler(async (req, res) => {
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
    // Replace lines 122-123 with:
    user.set("resetOTP", undefined);
    user.set("resetOTPExpire", undefined);
    await user.save();
    res.status(200).json({ message: "Password reset successful" });
});
//# sourceMappingURL=userController.js.map