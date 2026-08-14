import express from 'express';
import { getUsers, updateUserRole, deleteUser, createUser } from '../controllers/UserController.js';
import { requireAuth, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission('system_view'), getUsers);
router.post('/', requirePermission('system_edit'), createUser);
router.put('/:id/role', requirePermission('system_edit'), updateUserRole);
router.delete('/:id', requirePermission('system_delete'), deleteUser);

export default router;
