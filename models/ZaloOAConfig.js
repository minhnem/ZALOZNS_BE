import mongoose from 'mongoose';

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
  token_expires_at: { type: Date }
}, { timestamps: true });

export default mongoose.model('ZaloOAConfig', zaloOAConfigSchema);
