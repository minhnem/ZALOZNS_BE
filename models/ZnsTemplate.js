import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

const znsTemplateSchema = new mongoose.Schema({
  template_id: { 
    type: String, 
    required: true
  },
  name: { 
    type: String, 
    required: [true, 'Tên template là bắt buộc'], 
    trim: true 
  },
  status: { 
    type: String, 
    enum: ['APPROVED', 'PENDING', 'REJECTED'], 
    default: 'PENDING' 
  },
  type: { 
    type: String, 
    default: 'CSKH' 
  },
  price: { 
    type: Number, 
    default: 0 
  },
  content: { 
    type: String, 
    default: '' 
  },
  params: [{
    name:  { type: String, required: true },
    label: { type: String, required: true },
    type:  { type: String, enum: ['SYSTEM', 'CUSTOM', 'LIFECYCLE'], default: 'CUSTOM' }
  }],
  last_synced_at: { 
    type: Date 
  },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Multi-tenant: template_id unique trong phạm vi từng shop
znsTemplateSchema.index({ tenant_id: 1, template_id: 1 }, { unique: true });

// Đăng ký Tenant Plugin
znsTemplateSchema.plugin(tenantPlugin);

export default mongoose.model('ZnsTemplate', znsTemplateSchema);
