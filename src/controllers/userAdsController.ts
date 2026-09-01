import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import UserAd from '../models/userAdsModel.js';

// Helper to safely extend Express Request with user property
interface AuthenticatedRequest extends Request {
  user?: {
    _id: string | mongoose.Types.ObjectId;
  };
}

const normalizeParam = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

// Create new pet ad
export const createUserAd = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const body = req.body;
    const imageFiles = req.files as Express.Multer.File[];
    const images = imageFiles ? imageFiles.map((file) => `/uploads/${file.filename}`) : [];

    let suitableForArr: string[] = [];
    if (typeof body.suitableFor === 'string') {
      try {
        suitableForArr = JSON.parse(body.suitableFor);
      } catch {
        suitableForArr = body.suitableFor.split(',').map((item: string) => item.trim());
      }
    } else if (Array.isArray(body.suitableFor)) {
      suitableForArr = body.suitableFor;
    }

    const newAd = new UserAd({
      user: userId,
      name: body.name || body.title,
      category: body.category || body.type,
      breed: body.breed,
      gender: body.gender,
      age: Number(body.age),
      weight: Number(body.weight),
      height: Number(body.height),
      maxLife: Number(body.maxLife),
      vaccinated: body.vaccinated === 'true' || body.vaccinated === true,
      kcpRegistered: body.kcpRegistered === 'true' || body.kcpRegistered === true,
      description: body.description,
    
      city: body.city || body.location,
      price: Number(body.price),
      contactNumber: body.contactNumber,
      suitableFor: suitableForArr,
      images,
    });

    await newAd.save();
    res.status(201).json({ message: 'Ad posted successfully', ad: newAd });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to post ad' });
  }
};

// Update existing ad
export const updateUserAd = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = normalizeParam(req.params.id);
    const userId = req.user?._id;

    if (!id || !userId || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid Ad or User ID' });
      return;
    }

    const ad = await UserAd.findOne({ _id: new mongoose.Types.ObjectId(id), user: userId });
    if (!ad) {
      res.status(404).json({ message: 'Ad not found or unauthorized' });
      return;
    }

    const body = req.body;
    const imageFiles = req.files as Express.Multer.File[];

    if (imageFiles && imageFiles.length > 0) {
      ad.images = imageFiles.map((file) => `/uploads/${file.filename}`);
    }

    if (body.suitableFor) {
      let suitableForArr: string[] = [];
      if (typeof body.suitableFor === 'string') {
        try {
          suitableForArr = JSON.parse(body.suitableFor);
        } catch {
          suitableForArr = body.suitableFor.split(',').map((item: string) => item.trim());
        }
      } else if (Array.isArray(body.suitableFor)) {
        suitableForArr = body.suitableFor;
      }
      ad.suitableFor = suitableForArr;
    }

    Object.assign(ad, {
      name: body.name || body.title || ad.name,
      category: body.category || body.type || ad.category,
      breed: body.breed || ad.breed,
      gender: body.gender || ad.gender,
      age: body.age !== undefined ? Number(body.age) : ad.age,
      weight: body.weight !== undefined ? Number(body.weight) : ad.weight,
      height: body.height !== undefined ? Number(body.height) : ad.height,
      maxLife: body.maxLife !== undefined ? Number(body.maxLife) : ad.maxLife,
      vaccinated: body.vaccinated !== undefined ? (body.vaccinated === 'true' || body.vaccinated === true) : ad.vaccinated,
      kcpRegistered: body.kcpRegistered !== undefined ? (body.kcpRegistered === 'true' || body.kcpRegistered === true) : ad.kcpRegistered,
      description: body.description || ad.description,
      province: body.province || ad.province,
      city: body.city || body.location || ad.city,
      price: body.price !== undefined ? Number(body.price) : ad.price,
      contactNumber: body.contactNumber || ad.contactNumber,
    });

    await ad.save();
    res.status(200).json({ message: 'Ad updated successfully', ad });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to update ad' });
  }
};

// Delete ad
export const deleteUserAd = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = normalizeParam(req.params.id);
    const userId = req.user?._id;

    if (!id || !userId || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid Ad or User ID' });
      return;
    }

    const ad = await UserAd.findOneAndDelete({ _id: new mongoose.Types.ObjectId(id), user: userId });
    if (!ad) {
      res.status(404).json({ message: 'Ad not found or unauthorized' });
      return;
    }

    res.status(200).json({ message: 'Ad deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to delete ad' });
  }
};

// Get user-owned ads
export const getUserUserAds = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const ads = await UserAd.find({ user: userId }).sort({ createdAt: -1 });
    res.status(200).json({ ads });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to fetch user ads' });
  }
};

// Get approved ads by category with pagination
export const getApprovedUserAdsByCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryParam = req.params.category;
    if (!categoryParam || typeof categoryParam !== 'string') {
      res.status(400).json({ message: 'Category is required' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const skip = (page - 1) * limit;

    // Normalize category: strip trailing 's' if present (e.g., "cats" -> "cat")
    const cleanCategory = categoryParam.replace(/s$/i, '');

    // Pattern matches both "cat" and "cats" case-insensitively
    const filter = {
      category: { $regex: new RegExp(`^${cleanCategory}s?$`, 'i') },
      isApproved: 'approved' as const,
    };

    const totalAds = await UserAd.countDocuments(filter);
    const ads = await UserAd.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      ads,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalAds / limit) || 1,
        totalAds,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to fetch approved ads' });
  }
};
// Get single approved ad by ID
export const getApprovedUserAdById = async (req: Request, res: Response): Promise<void> => {
  try {
    const idParam = req.params.id;

    if (!idParam || typeof idParam !== 'string' || !mongoose.Types.ObjectId.isValid(idParam)) {
      res.status(400).json({ message: 'Invalid Ad ID' });
      return;
    }

    const ad = await UserAd.findOne({
      _id: new mongoose.Types.ObjectId(idParam),
      isApproved: 'approved',
    }).populate('user', 'name email avatar'); // <--- Added populate to fetch user details

    if (!ad) {
      res.status(404).json({ message: 'Ad not found' });
      return;
    }

    res.status(200).json(ad);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to fetch ad details' });
  }
};