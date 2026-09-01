import type { Request, Response, RequestHandler } from "express";
import { type IUser } from "../models/userModel.js";
export interface AuthenticatedRequest extends Request {
    user?: IUser;
    file?: {
        filename: string;
        path: string;
        mimetype: string;
        size: number;
    };
}
export declare const sendTokenResponse: (user: IUser, statusCode: number, res: Response, message: string) => void;
export declare const protect: RequestHandler;
export declare const authMiddleware: RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
//# sourceMappingURL=authMiddleware.d.ts.map