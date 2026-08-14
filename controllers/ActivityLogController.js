import { ActivityLog } from '../models/ActivityLog.model.js';

export const getLogs = async (req, res) => {
  try {
    const { action, entity_type, startDate, endDate, limit = 50 } = req.query;
    
    const filter = {};
    if (action) filter.action = action;
    if (entity_type) filter.entity_type = entity_type;
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    const logs = await ActivityLog.find(filter)
      .populate('user_id', 'fullName email avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10));
      
    res.status(200).json(logs);
  } catch (error) {
    console.error('Lỗi lấy ActivityLog:', error);
    res.status(500).json({ message: 'Lỗi lấy nhật ký hệ thống', error: error.message });
  }
};
