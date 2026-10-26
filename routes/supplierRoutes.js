import express from 'express';
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  bulkDeleteSuppliers
} from '../controllers/SupplierController.js';
import { requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', requirePermission('data_view'), getSuppliers);
router.post('/bulk-delete', requirePermission('data_delete'), bulkDeleteSuppliers);
router.get('/:id', requirePermission('data_view'), getSupplierById);
router.post('/', requirePermission('data_create'), createSupplier);
router.put('/:id', requirePermission('data_edit'), updateSupplier);
router.delete('/:id', requirePermission('data_delete'), deleteSupplier);

export default router;
