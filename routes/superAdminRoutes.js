import express from 'express';
import {
  getTenants,
  updateTenantStatus,
  updateTenantPlan,
  updateTenant,
  deleteTenant,
  getSystemStats,
  createTenantWithAdmin
} from '../controllers/superAdmin.controller.js';
import { runAsSuperAdmin } from '../utils/tenantContext.js';

const router = express.Router();

// Middleware: Bọc toàn bộ route này trong SuperAdmin context để các queries (.find, .countDocuments...)
// bên trong controller không bị Tenant Plugin chặn.
router.use((req, res, next) => {
  runAsSuperAdmin(() => next());
});

// APIs
router.get('/stats', getSystemStats);
router.get('/tenants', getTenants);
router.post('/tenants', createTenantWithAdmin);
router.put('/tenants/:id/status', updateTenantStatus);
router.put('/tenants/:id/plan', updateTenantPlan);
router.put('/tenants/:id', updateTenant);
router.delete('/tenants/:id', deleteTenant);

export default router;
