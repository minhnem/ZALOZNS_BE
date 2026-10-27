import express from 'express';
import multer from 'multer';
import { 
  getProducts, 
  getProductById, 
  createProduct, 
  updateProduct, 
  deleteProduct, 
  bulkDeleteProducts,
  exportProductsExcel,
  downloadProductTemplate,
  importProductsExcel
} from '../controllers/ProductController.js';
import { requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// requireAuth + tenantMiddleware đã mount global trong server.js

router.get('/export-excel', requirePermission('data_view'), exportProductsExcel);
router.get('/template', requirePermission('data_view'), downloadProductTemplate);
router.post('/import', upload.single('file'), requirePermission('data_create'), importProductsExcel);
router.get('/', requirePermission('data_view'), getProducts);
router.post('/bulk-delete', requirePermission('data_delete'), bulkDeleteProducts);
router.get('/:id', requirePermission('data_view'), getProductById);
router.post('/', requirePermission('data_create'), createProduct);
router.put('/:id', requirePermission('data_edit'), updateProduct);
router.delete('/:id', requirePermission('data_delete'), deleteProduct);

export default router;
