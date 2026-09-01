import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { AppError } from "../utils/AppError.js";

export const errorHandler: ErrorRequestHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error("🔴 SERVER ERROR STACK:", err);
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (process.env.NODE_ENV === "development") {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      stack: err.stack,
      error: err,
    });
    return;
  }

  // Production Error Handling
  let error = { ...err, message: err.message };

  // Handle Mongoose Duplicate Key Error (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = new AppError(`Duplicate value for field: ${field}. Please use another value!`, 400);
  }

  // Handle Mongoose Validation Error
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((el: any) => el.message);
    error = new AppError(`Invalid input data. ${errors.join(". ")}`, 400);
  }

  // Handle Invalid JWT
  if (err.name === "JsonWebTokenError") {
    error = new AppError("Invalid token. Please log in again!", 401);
  }

  // Handle Expired JWT
  if (err.name === "TokenExpiredError") {
    error = new AppError("Your token has expired! Please log in again.", 401);
  }

  // Send Operational Errors cleanly to Client
  if (error.isOperational) {
    res.status(error.statusCode).json({
      status: error.status,
      message: error.message,
    });
  } else {
    // Unknown/Programming Error: Don't leak detail to client
    console.error("ERROR 💥", err);
    res.status(500).json({
      status: "error",
      message: "Something went wrong on our end!",
    });
  }
};