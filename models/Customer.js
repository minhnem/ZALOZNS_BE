import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

const customerSchema = new mongoose.Schema({
  name: { type: String, default: 'Mẹ' },
  phone: { 
    type: String, 
    required: true
  },
  baby_name: { type: String },
  baby_dob: { type: Date },
  edd: { type: Date }, 
  is_estimated_dob: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  source: { type: String, default: 'MANUAL_ENTRY' },
  kiotviet_id: { type: String, sparse: true },
  customer_type: { type: String, enum: ['LEAD', 'BUYER'], default: 'LEAD' },

  // Trường cũ (Deprecated) — Chuyển sang lấy dữ liệu từ Order
  next_refill_date: { type: Date },
  last_purchased_product: { type: String },
  
  // ZNS Config
  zns_enabled: { type: Boolean, default: true },
  
  // Tracking
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Multi-tenant: SĐT unique trong phạm vi từng shop
customerSchema.index({ tenant_id: 1, phone: 1 }, { unique: true });

// Đăng ký Tenant Plugin
customerSchema.plugin(tenantPlugin);

export default mongoose.model('Customer', customerSchema);
