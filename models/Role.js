import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

const roleSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Tên vai trò là bắt buộc'], 
    trim: true 
  },
  description: { 
    type: String 
  },
  permissions: [{ 
    type: String 
  }]
}, { timestamps: true });

// Multi-tenant: Tên role unique trong phạm vi từng shop
roleSchema.index({ tenant_id: 1, name: 1 }, { unique: true });

// Đăng ký Tenant Plugin
roleSchema.plugin(tenantPlugin);

export default mongoose.model('Role', roleSchema);
