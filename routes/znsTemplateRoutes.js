import express from 'express';
import { 
  syncTemplates, 
  getTemplates, 
  getTemplateById, 
  createTemplate, 
  updateTemplate, 
  deleteTemplate 
} from '../controllers/ZnsTemplateController.js';
import { requireAuth, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(requireAuth);

// Đồng bộ template từ Zalo OA
router.post('/sync', requirePermission('zns_create'), syncTemplates);

// CRUD
router.get('/', requirePermission('zns_view'), getTemplates);
router.get('/:id', requirePermission('zns_view'), getTemplateById);
router.post('/', requirePermission('zns_create'), createTemplate);
router.put('/:id', requirePermission('zns_edit'), updateTemplate);
router.delete('/:id', requirePermission('zns_delete'), deleteTemplate);

export default router;
