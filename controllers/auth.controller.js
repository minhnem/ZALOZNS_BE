import { User } from '../models/User.model.js';
import Tenant from '../models/Tenant.js';
import Role from '../models/Role.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { deleteFileByUrl } from '../utils/cloudinary.js';
import { runAsSuperAdmin, runWithTenant } from '../utils/tenantContext.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_please_change_in_production';

/**
 * ĐĂNG KÝ MỚI (Tạo Shop + Owner)
 * 
 * Luồng:
 * 1. Validate input
 * 2. Kiểm tra email đã tồn tại chưa (toàn hệ thống - bypass plugin)
 * 3. Tạo Tenant (Shop)
 * 4. Chạy trong context của tenant mới:
 *    - Tạo Role "Admin" mặc định với permissions: ['*']
 *    - Tạo User Owner (tenant_id tự động gắn bởi plugin)
 * 5. Cập nhật Tenant.owner_id
 * 6. Gen JWT chứa tenant_id
 */
export const register = async (req, res) => {
  try {
    const { fullName, email, password, shopName } = req.body;

    // Validate
    if (!email || !password || !fullName) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
    }

    // Kiểm tra email đã tồn tại chưa (toàn hệ thống, bypass tenant plugin)
    const existingUser = await runAsSuperAdmin(async () => {
      return await User.findOne({ email });
    });
    if (existingUser) {
      return res.status(409).json({ message: 'Email này đã được sử dụng.' });
    }

    // 1. Tạo Tenant (Shop) - Model Tenant KHÔNG có tenantPlugin nên không cần context
    const tenant = new Tenant({
      name: shopName || `Shop của ${fullName}`,
      status: 'trial',
      plan: 'free',
      trial_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 ngày trial
    });
    await tenant.save();

    // 2. Chạy trong context của tenant mới để plugin tự gắn tenant_id
    let newUser;
    let adminRole;

    await runWithTenant(tenant._id, async () => {
      // Tạo Role Admin mặc định
      adminRole = new Role({
        name: 'Admin',
        description: 'Quản trị viên cửa hàng - Toàn quyền',
        permissions: ['*'],
        // tenant_id sẽ được tenantPlugin tự động gắn
      });
      await adminRole.save();

      // Tạo User Owner
      const saltRounds = 10;
      const password_hash = await bcrypt.hash(password, saltRounds);

      newUser = new User({
        fullName,
        email,
        password_hash,
        role_id: adminRole._id,
        // tenant_id sẽ được tenantPlugin tự động gắn
      });
      await newUser.save();
    });

    // 3. Cập nhật owner_id cho Tenant
    tenant.owner_id = newUser._id;
    await tenant.save();

    // 4. Gen JWT chứa tenant_id
    const token = jwt.sign(
      { 
        id: newUser._id, 
        email: newUser.email, 
        tenant_id: tenant._id 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Đăng ký tài khoản và tạo cửa hàng thành công!',
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        avatar: newUser.avatar,
        role: 'Admin',
        permissions: ['*']
      },
      tenant: {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan
      },
      token
    });
  } catch (error) {
    console.error('Lỗi API Đăng ký:', error);
    res.status(500).json({ message: 'Lỗi máy chủ nội bộ. Vui lòng thử lại.' });
  }
};

