import express from 'express';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  bulkDeleteCategories
} from '../controllers/CategoryController.js';
import { requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', requirePermission('data_view'), getCategories);
router.post('/bulk-delete', requirePermission('data_delete'), bulkDeleteCategories);
router.get('/:id', requirePermission('data_view'), getCategoryById);
router.post('/', requirePermission('data_create'), createCategory);
router.put('/:id', requirePermission('data_edit'), updateCategory);
router.delete('/:id', requirePermission('data_delete'), deleteCategory);

export default router;
