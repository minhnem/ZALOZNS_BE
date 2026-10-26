import Supplier from '../models/Supplier.js';
import PurchaseOrder from '../models/PurchaseOrder.js';

/**
 * Controller: Supplier (Quản lý Nhà cung cấp)
 */

// GET /api/suppliers
export const getSuppliers = async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { code: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { contact_person: { $regex: q, $options: 'i' } }
      ];
    }

    const suppliers = await Supplier.find(filter).sort({ createdAt: -1 });
    res.status(200).json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách nhà cung cấp', error: error.message });
  }
};

// GET /api/suppliers/:id
export const getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp' });
    }

    // Lấy thêm 10 phiếu nhập gần nhất
    const recentOrders = await PurchaseOrder.find({ supplier_id: supplier._id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({ supplier, recentOrders });
  } catch (error) {
    console.error('Error fetching supplier details:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết nhà cung cấp', error: error.message });
  }
};

// POST /api/suppliers
export const createSupplier = async (req, res) => {
  try {
    const { name, code, phone, email, address, tax_code, contact_person, notes, status } = req.body;

    // Sinh mã tự động nếu chưa có
    let supplierCode = code ? code.trim().toUpperCase() : null;
    if (!supplierCode) {
      const count = await Supplier.countDocuments();
      supplierCode = `NCC-${String(count + 1).padStart(3, '0')}`;
    }

    const supplier = new Supplier({
      name,
      code: supplierCode,
      phone,
      email,
      address,
      tax_code,
      contact_person,
      notes,
      status: status || 'active',
      created_by: req.user?._id
    });

    const saved = await supplier.save();
    res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating supplier:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Mã nhà cung cấp đã tồn tại trong hệ thống' });
    }
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/suppliers/:id
export const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body, updated_by: req.user?._id };

    if (updateData.code) {
      updateData.code = updateData.code.trim().toUpperCase();
    }

    const updated = await Supplier.findByIdAndUpdate(id, updateData, {
      returnDocument: 'after',
      runValidators: true
    });

    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp' });
    }

    res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating supplier:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Mã nhà cung cấp đã tồn tại' });
    }
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/suppliers/:id
export const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra xem đã có phiếu nhập kho nào liên kết chưa
    const poCount = await PurchaseOrder.countDocuments({ supplier_id: id });
    if (poCount > 0) {
      return res.status(400).json({
        message: `Không thể xóa nhà cung cấp này vì đã có ${poCount} phiếu nhập kho liên kết. Hãy chuyển trạng thái sang "Ngừng hợp tác" (inactive).`
      });
    }

    const deleted = await Supplier.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp' });
    }

    res.status(200).json({ message: 'Đã xóa nhà cung cấp thành công' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ message: 'Lỗi khi xóa nhà cung cấp', error: error.message });
  }
};

export const bulkDeleteSuppliers = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID nhà cung cấp không hợp lệ' });
    }
    let deletedCount = 0;
    const skipped = [];

    for (const supId of ids) {
      const sup = await Supplier.findById(supId);
      if (!sup) continue;

      const poCount = await PurchaseOrder.countDocuments({ supplier_id: supId });
      if (poCount > 0) {
        skipped.push({ name: sup.name, reason: `Đã có ${poCount} phiếu nhập kho liên kết` });
        continue;
      }

      await Supplier.findByIdAndDelete(supId);
      deletedCount++;
    }

    let msg = `Đã xóa thành công ${deletedCount} nhà cung cấp.`;
    if (skipped.length > 0) {
      msg += ` Bỏ qua ${skipped.length} NCC (${skipped.map(s => `"${s.name}": ${s.reason}`).join('; ')}).`;
    }

    res.status(200).json({
      message: msg,
      deletedCount,
      skippedCount: skipped.length,
      skipped
    });
  } catch (error) {
    console.error('Error bulk deleting suppliers:', error);
    res.status(500).json({ message: 'Lỗi khi xóa nhiều nhà cung cấp', error: error.message });
  }
};
