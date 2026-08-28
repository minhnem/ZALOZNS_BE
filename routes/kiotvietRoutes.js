import express from 'express';
import { getConfig, saveConfig, syncProductsHandler, syncCustomersHandler, syncInvoicesHandler, syncAllHandler } from '../controllers/kiotvietController.js';

const router = express.Router();

router.get('/config', getConfig);
router.post('/config', saveConfig);
router.post('/sync/products', syncProductsHandler);
router.post('/sync/customers', syncCustomersHandler);
router.post('/sync/invoices', syncInvoicesHandler);
router.post('/sync/all', syncAllHandler);

export default router;
