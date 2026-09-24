import express from 'express';
import { getCampaignReports, getCampaignDetailLogs } from '../controllers/reportController.js';
import { requireAuth, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(requireAuth);

router.get('/campaigns', requirePermission('dashboard_view'), getCampaignReports);
router.get('/campaigns/:id/logs', requirePermission('dashboard_view'), getCampaignDetailLogs);

export default router;
