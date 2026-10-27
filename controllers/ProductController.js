import * as XLSX from 'xlsx';
import Product from '../models/Product.js';
import ProductBatch from '../models/ProductBatch.js';
import Category from '../models/Category.js';
import StockMovement from '../models/StockMovement.js';
import { calculateBatchStatus } from '../services/batchExpiryService.js';
import { cleanKey, getCellValue, parseExcelDate } from '../utils/excelHelper.js';

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

// ═══════════════════════════════════════════════════
// XUẤT TOÀN BỘ THÔNG TIN SẢN PHẨM & LÔ HÀNG RA FILE EXCEL
// ═══════════════════════════════════════════════════
export const exportProductsExcel = async (req, res) => {
  try {
    const products = await Product.find()
      .populate('category_id', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const batches = await ProductBatch.find()
      .populate('product_id', 'name sku unit near_expiry_days')
      .sort({ expiry_date: 1 })
      .lean();

    const wb = XLSX.utils.book_new();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Sheet Danh sách sản phẩm (bao gồm đầy đủ tất cả thông tin)
    const productRows = products.map((p, idx) => {
      const stock = p.total_stock || 0;
      const cost = p.cost_price || 0;
      const sell = p.sell_price || 0;
      return {
        'STT': idx + 1,
        'Mã SKU': p.sku || '',
        'Mã vạch (Barcode)': p.barcode || '',
        'Mã KiotViet': p.kiotviet_code || '',
        'Tên sản phẩm': p.name || '',
        'Danh mục': p.category_id?.name || p.category || 'Khác',
        'Đơn vị tính': p.unit || 'Cái',
        'Giá vốn (VNĐ)': cost,
        'Giá bán (VNĐ)': sell,
        'Tổng tồn kho': stock,
        'Tổng giá trị vốn tồn (VNĐ)': stock * cost,
        'Tổng giá trị bán tồn (VNĐ)': stock * sell,
        'Chu kỳ sử dụng (ngày)': p.usage_cycle_days || 0,
        'Cảnh báo cận date (ngày)': p.near_expiry_days || 90,
        'Trạng thái': p.status === 'active' ? 'Đang kinh doanh' : 'Ngừng kinh doanh',
        'Mô tả': p.description || '',
        'Ngày tạo': p.createdAt ? new Date(p.createdAt).toLocaleDateString('vi-VN') : '',
        'Ngày cập nhật': p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('vi-VN') : ''
      };
    });

    const defaultProductHeader = {
      'STT': '',
      'Tên sản phẩm': '',
      'Mã SKU': '',
      'Mã vạch Barcode': '',
      'Mã KiotViet': '',
      'Danh mục': '',
      'Đơn vị tính': '',
      'Giá bán lẻ (VNĐ)': '',
      'Giá vốn (VNĐ)': '',
      'Tổng tồn kho': '',
      'Tổng giá trị tồn kho (VNĐ)': '',
      'Cảnh báo cận date (ngày)': '',
      'Trạng thái': '',
      'Mô tả': '',
      'Ngày tạo': '',
      'Ngày cập nhật': ''
    };
    const wsProducts = XLSX.utils.json_to_sheet(productRows.length > 0 ? productRows : [defaultProductHeader]);
    XLSX.utils.book_append_sheet(wb, wsProducts, 'Danh_Sach_San_Pham');

    // 2. Sheet Chi tiết lô hàng của các sản phẩm
    const batchRows = batches.map((b, idx) => {
      const exp = b.expiry_date ? new Date(b.expiry_date) : null;
      let daysLeft = null;
      if (exp) {
        exp.setHours(0, 0, 0, 0);
        daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      let statusText = 'Còn hạn';
      if (b.status === 'destroyed') {
        statusText = 'Đã xuất hủy';
      } else if (b.quantity_in_stock <= 0) {
        statusText = 'Đã hết hàng';
      } else if (daysLeft !== null && daysLeft <= 0) {
        statusText = 'Đã quá hạn';
      } else if (daysLeft !== null && daysLeft <= (b.product_id?.near_expiry_days || 90)) {
        statusText = `Cận date (${daysLeft} ngày)`;
      }

      const stockQty = b.quantity_in_stock || 0;
      const costPrice = b.cost_price || 0;

      return {
        'STT': idx + 1,
        'Tên sản phẩm': b.product_id?.name || '',
        'Mã SKU': b.product_id?.sku || '',
        'Mã lô hàng': b.batch_number || '',
        'Ngày sản xuất': b.manufacturing_date ? new Date(b.manufacturing_date).toLocaleDateString('vi-VN') : '',
        'Hạn sử dụng': exp ? exp.toLocaleDateString('vi-VN') : '',
        'Số ngày còn lại': daysLeft !== null ? daysLeft : '',
        'Tồn kho thực tế': stockQty,
        'Đơn vị tính': b.product_id?.unit || 'Cái',
        'Số lượng nhập ban đầu': b.quantity_received || 0,
        'Giá vốn của lô (VNĐ)': costPrice,
        'Tổng giá trị vốn lô (VNĐ)': stockQty * costPrice,
        'Trạng thái lô': statusText,
        'Ghi chú': b.notes || '',
        'Ngày nhập lô': b.createdAt ? new Date(b.createdAt).toLocaleDateString('vi-VN') : ''
      };
    });

    const defaultBatchHeader = {
      'STT': '',
      'Tên sản phẩm': '',
      'Mã SKU': '',
      'Mã lô hàng': '',
      'Ngày sản xuất': '',
      'Hạn sử dụng': '',
      'Số ngày còn lại': '',
      'Tồn kho thực tế': '',
      'Đơn vị tính': '',
      'Số lượng nhập ban đầu': '',
      'Giá vốn của lô (VNĐ)': '',
      'Tổng giá trị vốn lô (VNĐ)': '',
      'Trạng thái lô': '',
      'Ghi chú': '',
      'Ngày nhập lô': ''
    };
    const wsBatches = XLSX.utils.json_to_sheet(batchRows.length > 0 ? batchRows : [defaultBatchHeader]);
    XLSX.utils.book_append_sheet(wb, wsBatches, 'Chi_Tiet_Lo_Hang');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Danh_Sach_San_Pham_Va_Lo_Hang_${Date.now()}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting products excel:', error);
    res.status(500).json({ message: 'Lỗi khi xuất file Excel sản phẩm', error: error.message });
  }
};

// ═══════════════════════════════════════════════════
// TẢI FILE EXCEL MẪU NHẬP SẢN PHẨM
// ═══════════════════════════════════════════════════
export const downloadProductTemplate = async (req, res) => {
  try {
    const wb = XLSX.utils.book_new();

    const sampleRows = [
      {
        'Mã SKU': 'SP-MEIJI-0',
        'Tên sản phẩm (*)': 'Sữa Meiji Số 0 800g (0-12 tháng)',
        'Mã vạch (Barcode)': '4902705116542',
        'Mã KiotViet': 'SP00101',
        'Danh mục': 'Sữa công thức',
        'Đơn vị tính': 'Lon',
        'Giá vốn (VNĐ)': 450000,
        'Giá bán (VNĐ)': 520000,
        'Tồn kho ban đầu': 24,
        'Mã lô ban đầu': 'LOT-MEIJI-2610',
        'Ngày sản xuất (DD/MM/YYYY)': '10/01/2026',
        'Hạn sử dụng (DD/MM/YYYY)': '10/01/2028',
        'Chu kỳ sử dụng (ngày)': 20,
        'Cảnh báo cận date (ngày)': 90,
        'Mô tả': 'Sữa nội địa Nhật cho trẻ từ 0-1 tuổi'
      },
      {
        'Mã SKU': 'SP-MERRIES-M58',
        'Tên sản phẩm (*)': 'Bỉm dán Merries Size M 58 miếng',
        'Mã vạch (Barcode)': '4901301230875',
        'Mã KiotViet': 'SP00102',
        'Danh mục': 'Bỉm - Tã',
        'Đơn vị tính': 'Bịch',
        'Giá vốn (VNĐ)': 310000,
        'Giá bán (VNĐ)': 375000,
        'Tồn kho ban đầu': 15,
        'Mã lô ban đầu': 'LOT-MER-2610',
        'Ngày sản xuất (DD/MM/YYYY)': '01/02/2026',
        'Hạn sử dụng (DD/MM/YYYY)': '01/02/2029',
        'Chu kỳ sử dụng (ngày)': 25,
        'Cảnh báo cận date (ngày)': 90,
        'Mô tả': 'Bỉm dán Merries mềm thoáng, thấm hút tốt'
      },
      {
        'Mã SKU': 'SP-LINEABON-D3K2',
        'Tên sản phẩm (*)': 'Vitamin D3 K2 LineaBon Drops 10ml',
        'Mã vạch (Barcode)': '3830070470123',
        'Mã KiotViet': 'SP00103',
        'Danh mục': 'Thực phẩm bổ sung & Vitamin',
        'Đơn vị tính': 'Hộp',
        'Giá vốn (VNĐ)': 210000,
        'Giá bán (VNĐ)': 295000,
        'Tồn kho ban đầu': 30,
        'Mã lô ban đầu': 'LOT-D3K2-2610',
        'Ngày sản xuất (DD/MM/YYYY)': '15/03/2026',
        'Hạn sử dụng (DD/MM/YYYY)': '15/03/2028',
        'Chu kỳ sử dụng (ngày)': 45,
        'Cảnh báo cận date (ngày)': 90,
        'Mô tả': 'Bổ sung D3 K2 hấp thu canxi tối đa'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows);

    ws['!cols'] = [
      { wch: 18 },
      { wch: 35 },
      { wch: 18 },
      { wch: 14 },
      { wch: 25 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 16 },
      { wch: 18 },
      { wch: 25 },
      { wch: 25 },
      { wch: 22 },
      { wch: 24 },
      { wch: 40 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Mau_Nhap_San_Pham');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Mau_Nhap_San_Pham.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('Error downloading product template:', error);
    res.status(500).json({ message: 'Lỗi khi tải file mẫu sản phẩm', error: error.message });
  }
};

// ═══════════════════════════════════════════════════
// NHẬP SẢN PHẨM HÀNG LOẠT TỪ FILE EXCEL
// ═══════════════════════════════════════════════════
export const importProductsExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn file Excel để tải lên' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ message: 'File Excel không có trang tính nào' });
    }

    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
    if (!rows || rows.length === 0) {
      return res.status(400).json({ message: 'File Excel không có dòng dữ liệu nào' });
    }

    let createdCount = 0;
    let updatedCount = 0;
    const errors = [];
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIdx = i + 2;

      const name = String(getCellValue(row, 'Tên sản phẩm (*)', 'Tên sản phẩm', 'Ten san pham', 'name', 'product_name') || '').trim();
      if (!name) {
        errors.push(`Dòng ${rowIdx}: Bỏ qua vì thiếu tên sản phẩm`);
        continue;
      }

      const sku = String(getCellValue(row, 'Mã SKU', 'SKU', 'sku', 'product_sku') || '').trim();
      const barcode = String(getCellValue(row, 'Mã vạch (Barcode)', 'Mã vạch', 'Barcode', 'barcode') || '').trim();
      const kiotviet_code = String(getCellValue(row, 'Mã KiotViet', 'KiotViet Code', 'kiotviet_code') || '').trim();
      const categoryName = String(getCellValue(row, 'Danh mục', 'Category', 'category', 'Tên danh mục') || 'Khác').trim();
      const unit = String(getCellValue(row, 'Đơn vị tính', 'ĐVT', 'Unit', 'unit') || 'Cái').trim();
      const cost_price = Math.max(0, Number(getCellValue(row, 'Giá vốn (VNĐ)', 'Giá vốn', 'Gia von', 'cost_price') || 0));
      const sell_price = Math.max(0, Number(getCellValue(row, 'Giá bán (VNĐ)', 'Giá bán', 'Gia ban', 'sell_price') || 0));
      const usage_cycle_days = Math.max(1, Number(getCellValue(row, 'Chu kỳ sử dụng (ngày)', 'Chu kỳ', 'usage_cycle_days') || 30));
      const near_expiry_days = Math.max(1, Number(getCellValue(row, 'Cảnh báo cận date (ngày)', 'Cận date', 'near_expiry_days') || 90));
      const description = String(getCellValue(row, 'Mô tả', 'Description', 'description') || '').trim();

      // Xử lý danh mục
      let resolvedCategory = categoryName || 'Khác';
      let resolvedCatId = null;
      if (resolvedCategory) {
        let catDoc = await Category.findOne({ name: resolvedCategory });
        if (!catDoc && resolvedCategory !== 'Khác') {
          try {
            catDoc = await Category.create({ name: resolvedCategory, description: 'Tạo tự động từ import Excel' });
          } catch (e) {
            // bỏ qua lỗi nếu trùng
          }
        }
        if (catDoc) {
          resolvedCatId = catDoc._id;
          resolvedCategory = catDoc.name;
        }
      }

      // Tìm sản phẩm theo SKU -> Barcode -> Tên
      let product = null;
      if (sku) {
        product = await Product.findOne({ sku });
      }
      if (!product && barcode) {
        product = await Product.findOne({ barcode });
      }
      if (!product) {
        product = await Product.findOne({ name });
      }

      const isNew = !product;

      if (isNew) {
        product = new Product({
          name,
          sku: sku || undefined,
          barcode: barcode || undefined,
          kiotviet_code: kiotviet_code || undefined,
          category: resolvedCategory,
          category_id: resolvedCatId,
          unit,
          cost_price,
          sell_price,
          total_stock: 0,
          usage_cycle_days,
          near_expiry_days,
          description,
          status: 'active'
        });
      } else {
        if (sku) product.sku = sku;
        if (barcode) product.barcode = barcode;
        if (kiotviet_code) product.kiotviet_code = kiotviet_code;
        if (resolvedCatId) {
          product.category_id = resolvedCatId;
          product.category = resolvedCategory;
        }
        if (unit) product.unit = unit;
        if (cost_price > 0) product.cost_price = cost_price;
        if (sell_price > 0) product.sell_price = sell_price;
        if (usage_cycle_days > 0) product.usage_cycle_days = usage_cycle_days;
        if (near_expiry_days > 0) product.near_expiry_days = near_expiry_days;
        if (description) product.description = description;
      }

      await product.save();

      // Xử lý tồn kho ban đầu & lô nếu có khai báo
      const initialStock = Number(getCellValue(row, 'Tồn kho ban đầu', 'Tồn kho', 'Số lượng', 'initial_stock') || 0);
      let batchNumber = String(getCellValue(row, 'Mã lô ban đầu', 'Mã lô', 'Số lô', 'batch_number') || '').trim();
      const mfgDate = parseExcelDate(getCellValue(row, 'Ngày sản xuất (DD/MM/YYYY)', 'Ngày sản xuất', 'NSX', 'manufacturing_date'));
      const expDate = parseExcelDate(getCellValue(row, 'Hạn sử dụng (DD/MM/YYYY)', 'Hạn sử dụng', 'HSD', 'expiry_date'));

      if (initialStock > 0 || batchNumber || expDate) {
        const qty = initialStock > 0 ? initialStock : 0;
        if (!batchNumber) {
          batchNumber = `LOT-${todayStr}-${Math.floor(100 + Math.random() * 900)}`;
        }
        const finalExp = expDate || new Date(today.getFullYear() + 2, today.getMonth(), today.getDate());

        let batch = await ProductBatch.findOne({
          product_id: product._id,
          batch_number: batchNumber
        });

        if (batch) {
          if (qty > 0) {
            batch.quantity_received += qty;
            batch.quantity_in_stock += qty;
          }
          if (cost_price > 0) batch.cost_price = cost_price;
          if (mfgDate) batch.manufacturing_date = mfgDate;
          if (expDate) batch.expiry_date = expDate;
          batch.status = calculateBatchStatus(batch, product.near_expiry_days);
          batch.updated_by = req.user?._id;
          await batch.save();
        } else {
          batch = new ProductBatch({
            product_id: product._id,
            batch_number: batchNumber,
            manufacturing_date: mfgDate || null,
            expiry_date: finalExp,
            quantity_received: qty > 0 ? qty : 1,
            quantity_in_stock: qty,
            cost_price: cost_price > 0 ? cost_price : product.cost_price,
            created_by: req.user?._id
          });
          batch.status = calculateBatchStatus(batch, product.near_expiry_days);
          await batch.save();
        }

        // Ghi Sổ kho nếu có phát sinh số lượng tồn đầu
        if (qty > 0) {
          await StockMovement.create({
            product_id: product._id,
            batch_id: batch._id,
            batch_number: batchNumber,
            type: 'IN',
            quantity: qty,
            previous_stock: 0,
            current_stock: qty,
            unit_price: cost_price,
            total_value: qty * cost_price,
            reference_type: 'InitialImport',
            reference_code: `IMPORT-${todayStr}`,
            notes: 'Nhập tồn kho ban đầu từ file Excel',
            created_by: req.user?._id
          });
        }
      }

      if (isNew) {
        createdCount++;
      } else {
        updatedCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Nhập dữ liệu thành công! Thêm mới: ${createdCount}, Cập nhật: ${updatedCount} sản phẩm.`,
      data: {
        createdCount,
        updatedCount,
        totalRows: rows.length,
        errors
      }
    });
  } catch (error) {
    console.error('Error importing products excel:', error);
    res.status(500).json({ message: 'Lỗi khi nhập file Excel sản phẩm', error: error.message });
  }
};


