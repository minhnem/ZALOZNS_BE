import express from 'express';
import { getLogs } from '../controllers/ActivityLogController.js';
import { requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

// requireAuth + tenantMiddleware đã mount global trong server.js

router.get('/', requirePermission('system_view'), getLogs);

export default router;
