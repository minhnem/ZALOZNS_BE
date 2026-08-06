import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Tên sản phẩm là bắt buộc'], 
    trim: true 
  },
  category: { 
    type: String, 
    required: true,
    enum: ['Bỉm - Tã', 'Sữa công thức', 'Đồ dùng vệ sinh', 'Khác']
  },
  usage_cycle_days: { 
    type: Number, 
    required: [true, 'Chu kỳ sử dụng là bắt buộc'], 
    min: 1, 
    max: 365 
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive'], 
    default: 'active' 
  }
}, { timestamps: true });

export default mongoose.model('Product', productSchema);
