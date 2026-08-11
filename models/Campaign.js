import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Tên chiến dịch là bắt buộc'], 
    trim: true 
  },
  type: { 
    type: String, 
    enum: ['LIFECYCLE', 'PRODUCT_REFILL', 'ENCOURAGE_PURCHASE', 'ONE_OFF_PROMO', 'PROMOTION', 'BIRTHDAY', 'MASTER_CAMPAIGN'],
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

  // Nhóm đối tượng mục tiêu (Target Audience)
  target_audience: {
    audience_type: { 
      type: String, 
      enum: ['ALL', 'LEAD', 'PREGNANT', 'BABY', 'BOUGHT_PRODUCT', 'REFILL_DUE', 'CUSTOM'], 
      default: 'ALL' 
    },
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    refill_days_left: { type: Number }, 
    baby_age_months_min: { type: Number },
    baby_age_months_max: { type: Number },
    customer_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }]
  },

  // Cấu hình kịch bản nhắc mua lại
  refill_reminder_days: { type: Number, default: 0 },

  // Cấu hình kịch bản mốc thời gian (dành cho vòng đời)
  milestones: [{
    stage: { type: String, enum: ['PREGNANCY', 'BABY'] },
    time_unit: { type: String, enum: ['DAY', 'WEEK', 'MONTH'], default: 'MONTH' },
    time_value: { type: Number },
    zns_template_id: { type: String },
    dynamic_data: { type: Map, of: String, default: {} }
  }],

  // Cấu hình các sự kiện con (Sub-events) cho Campaign Scheduler
  sub_events: [{
    name: { type: String, required: true },
    execute_time: { type: Date, required: true },
    zns_template_id: { type: String, required: true },
    exclude_converted: { type: Boolean, default: false },
    dynamic_data: { type: Map, of: String, default: {} }
  }],

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
