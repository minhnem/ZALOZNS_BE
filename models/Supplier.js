import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

/**
 * Model: Supplier (Nhà cung cấp)
 * Quản lý thông tin đối tác cung cấp hàng hóa cho chuỗi cửa hàng
 */
const supplierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên nhà cung cấp là bắt buộc'],
    trim: true
  },
  code: {
    type: String,
    trim: true,
    uppercase: true
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  address: {
    type: String,
    trim: true,
    default: ''
  },
  tax_code: {
    type: String,
    trim: true,
    default: ''
  },
  contact_person: {
    type: String,
    trim: true,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  total_purchases: {
    type: Number,
    default: 0,
    min: 0
  },
  purchase_count: {
    type: Number,
    default: 0,
    min: 0
  },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Mã nhà cung cấp unique theo từng tenant
supplierSchema.index(
  { tenant_id: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $exists: true, $type: "string", $gt: "" } } }
);
supplierSchema.index({ tenant_id: 1, name: 1 });

// Đăng ký Tenant Plugin
supplierSchema.plugin(tenantPlugin);

export default mongoose.model('Supplier', supplierSchema);
