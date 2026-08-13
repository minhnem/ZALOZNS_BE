import express from 'express';
import multer from 'multer';
import { createCustomer, getCustomers, updateCustomer, deleteCustomer, importCustomersExcel } from '../controllers/CustomerController.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post('/import', upload.single('file'), importCustomersExcel);
router.post('/', createCustomer);
router.get('/', getCustomers);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);

export default router;
