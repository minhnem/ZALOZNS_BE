import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

const productSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Tên sản phẩm là bắt buộc'], 
    trim: true 
  },
  category: { 
    type: String, 
    required: true,
    enum: ['Bỉm - Tã', 'Sữa công thức', 'Đồ dùng vệ sinh', 'Khác']
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
