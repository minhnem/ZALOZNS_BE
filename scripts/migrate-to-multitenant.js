import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

// Import Models
import { User } from '../models/User.model.js';
import Tenant from '../models/Tenant.js';
import Role from '../models/Role.js';
import Customer from '../models/Customer.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Campaign from '../models/Campaign.js';
import ZaloOAConfig from '../models/ZaloOAConfig.js';
import ZaloZNS from '../models/ZaloZNS.js';
import ZnsTemplate from '../models/ZnsTemplate.js';
import ZnsLog from '../models/ZnsLog.js';
import { ActivityLog } from '../models/ActivityLog.model.js';
import AuditLog from '../models/AuditLog.js';
import KiotVietConfig from '../models/KiotVietConfig.js';

import { runAsSuperAdmin } from '../utils/tenantContext.js';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Mọi thao tác phải chạy trong Super Admin context để bypass tenant plugin
    await runAsSuperAdmin(async () => {
      // 1. Tạo Default Tenant (Shop mặc định)
      let defaultTenant = await Tenant.findOne({ name: 'Shop Mặc Định (Hệ thống cũ)' });
      if (!defaultTenant) {
        defaultTenant = new Tenant({
          name: 'Shop Mặc Định (Hệ thống cũ)',
          status: 'active',
          plan: 'enterprise', // Gắn gói cao nhất cho khách hàng cũ
        });
        await defaultTenant.save();
        console.log(`✅ Đã tạo Tenant mặc định: ${defaultTenant._id}`);
      } else {
        console.log(`⚡ Tenant mặc định đã tồn tại: ${defaultTenant._id}`);
      }

      // 1.5. Xoá index cũ bị lỗi và Dọn dẹp dữ liệu cũ bị "null"
      try {
        await Product.collection.dropIndex('tenant_id_1_kiotviet_code_1');
      } catch (e) {
        // Bỏ qua nếu index chưa tồn tại
      }
      
      await Product.collection.updateMany(
        { $or: [{ kiotviet_code: null }, { kiotviet_code: "" }] },
        { $unset: { kiotviet_code: "" } }
      );
      // Tương tự với Customer.kiotviet_id nếu có
      await Customer.collection.updateMany(
        { $or: [{ kiotviet_id: null }, { kiotviet_id: "" }] },
        { $unset: { kiotviet_id: "" } }
      );

      // 2. Migrate tất cả Collections
      const models = [
        { name: 'User', model: User },
        { name: 'Role', model: Role },
        { name: 'Customer', model: Customer },
        { name: 'Product', model: Product },
        { name: 'Order', model: Order },
        { name: 'Campaign', model: Campaign },
        { name: 'ZaloOAConfig', model: ZaloOAConfig },
        { name: 'ZaloZNS', model: ZaloZNS },
        { name: 'ZnsTemplate', model: ZnsTemplate },
        { name: 'ZnsLog', model: ZnsLog },
        { name: 'ActivityLog', model: ActivityLog },
        { name: 'AuditLog', model: AuditLog },
        { name: 'KiotVietConfig', model: KiotVietConfig }
      ];

      console.log('🔄 Đang cập nhật dữ liệu (gắn tenant_id)...');
      for (const { name, model } of models) {
        const result = await model.updateMany(
          { tenant_id: { $exists: false } },
          { $set: { tenant_id: defaultTenant._id } }
        );
        console.log(`  - ${name}: đã cập nhật ${result.modifiedCount} bản ghi`);
      }

      // 3. Set Owner cho Tenant mặc định
      if (!defaultTenant.owner_id) {
        const firstUser = await User.findOne({ tenant_id: defaultTenant._id }).sort({ createdAt: 1 });
        if (firstUser) {
          defaultTenant.owner_id = firstUser._id;
          await defaultTenant.save();
          console.log(`✅ Đã set Owner cho Tenant mặc định: ${firstUser.email}`);
        }
      }

      // 4. Tạo Super Admin (Không thuộc tenant nào)
      let superAdmin = await User.findOne({ email: 'admin@system.com' });
      if (!superAdmin) {
        const password_hash = await bcrypt.hash('12345678', 10);
        superAdmin = new User({
          fullName: 'Super Admin',
          email: 'admin@system.com',
          password_hash,
          is_super_admin: true,
          // KHÔNG set tenant_id để có quyền xuyên suốt
        });
        await superAdmin.save();
        console.log('✅ Đã tạo Super Admin: admin@system.com / pass: 12345678');
      } else {
        console.log('⚡ Super Admin đã tồn tại');
      }
    });

    console.log('\n🎉 MIGRATION HOÀN TẤT!');
    process.exit(0);
  } catch (error) {
    console.error('❌ LỖI MIGRATION:', error);
    process.exit(1);
  }
};

migrate();
