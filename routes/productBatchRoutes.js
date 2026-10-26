import express from 'express';
import {
  getBatches,
  getBatchById,
  createBatch,
  updateBatch,
  deleteBatch,
  bulkDeleteBatches,
  refreshBatchStatus,
  getStockSummary,
  getExpiryOverview,
  scanExpiry,
  getExpiryAlerts,
  updateExpiryAlertAction
} from '../controllers/ProductBatchController.js';
import { requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Tổng quan HSD (đặt trước /:id để tránh conflict)
router.get('/expiry-overview', requirePermission('data_view'), getExpiryOverview);

// Cảnh báo HSD & Quét tự động/thủ công
router.get('/expiry-alerts', requirePermission('data_view'), getExpiryAlerts);
router.post('/scan-expiry', requirePermission('data_edit'), scanExpiry);
router.patch('/expiry-alerts/:id/action', requirePermission('data_edit'), updateExpiryAlertAction);

// Thống kê tồn kho theo lô của 1 sản phẩm
router.get('/stock-summary/:productId', requirePermission('data_view'), getStockSummary);

// Quét & cập nhật trạng thái lô theo sản phẩm
router.post('/refresh-status/:productId', requirePermission('data_edit'), refreshBatchStatus);

// CRUD cơ bản
router.get('/', requirePermission('data_view'), getBatches);
router.post('/bulk-delete', requirePermission('data_delete'), bulkDeleteBatches);
router.get('/:id', requirePermission('data_view'), getBatchById);
router.post('/', requirePermission('data_create'), createBatch);
router.put('/:id', requirePermission('data_edit'), updateBatch);
router.delete('/:id', requirePermission('data_delete'), deleteBatch);

export default router;
