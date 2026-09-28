import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Họ tên là bắt buộc'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email là bắt buộc'],
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email không hợp lệ']
  },
  password_hash: {
    type: String,
    required: [true, 'Mật khẩu là bắt buộc']
  },
  avatar: {
    type: String,
    default: ''
  },
  role_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  },
  // Multi-tenant: Super Admin không thuộc tenant nào
  is_super_admin: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Multi-tenant: Email unique trong phạm vi từng shop (không unique toàn cục nữa)
userSchema.index({ tenant_id: 1, email: 1 }, { unique: true });

// Đăng ký Tenant Plugin
userSchema.plugin(tenantPlugin);

export const User = mongoose.model('User', userSchema);
