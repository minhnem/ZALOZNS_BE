import express from 'express';
import { 
  getConfig, 
  updateConfig, 
  addMilestone, 
  editMilestone, 
  deleteMilestone 
} from '../controllers/ZaloZnsController.js';
import { requireAuth, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(requireAuth);

// Routes cho cấu hình chung Zalo ZNS
router.get('/config', requirePermission('zns_view'), getConfig);
router.post('/config', requirePermission('zns_edit'), updateConfig);

// Routes cho Kịch bản (Milestones)
router.post('/milestones', requirePermission('zns_create'), addMilestone);
router.put('/milestones/:id', requirePermission('zns_edit'), editMilestone);
router.delete('/milestones/:id', requirePermission('zns_delete'), deleteMilestone);

export default router;
