import mongoose, { Schema, Document } from 'mongoose';

export interface IUserAd extends Document {
  user: mongoose.Types.ObjectId;
  name: string;
  category: string;
  breed: string;
  gender: 'Male' | 'Female';
  age: number;
  weight: number;
  height: number;
  maxLife: number;
  vaccinated: boolean;
  kcpRegistered: boolean;
  description: string;
  province: string;
  city: string;
  price: number;
  contactNumber: string;
  suitableFor: string[];
  images: string[];
  isApproved: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const userAdSchema = new Schema<IUserAd>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    breed: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['Male', 'Female'], required: true },
    age: { type: Number, required: true },
    weight: { type: Number, required: true },
    height: { type: Number, required: true },
    maxLife: { type: Number, required: true },
    vaccinated: { type: Boolean, default: false },
    kcpRegistered: { type: Boolean, default: false },
    description: { type: String, required: true },

    city: { type: String, required: true },
    price: { type: Number, required: true },
    contactNumber: { type: String, required: true },
    suitableFor: [{ type: String }],
    images: [{ type: String }],
    isApproved: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

export default mongoose.model<IUserAd>('UserAd', userAdSchema);