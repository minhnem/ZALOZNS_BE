import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên cửa hàng là bắt buộc'],
    trim: true
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Trạng thái & Gói cước
  status: {
    type: String,
    enum: ['active', 'suspended', 'trial', 'expired'],
    default: 'trial'
  },
  plan: {
    type: String,
    enum: ['free', 'basic', 'pro', 'enterprise'],
    default: 'free'
  },
  trial_expires_at: {
    type: Date
  },

  // Giới hạn theo gói
  max_users: {
    type: Number,
    default: 3
  },
  max_customers: {
    type: Number,
    default: 500
  },
  max_zns_per_month: {
    type: Number,
    default: 1000
  },

  // Thông tin liên hệ shop
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  }
}, { timestamps: true });

// Tự động tạo slug từ tên shop nếu chưa có
tenantSchema.pre('save', function () {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  // Bỏ dấu tiếng Việt
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')     // Bỏ ký tự đặc biệt
      .replace(/\s+/g, '-')             // Thay khoảng trắng bằng dấu gạch
      .replace(/-+/g, '-')              // Gộp nhiều dấu gạch liên tiếp
      .replace(/^-|-$/g, '')            // Bỏ dấu gạch đầu/cuối
      + '-' + Date.now().toString(36);  // Thêm hậu tố unique
  }
});

// NOTE: Model này KHÔNG áp dụng tenantPlugin
// vì Tenant là bảng gốc, không thuộc về tenant nào.

export default mongoose.model('Tenant', tenantSchema);
