import * as XLSX from 'xlsx';
import StockMovement from '../models/StockMovement.js';
import { adjustStock, discardStock, bulkAdjustStock } from '../services/inventoryService.js';

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

// POST /api/stock-movements/bulk-adjust
// Tạo phiếu kiểm kê kho hàng loạt (nhiều sản phẩm/lô)
export const handleBulkAdjustStock = async (req, res) => {
  try {
    const { stocktaking_code, reason, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Danh sách sản phẩm kiểm kê không được để trống' });
    }

    const result = await bulkAdjustStock({
      stocktaking_code,
      reason,
      items,
      userId: req.user?._id
    });

    res.status(200).json({
      message: `Đã hoàn tất phiếu kiểm kê ${result.stocktaking_code}! Cập nhật ${result.updated_count} sản phẩm/lô.`,
      data: result
    });
  } catch (error) {
    console.error('Error in handleBulkAdjustStock:', error);
    res.status(400).json({ message: error.message });
  }
};

// GET /api/stock-movements/export-excel
// Xuất toàn bộ hoặc theo bộ lọc lịch sử sổ kho ra file Excel
export const exportStockMovementsExcel = async (req, res) => {
  try {
    const { product_id, batch_id, type, search, startDate, endDate } = req.query;
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
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    if (search) {
      const q = search.trim();
      filter.$or = [
        { batch_number: { $regex: q, $options: 'i' } },
        { reference_code: { $regex: q, $options: 'i' } },
        { notes: { $regex: q, $options: 'i' } }
      ];
    }

    const movements = await StockMovement.find(filter)
      .populate('product_id', 'name sku unit category')
      .populate('batch_id', 'batch_number expiry_date')
      .populate('created_by', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const typeLabelMap = {
      IN: 'Nhập kho',
      OUT: 'Xuất bán',
      ADJUSTMENT: 'Kiểm kê điều chỉnh',
      DISCARD: 'Xuất hủy',
      TRANSFER: 'Chuyển kho'
    };

    const rows = movements.map((m, idx) => ({
      'STT': idx + 1,
      'Thời gian': m.createdAt ? new Date(m.createdAt).toLocaleString('vi-VN') : '',
      'Loại biến động': typeLabelMap[m.type] || m.type,
      'Mã chứng từ': m.reference_code || 'THỦ CÔNG',
      'Loại chứng từ': m.reference_type || '',
      'Tên sản phẩm': m.product_id?.name || '',
      'Mã SKU': m.product_id?.sku || '',
      'Mã lô hàng': m.batch_number || '',
      'Đơn vị tính': m.product_id?.unit || 'Cái',
      'Số lượng biến động': m.quantity || 0,
      'Tồn kho trước': m.previous_stock || 0,
      'Tồn kho sau': m.current_stock || 0,
      'Đơn giá vốn (VNĐ)': m.unit_price || 0,
      'Giá trị biến động (VNĐ)': m.total_value || 0,
      'Lý do / Ghi chú': m.notes || '',
      'Người thực hiện': m.created_by?.name || 'Hệ thống'
    }));

    const wb = XLSX.utils.book_new();
    const defaultHeaders = {
      'STT': '',
      'Thời gian': '',
      'Loại biến động': '',
      'Mã chứng từ': '',
      'Loại chứng từ': '',
      'Tên sản phẩm': '',
      'Mã SKU': '',
      'Mã lô hàng': '',
      'Đơn vị tính': '',
      'Số lượng biến động': '',
      'Tồn kho trước': '',
      'Tồn kho sau': '',
      'Đơn giá vốn (VNĐ)': '',
      'Giá trị biến động (VNĐ)': '',
      'Lý do / Ghi chú': '',
      'Người thực hiện': ''
    };
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [defaultHeaders]);
    XLSX.utils.book_append_sheet(wb, ws, 'So_Kho_Bien_Dong');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `So_Kho_Va_Bien_Dong_${Date.now()}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting stock movements excel:', error);
    res.status(500).json({ message: 'Lỗi khi xuất file Excel sổ kho', error: error.message });
  }
};

