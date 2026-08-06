import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  name: { type: String, default: 'Mẹ' },
  phone: { 
    type: String, 
    required: true, 
    unique: true 
  },
  baby_name: { type: String },
  baby_dob: { type: Date },
  edd: { type: Date }, 
  is_estimated_dob: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  source: { type: String, default: 'MANUAL_ENTRY' },
  customer_type: { type: String, enum: ['LEAD', 'BUYER'], default: 'LEAD' },

  // Trường mới — Refill & ZNS
  next_refill_date: { type: Date },
  last_purchased_product: { type: String },
  zns_enabled: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('Customer', customerSchema);
