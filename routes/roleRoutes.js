import express from 'express';
import { getRoles, createRole, updateRole, deleteRole } from '../controllers/RoleController.js';
import { requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

// requireAuth + tenantMiddleware đã mount global trong server.js

router.get('/', requirePermission('system_view'), getRoles);
router.post('/', requirePermission('system_create'), createRole);
router.put('/:id', requirePermission('system_edit'), updateRole);
router.delete('/:id', requirePermission('system_delete'), deleteRole);

export default router;
