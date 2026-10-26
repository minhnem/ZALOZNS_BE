import express from 'express';
import {
  getPosProducts,
  getProductBatches,
  searchPosCustomers,
  createPosQuickCustomer,
  posCheckout,
  getPosOrders,
  getPosOrderById
} from '../controllers/PosController.js';

const router = express.Router();

// Sản phẩm & Lô hàng
router.get('/products', getPosProducts);
router.get('/products/:id/batches', getProductBatches);

// Khách hàng
router.get('/customers', searchPosCustomers);
router.post('/customers', createPosQuickCustomer);

// Thanh toán & Đơn hàng
router.post('/checkout', posCheckout);
router.get('/orders', getPosOrders);
router.get('/orders/:id', getPosOrderById);

export default router;
