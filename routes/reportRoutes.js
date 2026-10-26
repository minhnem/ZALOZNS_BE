import express from 'express';
import {
  getSalesReport,
  getInventoryReport,
  getExpiryReport,
  getStockMovementReport,
  exportReportExcel,
  getCampaignReports,
  getCampaignDetailLogs
} from '../controllers/reportController.js';
import { requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Tất cả route yêu cầu quyền xem báo cáo 'dashboard_view' (hoặc '*' của Admin/Chủ shop)
router.get('/sales', requirePermission('dashboard_view'), getSalesReport);
router.get('/inventory', requirePermission('dashboard_view'), getInventoryReport);
router.get('/expiry-loss', requirePermission('dashboard_view'), getExpiryReport);
router.get('/stock-movement', requirePermission('dashboard_view'), getStockMovementReport);
router.get('/export-excel', requirePermission('dashboard_view'), exportReportExcel);

// Báo cáo chiến dịch Zalo ZNS (giữ nguyên tương thích ngược)
router.get('/campaigns', requirePermission('dashboard_view'), getCampaignReports);
router.get('/campaigns/:id/logs', requirePermission('dashboard_view'), getCampaignDetailLogs);

export default router;
