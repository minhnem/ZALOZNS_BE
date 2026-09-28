import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

const kiotVietConfigSchema = new mongoose.Schema({
  retailer: {
    type: String,
    required: true,
  },
  clientId: {
    type: String,
    required: true,
  },
  clientSecret: {
    type: String,
    required: true,
  },
  accessToken: {
    type: String,
  },
  expiresIn: {
    type: Number,
  },
  tokenCreatedAt: {
    type: Date,
  }
}, { timestamps: true });

// Đăng ký Tenant Plugin
kiotVietConfigSchema.plugin(tenantPlugin);

export default mongoose.model('KiotVietConfig', kiotVietConfigSchema);
