import express from 'express';
import { login, register, updateProfile, getMe } from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.put('/profile/:id', requireAuth, updateProfile);
router.get('/me', requireAuth, getMe);

export default router;
