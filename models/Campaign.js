import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Tên chiến dịch là bắt buộc'], 
    trim: true 
  },
  type: { 
    type: String, 
    enum: ['LIFECYCLE', 'PRODUCT_REFILL', 'ENCOURAGE_PURCHASE', 'ONE_OFF_PROMO', 'PROMOTION', 'BIRTHDAY'],
    default: 'PRODUCT_REFILL'
  },
  status: { 
    type: String, 
    enum: ['active', 'scheduled', 'paused', 'completed', 'draft'], 
    default: 'draft' 
  },

  // Cấu hình thời gian
  is_auto_run: { type: Boolean, default: false },
  start_time: { type: Date },
  end_time: { type: Date },
  recurring_schedule: { type: String, default: '' },

  // Cấu hình kịch bản
  target_condition: {
    type: { 
      type: String, 
      enum: ['all', 'product', 'baby_age', 'refill_date'], 
      default: 'refill_date' 
    },
    value: { type: String, default: '3 ngày' }
  },

  zns_template_id: { type: String },

  // Sản phẩm liên kết — dùng cho chiến dịch PRODUCT_REFILL
  product_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product' 
  },

  // Bộ lọc loại trừ (Dùng để tách tệp)
  exclude_refill_today: { type: Boolean, default: false },

  dynamic_data: {
    type: Map,
    of: String,
    default: {}
  }
}, { timestamps: true });

export default mongoose.model('Campaign', campaignSchema);
