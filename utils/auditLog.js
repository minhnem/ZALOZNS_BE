import { ActivityLog } from '../models/ActivityLog.model.js';

/**
 * Ghi lại nhật ký hoạt động của hệ thống
 * @param {string} userId - ID của người dùng thực hiện hành động
 * @param {string} action - Hành động (CREATE, UPDATE, DELETE, LOGIN, SYNC)
 * @param {string} entityType - Loại thực thể (VD: 'Campaign', 'Customer', 'ZnsTemplate', 'User')
 * @param {string} entityId - ID của thực thể bị tác động (tùy chọn)
 * @param {string} details - Mô tả chi tiết (tùy chọn)
 * @param {object} changes - Object chứa thay đổi (tùy chọn, ví dụ: { oldData, newData })
 */
export const logActivity = async (userId, action, entityType, entityId = null, details = '', changes = null) => {
  try {
    if (!userId) return; // Không lưu nếu không xác định được người dùng
    
    const newLog = new ActivityLog({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      changes
    });
    
    await newLog.save();
  } catch (error) {
    // Chỉ log lỗi ra console để không làm gián đoạn luồng chính của app
    console.error('Lỗi khi lưu Audit Log:', error.message);
  }
};
