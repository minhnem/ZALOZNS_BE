import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { User } from '../models/User.model.js';
import { runAsSuperAdmin } from '../utils/tenantContext.js';

dotenv.config();

const createSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    await runAsSuperAdmin(async () => {
      const email = 'admin@system.com';
      const existing = await User.findOne({ email });

    if (existing) {
      console.log('Super Admin đã tồn tại!');
      process.exit(0);
    }

    const password_hash = await bcrypt.hash('12345678', 10);
    const superAdmin = new User({
      fullName: 'System Admin',
      email,
      password_hash,
      is_super_admin: true,
      // KHÔNG CÓ tenant_id vì Super Admin không thuộc Shop nào
    });

    await superAdmin.save();
    console.log('Đã tạo Super Admin thành công!');
    console.log('Email: admin@system.com');
    console.log('Password: 12345678');
    
    });
  } catch (err) {
    console.error('Lỗi tạo Super Admin:', err);
  } finally {
    process.exit(0);
  }
};

createSuperAdmin();
