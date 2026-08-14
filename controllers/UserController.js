import { User } from '../models/User.model.js';
import bcrypt from 'bcrypt';
import { logActivity } from '../utils/auditLog.js';

export const getUsers = async (req, res) => {
  try {
    const users = await User.find().populate('role_id', 'name permissions');
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createUser = async (req, res) => {
  try {
    const { fullName, email, password, role_id } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email này đã được sử dụng.' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const newUser = new User({
      fullName,
      email,
      password_hash,
      role_id: role_id || undefined
    });
    await newUser.save();
    await logActivity(req.user?._id, 'CREATE', 'User', newUser._id, `Tạo tài khoản: ${fullName}`);
    res.status(201).json({ message: 'Tạo tài khoản thành công', user: newUser });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { role_id } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { role_id }, { new: true }).populate('role_id', 'name');
    await logActivity(req.user?._id, 'UPDATE', 'User', user._id, `Cập nhật vai trò cho: ${user.fullName}`);
    res.status(200).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

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
