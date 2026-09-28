import { User } from '../models/User.model.js';
import Tenant from '../models/Tenant.js';
import bcrypt from 'bcrypt';
import { logActivity } from '../utils/auditLog.js';
import { runAsSuperAdmin } from '../utils/tenantContext.js';

/**
 * Lấy danh sách Users (trong shop hiện tại)
 * Plugin tự động filter theo tenant_id
 */
export const getUsers = async (req, res) => {
  try {
    const users = await User.find().populate('role_id', 'name permissions');
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * TẠO NHÂN VIÊN MỚI (Thêm user vào shop hiện tại)
 * 
 * Luồng:
 * 1. Kiểm tra email chưa tồn tại (toàn hệ thống - vì email unique toàn cục)
 * 2. Kiểm tra giới hạn max_users của shop
 * 3. Tạo User mới (tenant_id tự động gắn bởi plugin)
 */
export const createUser = async (req, res) => {
  try {
    const { fullName, email, password, role_id } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
    }

    // Kiểm tra email toàn hệ thống (bypass plugin vì email unique toàn cục)
    const existingUser = await runAsSuperAdmin(async () => {
      return await User.findOne({ email });
    });
    if (existingUser) {
      return res.status(409).json({ message: 'Email này đã được sử dụng.' });
    }

    // Kiểm tra giới hạn số lượng user của shop
    const tenantId = req.user.tenant_id;
    const tenant = await runAsSuperAdmin(async () => {
      return await Tenant.findById(tenantId);
    });
    if (tenant) {
      const currentUserCount = await User.countDocuments();
      if (currentUserCount >= tenant.max_users) {
        return res.status(403).json({ 
          message: `Cửa hàng đã đạt giới hạn ${tenant.max_users} tài khoản. Vui lòng nâng gói để thêm nhân viên.` 
        });
      }
    }

    const password_hash = await bcrypt.hash(password, 10);
    const newUser = new User({
      fullName,
      email,
      password_hash,
      role_id: role_id || undefined
      // tenant_id sẽ được tenantPlugin tự động gắn
    });
    await newUser.save();
    await logActivity(req.user?._id, 'CREATE', 'User', newUser._id, `Tạo tài khoản: ${fullName}`);
    res.status(201).json({ message: 'Tạo tài khoản thành công', user: newUser });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * Cập nhật vai trò user
 * Plugin tự động filter - chỉ update user trong cùng shop
 */
export const updateUserRole = async (req, res) => {
  try {
    const { role_id } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { role_id }, { new: true }).populate('role_id', 'name');
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    }
    await logActivity(req.user?._id, 'UPDATE', 'User', user._id, `Cập nhật vai trò cho: ${user.fullName}`);
    res.status(200).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * Xóa user
 * Plugin tự động filter - chỉ xóa user trong cùng shop
 */
export const deleteUser = async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (deletedUser) {
      await logActivity(req.user?._id, 'DELETE', 'User', req.params.id, `Xóa tài khoản: ${deletedUser.fullName}`);
    }
    res.status(200).json({ message: 'Đã xóa người dùng' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
