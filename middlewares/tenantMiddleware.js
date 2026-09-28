import tenantStorage from '../utils/tenantContext.js';

/**
 * Tenant Middleware
 * 
 * Chạy SAU authMiddleware (requireAuth).
 * Nhiệm vụ: Đọc tenant_id từ JWT (đã decode bởi authMiddleware) → Set vào AsyncLocalStorage.
 * Sau middleware này, mọi Mongoose query trong request đều tự động filter theo tenant_id.
 * 
 * Xử lý 2 trường hợp:
 * 1. Super Admin → set context isSuperAdmin = true (bypass tất cả tenant filter)
 * 2. User thường → set context tenantId = req.user.tenant_id
 */
export const tenantMiddleware = (req, res, next) => {
  // Trường hợp 1: Super Admin (không thuộc tenant nào)
  if (req.user?.is_super_admin) {
    tenantStorage.run({ tenantId: null, isSuperAdmin: true }, () => {
      next();
    });
    return;
  }

  // Trường hợp 2: User thường - phải có tenant_id
  const tenantId = req.user?.tenant_id;
  if (!tenantId) {
    return res.status(403).json({ 
      message: 'Tài khoản chưa thuộc cửa hàng nào. Vui lòng liên hệ quản trị viên.' 
    });
  }

  // Set AsyncLocalStorage context cho toàn bộ request lifecycle
  tenantStorage.run({ tenantId, isSuperAdmin: false }, () => {
    next();
  });
};
