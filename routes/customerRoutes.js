import express from 'express';
import multer from 'multer';
import { createCustomer, getCustomers, updateCustomer, deleteCustomer, importCustomersExcel } from '../controllers/CustomerController.js';
import { requireAuth, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);

router.post('/import', upload.single('file'), requirePermission('data_create'), importCustomersExcel);
router.post('/', requirePermission('data_create'), createCustomer);
router.get('/', requirePermission('data_view'), getCustomers);
router.put('/:id', requirePermission('data_edit'), updateCustomer);
router.delete('/:id', requirePermission('data_delete'), deleteCustomer);

export default router;
