import mongoose from 'mongoose';

const znsTemplateSchema = new mongoose.Schema({
  template_id: { 
    type: String, 
    required: true, 
    unique: true 
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
  }
}, { timestamps: true });

export default mongoose.model('ZnsTemplate', znsTemplateSchema);
