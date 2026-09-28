import express from 'express';
import { getCampaignReports, getCampaignDetailLogs } from '../controllers/reportController.js';
import { requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

// requireAuth + tenantMiddleware đã mount global trong server.js

router.get('/campaigns', requirePermission('dashboard_view'), getCampaignReports);
router.get('/campaigns/:id/logs', requirePermission('dashboard_view'), getCampaignDetailLogs);

export default router;
