import mongoose from 'mongoose';

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

export default mongoose.model('KiotVietConfig', kiotVietConfigSchema);
