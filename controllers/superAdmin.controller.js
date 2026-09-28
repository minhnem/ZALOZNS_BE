import Tenant from '../models/Tenant.js';
import { User } from '../models/User.model.js';
import Campaign from '../models/Campaign.js';
import Order from '../models/Order.js';
import Role from '../models/Role.js';
import bcrypt from 'bcrypt';
import { runWithTenant, runAsSuperAdmin } from '../utils/tenantContext.js';

// Lấy danh sách tất cả các Tenant (Shop)
export const getTenants = async (req, res) => {
  try {
    const tenants = await Tenant.find().populate('owner_id', 'fullName email').sort({ createdAt: -1 });
    res.json(tenants);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ message: 'Lỗi server khi tải danh sách Shop' });
  }
};

/**
 * TẠO SHOP MỚI + TÀI KHOẢN ADMIN (Super Admin dùng)
 * 
 * Luồng:
 * 1. Validate input
 * 2. Kiểm tra email đã tồn tại chưa
 * 3. Tạo Tenant (Shop)
 * 4. Chạy trong context tenant mới:
 *    - Tạo Role "Admin" (toàn quyền)
 *    - Tạo User Admin
 * 5. Cập nhật Tenant.owner_id
 */
export const createTenantWithAdmin = async (req, res) => {
  let tenant = null; // Khai báo ở ngoài để rollback nếu lỗi

  try {
    const { shopName, fullName, email, password, phone, address, plan, status } = req.body;

    // Validate
    if (!shopName || !fullName || !email || !password) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ: Tên Shop, Họ tên, Email, Mật khẩu.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
    }

    // Kiểm tra email đã tồn tại chưa (toàn hệ thống)
    const existingUser = await runAsSuperAdmin(async () => {
      return await User.findOne({ email });
    });
    if (existingUser) {
      return res.status(409).json({ message: 'Email này đã được sử dụng bởi tài khoản khác.' });
    }

    // 1. Tạo Tenant (Shop)
    tenant = new Tenant({
      name: shopName,
      status: status || 'active',
      plan: plan || 'free',
      phone: phone || '',
      address: address || '',
    });
    await tenant.save();

    // 2. Chạy trong context tenant mới để tạo Role + User
    let newUser;
    let adminRole;

    await runWithTenant(tenant._id, async () => {
      // Tạo Role Admin mặc định
      adminRole = new Role({
        name: 'Admin',
        description: 'Quản trị viên cửa hàng - Toàn quyền',
        permissions: ['*'],
      });
      await adminRole.save();

      // Tạo User Admin
      const password_hash = await bcrypt.hash(password, 10);
      newUser = new User({
        fullName,
        email,
        password_hash,
        role_id: adminRole._id,
      });
      await newUser.save();
    });

    // 3. Cập nhật owner_id
    tenant.owner_id = newUser._id;
    await tenant.save();

    res.status(201).json({
      message: `Tạo Shop "${shopName}" và tài khoản Admin thành công!`,
      tenant: {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
      },
      admin: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
      }
    });
  } catch (error) {
    console.error('Lỗi tạo Shop + Admin:', error);

    // ROLLBACK: Nếu Tenant đã được tạo nhưng các bước sau lỗi → xóa Tenant mồ côi
    if (tenant && tenant._id) {
      try {
        // Xóa Role + User vừa tạo (nếu có) trong context tenant
        await runWithTenant(tenant._id, async () => {
          await Role.deleteMany({});
          await User.deleteMany({});
        });
        // Xóa Tenant
        await Tenant.findByIdAndDelete(tenant._id);
        console.log(`[Rollback] Đã xóa Tenant mồ côi: ${tenant.name}`);
      } catch (rollbackErr) {
        console.error('[Rollback] Lỗi khi rollback:', rollbackErr);
      }
    }

    res.status(500).json({ message: `Lỗi server khi tạo Shop: ${error.message}` });
  }
};

// Đổi trạng thái Shop (VD: Khoá / Mở)
export const updateTenantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['active', 'suspended', 'trial', 'expired'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    const tenant = await Tenant.findByIdAndUpdate(id, { status }, { new: true });
    if (!tenant) return res.status(404).json({ message: 'Không tìm thấy Shop' });
    
    res.json(tenant);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server khi cập nhật trạng thái' });
  }
};

// Đổi gói cước Shop
export const updateTenantPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { plan } = req.body;
    
    if (!['free', 'basic', 'pro'].includes(plan)) {
      return res.status(400).json({ message: 'Gói cước không hợp lệ' });
    }

    const tenant = await Tenant.findByIdAndUpdate(id, { plan }, { new: true });
    if (!tenant) return res.status(404).json({ message: 'Không tìm thấy Shop' });
    
    res.json(tenant);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server khi cập nhật gói cước' });
  }
};

// Cập nhật thông tin Shop (Tenant) chung
export const updateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const allowedUpdates = ['name', 'phone', 'address', 'plan', 'status', 'max_users', 'max_customers', 'max_zns_per_month'];
    const updateData = {};
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updateData[key] = req.body[key];
      }
    }
    
    const tenant = await Tenant.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!tenant) return res.status(404).json({ message: 'Không tìm thấy Shop' });
    
    res.json(tenant);
  } catch (error) {
    console.error('Error updating tenant:', error);
    res.status(500).json({ message: 'Lỗi server khi cập nhật Shop' });
  }
};

// Xoá Shop (Tenant)
export const deleteTenant = async (req, res) => {
  try {
    const { id } = req.params;
    
    const tenant = await Tenant.findByIdAndDelete(id);
    if (!tenant) return res.status(404).json({ message: 'Không tìm thấy Shop' });
    
    // Xoá tất cả Users thuộc Shop này
    await User.deleteMany({ tenant_id: id });
    
    res.json({ message: 'Xoá Shop thành công' });
  } catch (error) {
    console.error('Error deleting tenant:', error);
    res.status(500).json({ message: 'Lỗi server khi xoá Shop' });
  }
};

// Thống kê tổng quan cho Super Admin
export const getSystemStats = async (req, res) => {
  try {
    const totalTenants = await Tenant.countDocuments();
    const activeTenants = await Tenant.countDocuments({ status: 'active' });
    const totalUsers = await User.countDocuments();
    const totalCampaigns = await Campaign.countDocuments();
    const totalOrders = await Order.countDocuments();

    res.json({
      totalTenants,
      activeTenants,
      totalUsers,
      totalCampaigns,
      totalOrders
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy thống kê hệ thống' });
  }
};
