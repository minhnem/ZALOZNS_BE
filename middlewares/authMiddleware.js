import jwt from 'jsonwebtoken';
import { User } from '../models/User.model.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_please_change_in_production';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Không tìm thấy Token. Vui lòng đăng nhập.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id).populate('role_id');
    if (!user) {
      return res.status(401).json({ message: 'Người dùng không tồn tại.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Lỗi xác thực Token:', error);
    return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
  }
};

export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role_id) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện hành động này.' });
    }

    const permissions = req.user.role_id.permissions || [];
    
    if (permissions.includes('*') || permissions.includes(permission)) {
      return next();
    }

    return res.status(403).json({ message: 'Bạn không có quyền thực hiện hành động này.' });
  };
};
