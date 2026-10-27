import express from 'express';
import multer from 'multer';
import {
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  updatePurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
  deletePurchaseOrder,
  bulkDeletePurchaseOrders,
  downloadPurchaseOrderTemplate,
  parsePurchaseOrderExcel,
  importPurchaseOrderExcel
} from '../controllers/PurchaseOrderController.js';
import { requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/template', requirePermission('data_view'), downloadPurchaseOrderTemplate);
router.post('/parse-items', upload.single('file'), requirePermission('data_create'), parsePurchaseOrderExcel);
router.post('/import', upload.single('file'), requirePermission('data_create'), importPurchaseOrderExcel);
router.get('/', requirePermission('data_view'), getPurchaseOrders);
router.post('/bulk-delete', requirePermission('data_delete'), bulkDeletePurchaseOrders);
router.get('/:id', requirePermission('data_view'), getPurchaseOrderById);
router.post('/', requirePermission('data_create'), createPurchaseOrder);
router.put('/:id', requirePermission('data_edit'), updatePurchaseOrder);
router.post('/:id/receive', requirePermission('data_edit'), receivePurchaseOrder);
router.post('/:id/cancel', requirePermission('data_edit'), cancelPurchaseOrder);
router.delete('/:id', requirePermission('data_delete'), deletePurchaseOrder);

export default router;
