import jwt from "jsonwebtoken";
import { User } from "../models/userModel.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
export const sendTokenResponse = (user, statusCode, res, message) => {
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "fallback_secret", { expiresIn: "7d" });
    const cookieOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    };
    const userObj = user.toObject();
    delete userObj.password;
    res.cookie("jwt", token, cookieOptions).status(statusCode).json({
        user: userObj,
        message,
    });
};
export const protect = asyncHandler(async (req, _res, next) => {
    let token = req.cookies?.jwt;
    if (!token && req.headers.authorization?.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }
    if (!token) {
        throw new AppError("Not authorized, please log in", 401);
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret");
    const user = await User.findById(decoded.id);
    if (!user) {
        throw new AppError("The user belonging to this token no longer exists", 401);
    }
    req.user = user;
    next();
});
// Alias export to satisfy routes importing authMiddleware
export const authMiddleware = protect;
//# sourceMappingURL=authMiddleware.js.map