import express from 'express';
import { getOrders, createOrder, updateOrder, deleteOrder } from '../controllers/OrderController.js';
import { requireAuth, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission('data_view'), getOrders);
router.post('/', requirePermission('data_create'), createOrder);
router.put('/:id', requirePermission('data_edit'), updateOrder);
router.delete('/:id', requirePermission('data_delete'), deleteOrder);

export default router;
