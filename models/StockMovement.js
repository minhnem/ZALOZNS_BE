import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

/**
 * Model: StockMovement (Sổ Kho / Lịch Sử Biến Động Tồn Kho)
 * Ghi vết toàn bộ các giao dịch tăng/giảm hàng hóa trong kho
 */
const stockMovementSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Sản phẩm là bắt buộc'],
    index: true
  },
  batch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductBatch',
    index: true
  },
  batch_number: {
    type: String,
    trim: true,
    default: ''
  },
  type: {
    type: String,
    enum: ['IN', 'OUT', 'ADJUSTMENT', 'TRANSFER', 'DISCARD'],
    required: [true, 'Loại biến động là bắt buộc']
    // IN: Nhập kho NCC
    // OUT: Xuất kho / Bán lẻ POS
    // ADJUSTMENT: Điều chỉnh kiểm kê
    // TRANSFER: Chuyển kho nội bộ
    // DISCARD: Hủy hàng cận date / hỏng hóc
  },
  quantity: {
    type: Number,
    required: [true, 'Số lượng biến động là bắt buộc']
    // Dương: Tăng tồn kho
    // Âm: Giảm tồn kho
  },
  previous_stock: {
    type: Number,
    default: 0
  },
  current_stock: {
    type: Number,
    default: 0
  },
  unit_price: {
    type: Number,
    default: 0
  },
  total_value: {
    type: Number,
    default: 0
  },
  reference_type: {
    type: String,
    enum: ['PurchaseOrder', 'Order', 'SalesOrder', 'Stocktaking', 'Manual', 'ExpiryDiscard', 'Other'],
    default: 'Manual'
  },
  reference_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  reference_code: {
    type: String,
    trim: true,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Indexes phục vụ tra cứu sổ kho
stockMovementSchema.index({ tenant_id: 1, product_id: 1, createdAt: -1 });
stockMovementSchema.index({ tenant_id: 1, batch_id: 1, createdAt: -1 });
stockMovementSchema.index({ tenant_id: 1, type: 1, createdAt: -1 });
stockMovementSchema.index({ tenant_id: 1, reference_code: 1 });

// Đăng ký Tenant Plugin
stockMovementSchema.plugin(tenantPlugin);

export default mongoose.model('StockMovement', stockMovementSchema);
