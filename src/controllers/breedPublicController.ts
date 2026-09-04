import type { Request, Response } from "express";
import AdminBreedModel from "../models/adminBreedModel.js";
import mongoose from "mongoose"; // Make sure mongoose is imported

export const getBreedBySlug = async (req: Request, res: Response): Promise<void> => {
  try {
    const slugParam = req.params.slug;

    if (!slugParam || typeof slugParam !== "string") {
      res.status(400).json({ message: "Invalid parameter" });
      return;
    }

    let query: any = {};

    // 1. Check if the parameter is a valid MongoDB ObjectId (e.g., '6a9a782603b32a9ec0c1c6e4')
    if (mongoose.Types.ObjectId.isValid(slugParam)) {
      query = { _id: slugParam };
    } else {
      // 2. Otherwise, treat it as a slug or name string
      const slugName = decodeURIComponent(slugParam).replace(/-/g, " ").trim();
      query = {
        $or: [
          { slug: slugParam.toLowerCase() },
          { name: { $regex: new RegExp(`^${slugName}$`, "i") } },
        ],
      };
    }

    const breed = await AdminBreedModel.findOne(query);

    if (!breed) {
      res.status(404).json({ message: `Breed not found for search term: '${slugParam}'` });
      return;
    }

    res.status(200).json(breed);
  } catch (err: any) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};