import { User } from '../models/User.model.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { deleteFileByUrl } from '../utils/cloudinary.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_please_change_in_production';

export const register = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

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

    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const newUser = new User({
      fullName,
      email,
      password_hash
    });
    await newUser.save();

    // Tự động đăng nhập luôn sau khi đăng ký thành công
    const token = jwt.sign(
      { id: newUser._id, email: newUser.email }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Đăng ký tài khoản thành công!',
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        avatar: newUser.avatar
      },
      token
    });
  } catch (error) {
    console.error('Lỗi API Đăng ký:', error);
    res.status(500).json({ message: 'Lỗi máy chủ nội bộ. Vui lòng thử lại.' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng cung cấp email và mật khẩu.' });
    }

    const user = await User.findOne({ email }).populate('role_id');
    if (!user) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác.' });
    }

    // Tạo JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email }, 
      JWT_SECRET, 
      { expiresIn: '7d' } // Token sống 7 ngày
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
      token
    });
  } catch (error) {
    console.error('Lỗi API Đăng nhập:', error);
    res.status(500).json({ message: 'Lỗi máy chủ nội bộ. Vui lòng thử lại.' });
  }
};

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
  }
};

export const getMe = async (req, res) => {
  try {
    const user = req.user; // Trích xuất từ middleware requireAuth
    res.status(200).json({
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar,
        role: user.role_id ? user.role_id.name : null,
        permissions: user.role_id ? user.role_id.permissions : []
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi máy chủ nội bộ' });
  }
};

