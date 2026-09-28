import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

const auditLogSchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  action: { 
    type: String, 
    enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'OTHER'],
    required: true 
  },
  target_model: { 
    type: String, // e.g., 'Campaign', 'User'
    required: true 
  },
  target_id: { 
    type: mongoose.Schema.Types.ObjectId 
  },
  details: { 
    type: mongoose.Schema.Types.Mixed // Store old/new values or description
  }
}, { timestamps: true });

// Đăng ký Tenant Plugin
auditLogSchema.plugin(tenantPlugin);

export default mongoose.model('AuditLog', auditLogSchema);
