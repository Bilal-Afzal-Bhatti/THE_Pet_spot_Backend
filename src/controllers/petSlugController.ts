import type { Request, Response } from "express";
import Pet from "../models/petSlugModel.js";

export const getPetBySlug = async (req: Request, res: Response): Promise<void> => {
  try {
    const slugParam = req.params.slug;
    
    if (!slugParam || typeof slugParam !== "string") {
      res.status(400).json({ message: "Invalid slug parameter" });
      return;
    }

    const slugName = decodeURIComponent(slugParam).replace(/-/g, " ").trim();

    // Flexible search checking multiple possible name fields case-insensitively
    const pet = await Pet.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${slugName}$`, "i") } },
        { title: { $regex: new RegExp(`^${slugName}$`, "i") } },
        { petName: { $regex: new RegExp(`^${slugName}$`, "i") } },
      ],
    });

    if (!pet) {
      res.status(404).json({ message: `Pet not found for search term: '${slugName}'` });
      return;
    }

    res.status(200).json(pet);
  } catch (err: any) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};