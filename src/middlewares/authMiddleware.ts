import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { User, type IUser } from "../models/userModel.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Clean interface extension that doesn't conflict with Express/Multer types
export interface AuthenticatedRequest extends Request {
  user?: IUser;
}

export const sendTokenResponse = (
  user: IUser,
  statusCode: number,
  res: Response,
  message: string
) => {
  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET || "fallback_secret",
    { expiresIn: "7d" }
  );

  const cookieOptions = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
  };

  const userObj = user.toObject();
  delete userObj.password;

  res.cookie("jwt", token, cookieOptions).status(statusCode).json({
    user: userObj,
    message,
  });
};

export const protect: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // Cast to AuthenticatedRequest to safely attach user data
    const authReq = req as AuthenticatedRequest;
    
    let token = authReq.cookies?.jwt;

    if (!token && authReq.headers.authorization?.startsWith("Bearer")) {
      token = authReq.headers.authorization.split(" ")[1];
    }

    if (!token) {
      throw new AppError("Not authorized, please log in", 401);
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret"
    ) as { id: string };

    const user = await User.findById(decoded.id);

    if (!user) {
      throw new AppError("The user belonging to this token no longer exists", 401);
    }

    authReq.user = user;
    next();
  }
);

// Alias export to satisfy routes importing authMiddleware
export const authMiddleware = protect;