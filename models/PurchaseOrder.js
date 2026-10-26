import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

/**
 * Item trong phiếu nhập kho
 */
const purchaseOrderItemSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Sản phẩm là bắt buộc']
  },
  product_name: {
    type: String,
    required: true
  },
  sku: {
    type: String,
    default: ''
  },
  unit: {
    type: String,
    default: 'Cái'
  },
  batch_number: {
    type: String,
    required: [true, 'Mã lô là bắt buộc'],
    trim: true
  },
  manufacturing_date: {
    type: Date
  },
  expiry_date: {
    type: Date,
    required: [true, 'Hạn sử dụng là bắt buộc']
  },
  quantity: {
    type: Number,
    required: [true, 'Số lượng nhập là bắt buộc'],
    min: [1, 'Số lượng nhập tối thiểu là 1']
  },
  cost_price: {
    type: Number,
    required: [true, 'Giá nhập là bắt buộc'],
    min: [0, 'Giá nhập không được âm']
  },
  total_price: {
    type: Number,
    required: true,
    min: 0
  },
  product_batch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductBatch'
  }
}, { _id: true });

/**
 * Model: PurchaseOrder (Phiếu Nhập Kho)
 * Quản lý đơn đặt hàng & phiếu nhập kho từ Nhà cung cấp
 */
const purchaseOrderSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Mã phiếu nhập là bắt buộc'],
    trim: true,
    uppercase: true
  },
  supplier_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: [true, 'Nhà cung cấp là bắt buộc'],
    index: true
  },
  supplier_name: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'confirmed', 'received', 'cancelled'],
    default: 'draft',
    index: true
    // draft: Bản nháp
    // confirmed: Đã xác nhận đặt hàng
    // received: Đã nhập kho (Tăng tồn kho & tạo Lô)
    // cancelled: Đã hủy
  },
  order_date: {
    type: Date,
    default: Date.now
  },
  expected_delivery_date: {
    type: Date
  },
  received_date: {
    type: Date
  },
  items: [purchaseOrderItemSchema],
  total_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  final_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  payment_status: {
    type: String,
    enum: ['unpaid', 'partially_paid', 'paid'],
    default: 'unpaid'
  },
  paid_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  payment_method: {
    type: String,
    enum: ['cash', 'bank_transfer', 'debt'],
    default: 'bank_transfer'
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  received_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Mã phiếu nhập unique theo tenant
purchaseOrderSchema.index({ tenant_id: 1, code: 1 }, { unique: true });
purchaseOrderSchema.index({ tenant_id: 1, supplier_id: 1, createdAt: -1 });
purchaseOrderSchema.index({ tenant_id: 1, status: 1, createdAt: -1 });

// Đăng ký Tenant Plugin
purchaseOrderSchema.plugin(tenantPlugin);

export default mongoose.model('PurchaseOrder', purchaseOrderSchema);
