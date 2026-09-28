import express from 'express';
import { getDashboardStats } from '../controllers/DashboardController.js';
import { requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

// requireAuth + tenantMiddleware đã mount global trong server.js

router.get('/stats', requirePermission('dashboard_view'), getDashboardStats);

export default router;
