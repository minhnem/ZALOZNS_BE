import express from 'express';
import { getCampaigns, getCampaignById, createCampaign, updateCampaign, deleteCampaign, triggerManualCampaign } from '../controllers/CampaignController.js';
import { requireAuth, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission('campaign_view'), getCampaigns);
router.get('/:id', requirePermission('campaign_view'), getCampaignById);
router.post('/', requirePermission('campaign_create'), createCampaign);
router.put('/:id', requirePermission('campaign_edit'), updateCampaign);
router.delete('/:id', requirePermission('campaign_delete'), deleteCampaign);
router.post('/trigger', requirePermission('campaign_edit'), triggerManualCampaign);

export default router;
