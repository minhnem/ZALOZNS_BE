import { User } from '../models/User.model.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

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
        email: newUser.email
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

    const user = await User.findOne({ email });
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
        email: user.email
      },
      token
    });
  } catch (error) {
    console.error('Lỗi API Đăng nhập:', error);
    res.status(500).json({ message: 'Lỗi máy chủ nội bộ. Vui lòng thử lại.' });
  }
};
