import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

const productSchema = new mongoose.Schema({
  // ═══════════════════════════════════════════════
  // Thông tin cơ bản (Giữ nguyên từ phiên bản cũ)
  // ═══════════════════════════════════════════════
  name: { 
    type: String, 
    required: [true, 'Tên sản phẩm là bắt buộc'], 
    trim: true 
  },
  category: { 
    type: String, 
    required: true,
    trim: true,
    default: 'Khác'
    // Tên danh mục (snapshot hoặc tự do)
  },
  category_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    index: true
  },
  usage_cycle_days: { 
    type: Number, 
    required: [true, 'Chu kỳ sử dụng là bắt buộc'], 
    min: 1, 
    max: 365 
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive'], 
    default: 'active' 
  },
  kiotviet_code: {
    type: String,
    sparse: true,
    trim: true
  },

  // ═══════════════════════════════════════════════
  // Mở rộng GĐ1: Thông tin bán hàng & Kho
  // ═══════════════════════════════════════════════
  sku: {
    type: String,
    trim: true,
    sparse: true
  },
  barcode: {
    type: String,
    trim: true,
    sparse: true
  },
  unit: {
    type: String,
    trim: true,
    default: 'Cái'
    // Đơn vị tính: Cái, Hộp, Gói, Lon, Bịch, Túi, Chai...
  },
  sell_price: {
    type: Number,
    default: 0,
    min: 0
  },
  cost_price: {
    type: Number,
    default: 0,
    min: 0
  },
  total_stock: {
    type: Number,
    default: 0,
    min: 0
    // Tổng tồn kho = SUM(ProductBatch.quantity_in_stock) của sản phẩm này
    // Được cập nhật tự động khi nhập/xuất kho
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  image_url: {
    type: String,
    default: ''
  },

  // Cấu hình cảnh báo hạn sử dụng (ngày)
  // Lô hàng sẽ chuyển trạng thái "near_expiry" khi còn <= X ngày
  near_expiry_days: {
    type: Number,
    default: 90,
    min: 1
  }
}, { timestamps: true });

// Multi-tenant: Mã KiotViet unique trong phạm vi từng shop, CHỈ tạo index khi có kiotviet_code
productSchema.index(
  { tenant_id: 1, kiotviet_code: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { kiotviet_code: { $exists: true, $type: "string" } }
  }
);

// Đăng ký Tenant Plugin
productSchema.plugin(tenantPlugin);

export default mongoose.model('Product', productSchema);
