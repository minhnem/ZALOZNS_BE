import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

const zaloOAConfigSchema = new mongoose.Schema({
  oa_id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  oa_name: { type: String, required: true },
  app_id: { type: String },
  secret_key: { type: String },
  access_token: { type: String },
  refresh_token: { type: String },
  token_expires_at: { type: Date },
  is_connected: { type: Boolean, default: false },
  webhook_verified: { type: Boolean, default: false }
}, { timestamps: true });

// Đăng ký Tenant Plugin
zaloOAConfigSchema.plugin(tenantPlugin);

export default mongoose.model('ZaloOAConfig', zaloOAConfigSchema);
