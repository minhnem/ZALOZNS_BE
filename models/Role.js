import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Tên vai trò là bắt buộc'], 
    unique: true,
    trim: true 
  },
  description: { 
    type: String 
  },
  permissions: [{ 
    type: String 
  }]
}, { timestamps: true });

export default mongoose.model('Role', roleSchema);
