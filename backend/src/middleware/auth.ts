import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { AppError } from "./errorHandler";

export interface JwtPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) throw new AppError(401, "Not authenticated");

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    req.currentUser = payload;
    next();
  } catch {
    throw new AppError(401, "Invalid or expired token");
  }
}
