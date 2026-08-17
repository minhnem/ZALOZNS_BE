import Role from '../models/Role.js';
import { logActivity } from '../utils/auditLog.js';

export const getRoles = async (req, res) => {
  try {
    const roles = await Role.find();
    res.status(200).json(roles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createRole = async (req, res) => {
  try {
    const newRole = new Role(req.body);
    await newRole.save();
    await logActivity(req.user?._id, 'CREATE', 'Role', newRole._id, `Tạo nhóm quyền mới: ${newRole.name}`);
    res.status(201).json(newRole);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateRole = async (req, res) => {
  try {
    const updated = await Role.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (updated) {
      await logActivity(req.user?._id, 'UPDATE', 'Role', updated._id, `Cập nhật nhóm quyền: ${updated.name}`);
    }
    res.status(200).json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteRole = async (req, res) => {
  try {
    const deletedRole = await Role.findByIdAndDelete(req.params.id);
    if (deletedRole) {
      await logActivity(req.user?._id, 'DELETE', 'Role', req.params.id, `Xóa nhóm quyền: ${deletedRole.name}`);
    }
    res.status(200).json({ message: 'Đã xóa vai trò' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
