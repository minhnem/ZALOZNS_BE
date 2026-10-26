import Product from '../models/Product.js';
import Category from '../models/Category.js';

export const getProducts = async (req, res) => {
  try {
    const products = await Product.find().populate('category_id', 'name parent_id').sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category_id', 'name parent_id');
    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
    res.status(200).json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const createProduct = async (req, res) => {
  try {
    const {
      name,
      category,
      category_id,
      usage_cycle_days,
      status,
      sku,
      barcode,
      unit,
      sell_price,
      cost_price,
      total_stock,
      description,
      image_url,
      near_expiry_days
    } = req.body;

    let resolvedCategory = category || 'Khác';
    let resolvedCatId = category_id || null;

    if (resolvedCatId) {
      const catDoc = await Category.findById(resolvedCatId);
      if (catDoc) {
        resolvedCategory = catDoc.name;
      }
    } else if (category && category !== 'Khác') {
      const catDoc = await Category.findOne({ name: category });
      if (catDoc) {
        resolvedCatId = catDoc._id;
      }
    }

    const product = new Product({
      name,
      category: resolvedCategory,
      category_id: resolvedCatId,
      usage_cycle_days: usage_cycle_days || 30,
      status: status || 'active',
      sku,
      barcode,
      unit: unit || 'Cái',
      sell_price: sell_price || 0,
      cost_price: cost_price || 0,
      total_stock: total_stock || 0,
      description: description || '',
      image_url: image_url || '',
      near_expiry_days: near_expiry_days || 90
    });

    const saved = await product.save();
    const populated = await Product.findById(saved._id).populate('category_id', 'name parent_id');
    res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(400).json({ message: error.message });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.category_id) {
      const catDoc = await Category.findById(updateData.category_id);
      if (catDoc) {
        updateData.category = catDoc.name;
      }
    } else if (updateData.category) {
      const catDoc = await Category.findOne({ name: updateData.category });
      if (catDoc) {
        updateData.category_id = catDoc._id;
      }
    }

    const updated = await Product.findByIdAndUpdate(id, updateData, { returnDocument: 'after', runValidators: true })
      .populate('category_id', 'name parent_id');
    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(400).json({ message: error.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Product.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
    res.status(200).json({ message: 'Đã xóa sản phẩm thành công' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const bulkDeleteProducts = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID sản phẩm không hợp lệ' });
    }
    const result = await Product.deleteMany({ _id: { $in: ids } });
    res.status(200).json({
      message: `Đã xóa thành công ${result.deletedCount} sản phẩm`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error bulk deleting products:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
