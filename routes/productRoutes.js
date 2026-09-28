import express from 'express';
import { getProducts, getProductById, createProduct, updateProduct, deleteProduct } from '../controllers/ProductController.js';
import { requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

// requireAuth + tenantMiddleware đã mount global trong server.js

router.get('/', requirePermission('data_view'), getProducts);
router.get('/:id', requirePermission('data_view'), getProductById);
router.post('/', requirePermission('data_create'), createProduct);
router.put('/:id', requirePermission('data_edit'), updateProduct);
router.delete('/:id', requirePermission('data_delete'), deleteProduct);

export default router;
