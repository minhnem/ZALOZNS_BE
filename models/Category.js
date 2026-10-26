import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

/**
 * Model: Category (Danh Mục Sản Phẩm Phân Cấp Cha - Con)
 */
const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên danh mục là bắt buộc'],
    trim: true
  },
  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
    index: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  order: {
    type: Number,
    default: 0
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Index phục vụ tìm kiếm và quản lý phân cấp
categorySchema.index({ tenant_id: 1, parent_id: 1, order: 1 });
categorySchema.index({ tenant_id: 1, name: 1 });

// Đăng ký Tenant Plugin
categorySchema.plugin(tenantPlugin);

export default mongoose.model('Category', categorySchema);
