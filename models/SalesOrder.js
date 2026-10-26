import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

/**
 * Model: SalesOrder (Đơn hàng bán lẻ tại quầy - POS)
 * 
 * Lưu trữ hóa đơn bán hàng hoàn chỉnh tại quầy (POS Terminal):
 * - Hỗ trợ nhiều sản phẩm / đơn hàng (items[])
 * - Mỗi item liên kết cụ thể với 1 Lô hàng (ProductBatch) theo thuật toán FEFO
 * - Tự động tạo bản ghi Order.js tương ứng cho từng item để kích hoạt CRM & ZNS
 */
const salesOrderItemSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  product_name: {
    type: String,
    required: true
  },
  product_sku: {
    type: String,
    default: ''
  },
  unit: {
    type: String,
    default: 'Cái'
  },
  batch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductBatch',
    required: true
  },
  batch_number: {
    type: String,
    required: true
  },
  expiry_date: {
    type: Date,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Số lượng bán tối thiểu là 1']
  },
  unit_price: {
    type: Number,
    required: true,
    min: [0, 'Đơn giá không được âm']
  },
  cost_price: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  // Tham chiếu tới bản ghi Order.js (được sinh ra để chạy hook tính refill_date & ZNS)
  order_ref_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }
}, { _id: true });

const salesOrderSchema = new mongoose.Schema({
  // Mã hóa đơn bán lẻ (VD: HD-261019-001)
  order_code: {
    type: String,
    required: true,
    trim: true
  },

  // Khách hàng (null nếu là khách lẻ không lấy thông tin)
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  },
  customer_name: {
    type: String,
    default: 'Khách lẻ'
  },
  customer_phone: {
    type: String,
    default: ''
  },

  // Thu ngân / Nhân viên thực hiện
  cashier_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cashier_name: {
    type: String,
    default: ''
  },

  // Danh sách mặt hàng & lô xuất
  items: [salesOrderItemSchema],

  // Thống kê tài chính
  total_quantity: {
    type: Number,
    default: 0
  },
  subtotal_amount: {
    type: Number,
    required: true,
    default: 0
  },
  discount_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  final_amount: {
    type: Number,
    required: true,
    default: 0
  },

  // Thanh toán
  payment_method: {
    type: String,
    enum: ['CASH', 'TRANSFER', 'CARD', 'OTHER'],
    default: 'CASH'
  },
  amount_paid: {
    type: Number,
    default: 0
  },
  change_amount: {
    type: Number,
    default: 0
  },

  // Trạng thái hóa đơn
  status: {
    type: String,
    enum: ['completed', 'cancelled'],
    default: 'completed'
  },

  notes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

// Mã hóa đơn unique trong phạm vi từng tenant
salesOrderSchema.index({ tenant_id: 1, order_code: 1 }, { unique: true });
salesOrderSchema.index({ tenant_id: 1, createdAt: -1 });
salesOrderSchema.index({ tenant_id: 1, customer_id: 1 });

// Đăng ký Tenant Plugin
salesOrderSchema.plugin(tenantPlugin);

export default mongoose.model('SalesOrder', salesOrderSchema);
