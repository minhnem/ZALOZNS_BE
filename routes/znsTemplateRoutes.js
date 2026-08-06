import express from 'express';
import { 
  syncTemplates, 
  getTemplates, 
  getTemplateById, 
  createTemplate, 
  updateTemplate, 
  deleteTemplate 
} from '../controllers/ZnsTemplateController.js';

const router = express.Router();

// Đồng bộ template từ Zalo OA
router.post('/sync', syncTemplates);

// CRUD
router.get('/', getTemplates);
router.get('/:id', getTemplateById);
router.post('/', createTemplate);
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

export default router;
