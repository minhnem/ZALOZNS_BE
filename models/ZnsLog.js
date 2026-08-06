import mongoose from 'mongoose';

const znsLogSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  phoneSent: { type: String, required: true },
  stage: { type: String, enum: ['PREGNANCY', 'BABY'] },
  weekAge: { type: Number },
  znsTemplateId: { type: String },
  sentAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['success', 'failed'], required: true },
  zaloMessageId: { type: String }, 
  errorMessage: { type: String },

  // Trường mới — Campaign tracking
  campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  trigger_type: { type: String, enum: ['CRON_AUTO', 'MANUAL_TRIGGER'], default: 'CRON_AUTO' }
}, { timestamps: true });

export default mongoose.model('ZnsLog', znsLogSchema);
