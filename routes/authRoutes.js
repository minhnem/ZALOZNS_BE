import express from 'express';
import { login, register, updateProfile } from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.put('/profile/:id', updateProfile);

export default router;
