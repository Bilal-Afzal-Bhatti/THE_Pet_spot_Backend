import mongoose, { Document, Model } from "mongoose";
export interface IUser extends Document {
    name: string;
    email: string;
    password?: string;
    isPetParent?: string;
    avatar?: string;
    otp?: string;
    otpExpires?: Date;
    isVerified: boolean;
    resetOTP?: string;
    resetOTPExpire?: Date;
    comparePassword(candidatePassword: string): Promise<boolean>;
}
export declare const User: Model<IUser, {}, {}, {}, Document<unknown, {}, IUser, {}, mongoose.DefaultSchemaOptions> & IUser & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IUser>;
//# sourceMappingURL=userModel.d.ts.map