import mongoose from 'mongoose';

const znsLogSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  phoneSent: { type: String, required: true },
  stage: { type: String, enum: ['PREGNANCY', 'BABY'], required: true },
  weekAge: { type: Number, required: true },
  znsTemplateId: { type: String },
  sentAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['success', 'failed'], required: true },
  zaloMessageId: { type: String }, 
  errorMessage: { type: String }   
}, { timestamps: true });

export default mongoose.model('ZnsLog', znsLogSchema);
