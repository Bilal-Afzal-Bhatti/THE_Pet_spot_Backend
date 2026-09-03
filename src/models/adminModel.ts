import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";

export interface IAdmin extends Document {
  name: string;
  email: string;
  password?: string;
  role: "admin" | "superadmin";
  avatar?: string;
  isActive: boolean;
  lastLogin?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const adminSchema = new Schema<IAdmin>(
  {
    name: {
      type: String,
      required: [true, "Admin name is required"],
      trim: true,
      default: "System Administrator",
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },
    role: {
      type: String,
      enum: ["admin", "superadmin"],
      default: "admin",
    },
    avatar: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
  },
  { timestamps: true }
);

adminSchema.pre<IAdmin>("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  this.password = await bcrypt.hash(this.password, 10);
});

adminSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  const admin = this as IAdmin;
  if (!admin.password) {
    throw new Error("Password field not selected");
  }
  return await bcrypt.compare(candidatePassword, admin.password);
};

export const AdminModel =
  (mongoose.models.Admin as Model<IAdmin>) ||
  mongoose.model<IAdmin>("Admin", adminSchema);

/**
 * Ensures at least one administrator account exists in the system.
 */
export const seedDefaultAdmin = async (): Promise<void> => {
  try {
    const existingAdmin = await AdminModel.findOne();
    if (!existingAdmin) {
      const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || "admin@thepetspot.com";
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123";

      const admin = new AdminModel({
        name: "Super Admin",
        email: defaultEmail,
        password: defaultPassword,
        role: "superadmin",
        isActive: true,
      });

      await admin.save();
      console.log(`✅ Default admin created: ${defaultEmail} / ${defaultPassword}`);
    }
  } catch (error) {
    console.error("⚠️ Failed to check or seed default admin:", error);
  }
};

export default AdminModel;
