import Category from '../models/Category.js';
import Product from '../models/Product.js';

/**
 * Controller: Category (Quản lý Danh mục phân cấp)
 */

/**
 * Chuyển đổi danh sách phẳng thành cấu trúc cây cha - con
 */
function buildCategoryTree(categories, parentId = null) {
  const branch = [];
  for (const cat of categories) {
    const catParentId = cat.parent_id ? String(cat.parent_id._id || cat.parent_id) : null;
    const targetParentId = parentId ? String(parentId) : null;

    if (catParentId === targetParentId) {
      const catObj = cat.toObject ? cat.toObject() : { ...cat };
      const children = buildCategoryTree(categories, cat._id);
      if (children.length > 0) {
        catObj.children = children;
      }
      branch.push(catObj);
    }
  }
  return branch;
}

// GET /api/categories
export const getCategories = async (req, res) => {
  try {
    const { search, tree = 'true', status } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      filter.name = { $regex: search.trim(), $options: 'i' };
    }

    const categories = await Category.find(filter)
      .populate('parent_id', 'name')
      .sort({ order: 1, createdAt: 1 });

    // Đếm số lượng sản phẩm liên kết với từng danh mục
    const matchTenant = req.user?.tenant_id ? { tenant_id: req.user.tenant_id, category_id: { $ne: null } } : { category_id: { $ne: null } };
    const counts = await Product.aggregate([
      { $match: matchTenant },
      { $group: { _id: '$category_id', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    counts.forEach(c => {
      if (c._id) countMap[String(c._id)] = c.count;
    });

    const categoriesWithCount = categories.map(cat => {
      const obj = cat.toObject ? cat.toObject() : { ...cat };
      obj.product_count = countMap[String(cat._id)] || 0;
      return obj;
    });

    // Nếu search đang kích hoạt hoặc không yêu cầu dạng cây -> trả về danh sách phẳng
    if (search || tree === 'false') {
      return res.status(200).json(categoriesWithCount);
    }

    // Mặc định trả về cấu trúc cây phân cấp
    const treeData = buildCategoryTree(categoriesWithCount, null);
    res.status(200).json({
      tree: treeData,
      flat: categoriesWithCount
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách danh mục', error: error.message });
  }
};

// GET /api/categories/:id
export const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).populate('parent_id', 'name');
    if (!category) {
      return res.status(404).json({ message: 'Không tìm thấy danh mục' });
    }
    res.status(200).json(category);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết danh mục', error: error.message });
  }
};

// POST /api/categories
export const createCategory = async (req, res) => {
  try {
    const { name, parent_id, description, status, order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Tên danh mục là bắt buộc' });
    }

    // Nếu có parent_id, kiểm tra danh mục cha tồn tại
    if (parent_id) {
      const parent = await Category.findById(parent_id);
      if (!parent) {
        return res.status(404).json({ message: 'Danh mục cha không tồn tại' });
      }
    }

    // Kiểm tra trùng tên trong cùng cấp cha
    const duplicate = await Category.findOne({
      name: name.trim(),
      parent_id: parent_id || null
    });
    if (duplicate) {
      return res.status(400).json({ message: `Danh mục "${name.trim()}" đã tồn tại trong nhóm này` });
    }

    const category = new Category({
      name: name.trim(),
      parent_id: parent_id || null,
      description: description || '',
      status: status || 'active',
      order: Number(order) || 0,
      created_by: req.user?._id
    });

    const saved = await category.save();
    const populated = await Category.findById(saved._id).populate('parent_id', 'name');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/categories/:id
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parent_id, description, status, order } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Không tìm thấy danh mục' });
    }

    // Ngăn chặn chọn chính nó làm cha
    if (parent_id && String(parent_id) === String(id)) {
      return res.status(400).json({ message: 'Một danh mục không thể chọn chính nó làm danh mục cha' });
    }

    if (name) category.name = name.trim();
    if (parent_id !== undefined) category.parent_id = parent_id || null;
    if (description !== undefined) category.description = description;
    if (status) category.status = status;
    if (order !== undefined) category.order = Number(order) || 0;
    category.updated_by = req.user?._id;

    const saved = await category.save();
    const populated = await Category.findById(saved._id).populate('parent_id', 'name');

    res.status(200).json(populated);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/categories/:id
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Kiểm tra có danh mục con không
    const childCount = await Category.countDocuments({ parent_id: id });
    if (childCount > 0) {
      return res.status(400).json({
        message: `Không thể xóa danh mục này vì đang có ${childCount} danh mục con. Vui lòng xóa hoặc di chuyển các danh mục con trước.`
      });
    }

    // 2. Kiểm tra có sản phẩm nào thuộc danh mục này không
    const productCount = await Product.countDocuments({ category_id: id });
    if (productCount > 0) {
      return res.status(400).json({
        message: `Không thể xóa danh mục này vì đang có ${productCount} sản phẩm liên kết.`
      });
    }

    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy danh mục' });
    }

    res.status(200).json({ message: 'Đã xóa danh mục thành công' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: 'Lỗi khi xóa danh mục', error: error.message });
  }
};

export const bulkDeleteCategories = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID danh mục không hợp lệ' });
    }
    let deletedCount = 0;
    const skipped = [];

    for (const catId of ids) {
      const cat = await Category.findById(catId);
      if (!cat) continue;

      const childCount = await Category.countDocuments({ parent_id: catId });
      if (childCount > 0) {
        skipped.push({ name: cat.name, reason: `Có ${childCount} danh mục con` });
        continue;
      }

      const productCount = await Product.countDocuments({ category_id: catId });
      if (productCount > 0) {
        skipped.push({ name: cat.name, reason: `Đang có ${productCount} sản phẩm liên kết` });
        continue;
      }

      await Category.findByIdAndDelete(catId);
      deletedCount++;
    }

    let msg = `Đã xóa thành công ${deletedCount} danh mục.`;
    if (skipped.length > 0) {
      msg += ` Bỏ qua ${skipped.length} danh mục (${skipped.map(s => `"${s.name}": ${s.reason}`).join('; ')}).`;
    }

    res.status(200).json({
      message: msg,
      deletedCount,
      skippedCount: skipped.length,
      skipped
    });
  } catch (error) {
    console.error('Error bulk deleting categories:', error);
    res.status(500).json({ message: 'Lỗi khi xóa nhiều danh mục', error: error.message });
  }
};
