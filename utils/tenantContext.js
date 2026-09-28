import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Tenant Context Manager
 * 
 * Sử dụng AsyncLocalStorage của Node.js để truyền tenant_id xuyên suốt
 * vòng đời của một request mà không cần truyền qua tham số hàm.
 * 
 * Luồng hoạt động:
 * 1. Express Request → tenantMiddleware set context → Controller/Service/Model đều đọc được
 * 2. Zalo Webhook → dò oa_id → tìm tenant_id → set context → xử lý bình thường
 * 3. Cronjob → loop qua từng tenant → set context cho mỗi vòng lặp
 */
const tenantStorage = new AsyncLocalStorage();

/**
 * Lấy tenant_id hiện tại từ context.
 * Trả về ObjectId string hoặc null nếu không có context.
 */
export const getTenantId = () => {
  const store = tenantStorage.getStore();
  return store?.tenantId || null;
};

/**
 * Kiểm tra request hiện tại có đang chạy với quyền Super Admin không.
 * Super Admin bypass tất cả tenant filter trong Mongoose Plugin.
 */
export const isSuperAdmin = () => {
  const store = tenantStorage.getStore();
  return store?.isSuperAdmin === true;
};

/**
 * Chạy một hàm async trong context của một tenant cụ thể.
 * Dùng cho: Cronjob, Webhook, hoặc bất kỳ code nào chạy ngoài Express request.
 * 
 * @param {string|ObjectId} tenantId - ID của tenant
 * @param {Function} fn - Hàm async cần chạy
 * @returns {Promise} - Kết quả của hàm fn
 * 
 * @example
 * await runWithTenant(tenant._id, async () => {
 *   const customers = await Customer.find(); // Tự động filter theo tenant
 * });
 */
export const runWithTenant = (tenantId, fn) => {
  return tenantStorage.run({ tenantId, isSuperAdmin: false }, fn);
};

/**
 * Chạy một hàm async với quyền Super Admin (bypass tất cả tenant filter).
 * Dùng cho: Login (tìm user toàn hệ thống), Webhook (dò oa_id), Migration script.
 * 
 * ⚠️ CHÚ Ý: Chỉ dùng khi thực sự cần query xuyên tenant.
 * Lạm dụng sẽ gây rò rỉ dữ liệu.
 * 
 * @param {Function} fn - Hàm async cần chạy
 * @returns {Promise} - Kết quả của hàm fn
 * 
 * @example
 * const user = await runAsSuperAdmin(async () => {
 *   return await User.findOne({ email }); // Tìm user ở TẤT CẢ shop
 * });
 */
export const runAsSuperAdmin = (fn) => {
  return tenantStorage.run({ tenantId: null, isSuperAdmin: true }, fn);
};

export default tenantStorage;
