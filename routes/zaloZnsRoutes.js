import express from 'express';
import { 
  getConfig, 
  updateConfig, 
  addMilestone, 
  editMilestone, 
  deleteMilestone 
} from '../controllers/ZaloZnsController.js';

const router = express.Router();

// Routes cho cấu hình chung Zalo ZNS
router.get('/config', getConfig);
router.post('/config', updateConfig);

// Routes cho Kịch bản (Milestones)
router.post('/milestones', addMilestone);
router.put('/milestones/:id', editMilestone);
router.delete('/milestones/:id', deleteMilestone);

export default router;
