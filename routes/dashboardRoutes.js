import express from 'express';
import { getDashboardStats } from '../controllers/DashboardController.js';

const router = express.Router();

router.get('/stats', getDashboardStats);

export default router;
