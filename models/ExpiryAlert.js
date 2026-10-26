import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

/**
 * Model: ExpiryAlert (Cảnh báo Hạn Sử Dụng & Tồn Kho Cận Date)
 * 
 * Lưu trữ các cảnh báo về lô hàng cận date hoặc đã quá hạn sử dụng:
 * - Theo dõi mức độ rủi ro (giá trị vốn bị tồn đọng)
 * - Đánh dấu hành động xử lý (Tạo chiến dịch ZNS, giảm giá POS, xuất hủy)
 * - Liên kết trực tiếp tới Campaign nếu chủ shop chọn xả hàng
 */
const expiryAlertSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  product_name: {
    type: String,
    required: true
  },
  batch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductBatch',
    required: true,
    index: true
  },
  batch_number: {
    type: String,
    required: true
  },
  expiry_date: {
    type: Date,
    required: true,
    index: true
  },
  days_left: {
    type: Number,
    required: true
  },
  quantity_in_stock: {
    type: Number,
    required: true,
    min: 0
  },
  cost_price: {
    type: Number,
    default: 0
  },
  risk_value: {
    type: Number,
    default: 0
    // Giá trị vốn rủi ro = quantity_in_stock * cost_price
  },
  alert_level: {
    type: String,
    enum: ['expired', 'near_expiry_30', 'near_expiry_60', 'near_expiry_90'],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'resolved'],
    default: 'active',
    index: true
    // active: Đang cần xử lý
    // resolved: Đã xử lý (đã bán hết, đã hủy hoặc đã hết cảnh báo)
  },
  action_taken: {
    type: String,
    enum: ['none', 'campaign_created', 'discounted', 'destroyed'],
    default: 'none'
  },
  campaign_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign'
    // Chiến dịch ZNS xả hàng được tạo cho cảnh báo này (nếu có)
  },
  last_scanned_at: {
    type: Date,
    default: Date.now
  },
  resolved_at: {
    type: Date
  },
  resolved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

// Multi-tenant: Mỗi batch chỉ có tối đa 1 active alert trong cùng 1 shop
expiryAlertSchema.index(
  { tenant_id: 1, batch_id: 1, status: 1 }
);

// Đăng ký Tenant Plugin
expiryAlertSchema.plugin(tenantPlugin);

export default mongoose.model('ExpiryAlert', expiryAlertSchema);
