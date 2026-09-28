import express from 'express';
import { login, register, updateProfile, getMe, changePassword } from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { tenantMiddleware } from '../middlewares/tenantMiddleware.js';

const router = express.Router();

// Routes công khai (KHÔNG cần auth) - đặt trước middleware chain trong server.js
router.post('/register', register);
router.post('/login', login);

// Routes cần auth + tenant context
// Vì auth routes được mount TRƯỚC global middleware chain trong server.js,
// nên phải tự gắn requireAuth + tenantMiddleware cho các routes cần bảo vệ
router.put('/profile/:id', requireAuth, tenantMiddleware, updateProfile);
router.put('/change-password/:id', requireAuth, tenantMiddleware, changePassword);
router.get('/me', requireAuth, tenantMiddleware, getMe);

export default router;
