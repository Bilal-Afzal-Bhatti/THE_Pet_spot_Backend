import express from 'express';
import {
  createUserAd,
  updateUserAd,
  deleteUserAd,
  getUserUserAds,
 getApprovedUserAdsByCategory,
  getApprovedUserAdById,
} from '../controllers/userAdsController.js';

import { authMiddleware as protect } from "../middlewares/authMiddleware.js";
import { upload } from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// User specific routes
router.post('/', protect, upload.array('images', 5), createUserAd);
router.patch('/:id', protect, upload.array('images', 5), updateUserAd);
router.delete('/:id', protect, deleteUserAd);
router.get('/my-ads', protect, getUserUserAds);

// Public approved ads routes
// Matches /approved/cats and automatically sets req.params.category to "cats"
router.get("/approved/:category",  getApprovedUserAdsByCategory);
router.get('/approved/:category/:id', getApprovedUserAdById);

export default router;