import express from 'express';
import {
  getStockMovements,
  handleAdjustStock,
  handleDiscardStock,
  getStockMovementsSummary
} from '../controllers/StockMovementController.js';
import { requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/summary', requirePermission('data_view'), getStockMovementsSummary);
router.get('/', requirePermission('data_view'), getStockMovements);
router.post('/adjust', requirePermission('data_edit'), handleAdjustStock);
router.post('/discard', requirePermission('data_edit'), handleDiscardStock);

export default router;