/**
 * ĐĂNG NHẬP
 * 
 * Luồng Multi-tenant:
 * 1. Tìm user theo email (bypass plugin vì chưa có context)
 * 2. Verify password
 * 3. Kiểm tra tenant status (không cho đăng nhập nếu shop bị khóa)
 * 4. Gen JWT chứa tenant_id (hoặc is_super_admin)
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng cung cấp email và mật khẩu.' });
    }

    // Tìm user toàn hệ thống (bypass tenant plugin)
    const user = await runAsSuperAdmin(async () => {
      return await User.findOne({ email }).populate('role_id');
    });

    if (!user) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác.' });
    }

    // Super Admin login
    if (user.is_super_admin) {
      const token = jwt.sign(
        { id: user._id, email: user.email, is_super_admin: true },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        message: 'Đăng nhập Super Admin thành công!',
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          avatar: user.avatar,
          is_super_admin: true,
          role: 'Super Admin',
          permissions: ['*']
        },
        tenant: null, // Super Admin không thuộc tenant nào
        token
      });
    }

    // User thường - kiểm tra tenant
    if (!user.tenant_id) {
      return res.status(403).json({ message: 'Tài khoản chưa được gán vào cửa hàng nào.' });
    }

    // Kiểm tra trạng thái tenant
    const tenant = await runAsSuperAdmin(async () => {
      return await Tenant.findById(user.tenant_id);
    });

    if (!tenant) {
      return res.status(403).json({ message: 'Cửa hàng không tồn tại hoặc đã bị xóa.' });
    }

    if (tenant.status === 'suspended') {
      return res.status(403).json({ message: 'Cửa hàng đã bị tạm khóa. Vui lòng liên hệ quản trị viên hệ thống.' });
    }

    if (tenant.status === 'expired') {
      return res.status(403).json({ message: 'Gói dịch vụ đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.' });
    }

    // Gen JWT cho user thường (chứa tenant_id)
    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        tenant_id: user.tenant_id 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Đăng nhập thành công!',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar,
        role: user.role_id ? user.role_id.name : null,
        permissions: user.role_id ? user.role_id.permissions : []
      },
      tenant: {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan
      },
      token
    });
  } catch (error) {
    console.error('Lỗi API Đăng nhập:', error);
    res.status(500).json({ message: 'Lỗi máy chủ nội bộ. Vui lòng thử lại.' });
  }
};

/**
 * CẬP NHẬT HỒ SƠ
 * Giữ nguyên logic, tenantPlugin sẽ tự filter khi findById.
 */
export const updateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, avatar } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại.' });
    }

    if (avatar && user.avatar && avatar !== user.avatar) {
      try {
        await deleteFileByUrl(user.avatar);
      } catch (err) {
        console.error('Lỗi khi xóa ảnh cũ:', err);
      }
    }

    if (fullName) user.fullName = fullName;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    res.status(200).json({
      message: 'Cập nhật hồ sơ thành công!',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Lỗi API Cập nhật hồ sơ:', error);
    res.status(500).json({ message: 'Lỗi máy chủ nội bộ.' });
  }
};

/**
 * LẤY THÔNG TIN USER HIỆN TẠI
 * Bổ sung: Trả thêm thông tin tenant (shop)
 */
export const getMe = async (req, res) => {
  try {
    const user = req.user;
    
    // Lấy thông tin tenant
    let tenantInfo = null;
    if (user.tenant_id && !user.is_super_admin) {
      const tenant = await runAsSuperAdmin(async () => {
        return await Tenant.findById(user.tenant_id);
      });
      if (tenant) {
        tenantInfo = {
          id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          plan: tenant.plan
        };
      }
    }

    res.status(200).json({
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar,
        is_super_admin: user.is_super_admin || false,
        role: user.role_id ? user.role_id.name : null,
        permissions: user.role_id ? user.role_id.permissions : []
      },
      tenant: tenantInfo
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi máy chủ nội bộ' });
  }
};

/**
 * ĐỔI MẬT KHẨU
 * Giữ nguyên logic, tenantPlugin sẽ tự filter khi findById.
 */
export const changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại.' });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' });
    }

    const saltRounds = 10;
    const password_hash = await bcrypt.hash(newPassword, saltRounds);

    user.password_hash = password_hash;
    await user.save();

    res.status(200).json({ message: 'Đổi mật khẩu thành công!' });
  } catch (error) {
    console.error('Lỗi API Đổi mật khẩu:', error);
    res.status(500).json({ message: 'Lỗi máy chủ nội bộ.' });
  }
};
