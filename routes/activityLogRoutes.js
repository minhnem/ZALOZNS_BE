import express from 'express';
import { getLogs } from '../controllers/ActivityLogController.js';
import { requireAuth, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission('system_view'), getLogs);

export default router;
