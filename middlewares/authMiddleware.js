import jwt from 'jsonwebtoken';
import { User } from '../models/User.model.js';
import { runAsSuperAdmin } from '../utils/tenantContext.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_please_change_in_production';

/**
 * requireAuth - Xác thực JWT Token
 * 
 * Luồng Multi-tenant:
 * 1. Verify JWT → lấy decoded { id, email, tenant_id } hoặc { id, email, is_super_admin }
 * 2. Dùng runAsSuperAdmin để tìm User (vì lúc này chưa có tenant context)
 * 3. Gắn tenant_id từ JWT vào req.user để tenantMiddleware sử dụng
 */
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Không tìm thấy Token. Vui lòng đăng nhập.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Dùng SuperAdmin context để tìm user (chưa có tenant context ở bước này)
    const user = await runAsSuperAdmin(async () => {
      return await User.findById(decoded.id).populate('role_id');
    });

    if (!user) {
      return res.status(401).json({ message: 'Người dùng không tồn tại.' });
    }

    // Gắn tenant_id từ JWT vào user object để tenantMiddleware đọc
    // Ưu tiên lấy từ JWT (vì DB có thể chưa update kịp nếu user chuyển shop)
    if (decoded.tenant_id) {
      user.tenant_id = decoded.tenant_id;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Lỗi xác thực Token:', error.message);
    return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
  }
};

/**
 * requirePermission - Kiểm tra quyền của user
 * Giữ nguyên logic cũ, không cần sửa.
 */
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

/**
 * requireSuperAdmin - Chỉ cho phép Super Admin truy cập
 * Dùng để bảo vệ routes /api/super-admin/*
 */
export const requireSuperAdmin = (req, res, next) => {
  if (!req.user?.is_super_admin) {
    return res.status(403).json({ message: 'Chỉ Super Admin mới có quyền truy cập.' });
  }
  next();
};
