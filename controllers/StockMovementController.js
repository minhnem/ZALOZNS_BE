import StockMovement from '../models/StockMovement.js';
import { adjustStock, discardStock } from '../services/inventoryService.js';

/**
 * Controller: StockMovement (Sổ Kho & Quản lý Biến Động Kho)
 */

// GET /api/stock-movements
export const getStockMovements = async (req, res) => {
  try {
    const { product_id, batch_id, type, search, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (product_id && product_id !== 'all') {
      filter.product_id = product_id;
    }

    if (batch_id && batch_id !== 'all') {
      filter.batch_id = batch_id;
    }

    if (type && type !== 'all') {
      filter.type = type;
    }

    if (search) {
      const q = search.trim();
      filter.$or = [
        { batch_number: { $regex: q, $options: 'i' } },
        { reference_code: { $regex: q, $options: 'i' } },
        { notes: { $regex: q, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .populate('product_id', 'name sku unit category')
        .populate('batch_id', 'batch_number expiry_date')
        .populate('created_by', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      StockMovement.countDocuments(filter)
    ]);

    res.status(200).json({
      items: movements,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (error) {
    console.error('Error fetching stock movements:', error);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu sổ kho', error: error.message });
  }
};

// POST /api/stock-movements/adjust
// Điều chỉnh kiểm kê tồn kho
export const handleAdjustStock = async (req, res) => {
  try {
    const { product_id, batch_id, actual_quantity, reason } = req.body;

    if (!batch_id) {
      return res.status(400).json({ message: 'Vui lòng chọn lô hàng cần điều chỉnh' });
    }

    if (actual_quantity === undefined || actual_quantity === null || actual_quantity < 0) {
      return res.status(400).json({ message: 'Số lượng thực tế phải >= 0' });
    }

    const result = await adjustStock({
      product_id,
      batch_id,
      actual_quantity: Number(actual_quantity),
      reason,
      userId: req.user?._id
    });

    res.status(200).json({
      message: 'Đã điều chỉnh tồn kho thành công và ghi nhận vào Sổ kho!',
      data: result
    });
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(400).json({ message: error.message });
  }
};

// POST /api/stock-movements/discard
// Xuất hủy hàng cận date / hỏng hóc
export const handleDiscardStock = async (req, res) => {
  try {
    const { batch_id, quantity, reason } = req.body;

    if (!batch_id) {
      return res.status(400).json({ message: 'Vui lòng chọn lô hàng cần hủy' });
    }

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Số lượng hủy phải lớn hơn 0' });
    }

    const result = await discardStock({
      batch_id,
      quantity: Number(quantity),
      reason,
      userId: req.user?._id
    });

    res.status(200).json({
      message: 'Đã xuất hủy hàng và ghi nhận vào Sổ kho!',
      data: result
    });
  } catch (error) {
    console.error('Error discarding stock:', error);
    res.status(400).json({ message: error.message });
  }
};

// GET /api/stock-movements/summary
// Thống kê nhanh tổng lượng nhập/xuất/hủy
export const getStockMovementsSummary = async (req, res) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const stats = await StockMovement.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      {
        $group: {
          _id: '$type',
          totalQuantity: { $sum: { $abs: '$quantity' } },
          totalValue: { $sum: '$total_value' },
          count: { $sum: 1 }
        }
      }
    ]);

    const summary = {
      in: { quantity: 0, value: 0, count: 0 },
      out: { quantity: 0, value: 0, count: 0 },
      adjustment: { quantity: 0, value: 0, count: 0 },
      discard: { quantity: 0, value: 0, count: 0 }
    };

    stats.forEach(st => {
      const typeKey = st._id.toLowerCase();
      if (summary[typeKey]) {
        summary[typeKey] = {
          quantity: st.totalQuantity,
          value: st.totalValue,
          count: st.count
        };
      }
    });

    res.status(200).json(summary);
  } catch (error) {
    console.error('Error getting movements summary:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thống kê sổ kho', error: error.message });
  }
};
