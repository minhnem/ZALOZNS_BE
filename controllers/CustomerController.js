import Customer from '../models/Customer.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import xlsx from 'xlsx';
import { logActivity } from '../utils/auditLog.js';

// Helper to clean key for comparison
function cleanKey(str) {
  return String(str || '').toLowerCase().replace(/[\s\-_.,;:]/g, '');
}

// Flexible cell value extractor supporting multiple header names
function getCellValue(row, ...keys) {
  if (!row || typeof row !== 'object') return '';
  const rowKeys = Object.keys(row);
  for (const expected of keys) {
    const cleanExp = cleanKey(expected);
    for (const actual of rowKeys) {
      if (cleanKey(actual) === cleanExp) {
        const val = row[actual];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
  }
  return '';
}

function formatPhoneNumber(phone) {
  if (!phone) return null;
  let formatted = String(phone).trim().replace(/\D/g, ''); // Remove non-digits
  if (!formatted) return null;

  // Nếu số bắt đầu bằng 0 (ví dụ 0912345678 -> 84912345678)
  if (formatted.startsWith('0')) {
    formatted = '84' + formatted.slice(1);
  } else if (formatted.startsWith('84')) {
    // Đã có mã 84, giữ nguyên
  } else if (formatted.length === 9) {
    // Trường hợp Excel định dạng kiểu số làm mất số 0 ở đầu (ví dụ 912345678 -> 84912345678)
    formatted = '84' + formatted;
  }

  // Số điện thoại Việt Nam hợp lệ: 84 + 9 chữ số = 11 ký tự (hoặc 10-12 ký tự)
  if (formatted.length < 10 || formatted.length > 12) {
    return null;
  }
  return formatted;
}

// Function to convert Excel date (serial number) to JS Date or parse string
function parseExcelDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
  if (typeof dateVal === 'number') {
    // Excel date serial number (days since 1899-12-30)
    return new Date(Math.round((dateVal - 25569) * 86400 * 1000));
  }
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (!trimmed) return null;

    // Check format DD/MM/YYYY or DD-MM-YYYY
    const dmy = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const month = parseInt(dmy[2], 10) - 1;
      const year = parseInt(dmy[3], 10);
      return new Date(Date.UTC(year, month, day));
    }

    // Check format YYYY-MM-DD
    const ymd = trimmed.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (ymd) {
      const year = parseInt(ymd[1], 10);
      const month = parseInt(ymd[2], 10) - 1;
      const day = parseInt(ymd[3], 10);
      return new Date(Date.UTC(year, month, day));
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export const importCustomersExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn file Excel hoặc CSV để tải lên' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ message: 'File Excel không có trang tính (sheet) nào' });
    }

    const sheet = workbook.Sheets[sheetName];
    // Read raw values first
    const rows = xlsx.utils.sheet_to_json(sheet, { raw: true, defval: '' });

    if (!rows || rows.length === 0) {
      return res.status(400).json({ message: 'File Excel rỗng, không tìm thấy dữ liệu' });
    }

    let successCount = 0;
    let newCustomersCount = 0;
    let updatedCustomersCount = 0;
    let newOrdersCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Map column headers linh hoạt (hỗ trợ nhiều cách viết tên cột)
      const rawPhone = getCellValue(row, 'Số điện thoại', 'SĐT', 'SDT', 'Điện thoại', 'Phone', 'Mobile');
      const name = getCellValue(row, 'Tên khách hàng', 'Họ tên', 'Tên', 'Customer Name', 'Name') || 'Mẹ';
      const rawEdd = getCellValue(row, 'Ngày dự sinh', 'Dự sinh', 'EDD', 'Due Date');
      const rawBabyDob = getCellValue(row, 'Ngày sinh bé', 'Ngày sinh', 'Sinh nhật bé', 'Baby DOB', 'DOB');
      const babyName = getCellValue(row, 'Tên bé', 'Tên con', 'Baby Name');
      const productName = getCellValue(row, 'Tên sản phẩm mua', 'Tên sản phẩm', 'Sản phẩm', 'Product');
      const rawQuantity = getCellValue(row, 'Số lượng', 'SL', 'Quantity');
      const rawPurchaseDate = getCellValue(row, 'Ngày mua', 'Ngày mua hàng', 'Purchase Date', 'Order Date');

      const phone = formatPhoneNumber(rawPhone);
      
      // Bỏ qua dòng nếu không có số điện thoại hợp lệ
      if (!phone) {
        skippedCount++;
        continue;
      }

      const edd = parseExcelDate(rawEdd);
      const baby_dob = parseExcelDate(rawBabyDob);
      const purchase_date = parseExcelDate(rawPurchaseDate) || new Date();
      const quantity = parseInt(rawQuantity, 10) || 1;

      // 1. Upsert Customer (luôn tạo/cập nhật khách hàng dù có mua sản phẩm hay không)
      let customer = await Customer.findOne({ phone });
      if (!customer) {
        customer = new Customer({
          name: name || 'Mẹ',
          phone,
          edd: edd || undefined,
          baby_dob: baby_dob || undefined,
          baby_name: babyName || undefined,
          status: 'active',
          source: 'EXCEL_IMPORT',
          customer_type: productName ? 'BUYER' : 'LEAD',
          created_by: req.user?._id,
          updated_by: req.user?._id
        });
        await customer.save();
        await logActivity(req.user?._id, 'CREATE', 'Customer', customer._id, `Tạo khách hàng qua import Excel`);
        newCustomersCount++;
      } else {
        // Cập nhật thông tin nếu có dữ liệu mới
        let isModified = false;
        if (name && (!customer.name || customer.name === 'Mẹ' || customer.name === 'Khách hàng')) {
          customer.name = name;
          isModified = true;
        }
        if (edd && !customer.edd) { customer.edd = edd; isModified = true; }
        if (baby_dob && !customer.baby_dob) { customer.baby_dob = baby_dob; isModified = true; }
        if (babyName && !customer.baby_name) { customer.baby_name = babyName; isModified = true; }
        if (productName && customer.customer_type !== 'BUYER') {
          customer.customer_type = 'BUYER';
          isModified = true;
        }
        if (isModified) {
          customer.updated_by = req.user?._id;
          await customer.save();
          updatedCustomersCount++;
        }
      }

      // 2. Nếu có thông tin sản phẩm -> Tạo Product & Order
      if (productName) {
        let product = await Product.findOne({ name: productName });
        if (!product) {
          product = new Product({
            name: productName,
            category: 'Khác',
            usage_cycle_days: 30, // Default 30 days
            status: 'active'
          });
          await product.save();
        }

        const newOrder = new Order({
          customer_id: customer._id,
          product_id: product._id,
          product_name: product.name,
          purchase_date: purchase_date,
          quantity: quantity,
          amount: product.sell_price || product.price || 0,
          created_by: req.user?._id,
          updated_by: req.user?._id
        });
        
        await newOrder.save();
        await logActivity(req.user?._id, 'CREATE', 'Order', newOrder._id, `Tạo đơn hàng qua import Excel`);
        newOrdersCount++;
      }

      successCount++;
    }

    if (successCount === 0) {
      return res.status(400).json({
        message: 'Không có dòng dữ liệu nào được import. Vui lòng kiểm tra lại cột "Số điện thoại" trong file (phải chứa số điện thoại hợp lệ).'
      });
    }

    res.status(200).json({ 
      message: `Import thành công ${successCount} dòng (Khách mới: ${newCustomersCount}, Cập nhật: ${updatedCustomersCount}, Đơn hàng: ${newOrdersCount}). Bỏ qua: ${skippedCount} dòng do thiếu SĐT.`,
      data: {
        totalRowsProcessed: successCount,
        newCustomers: newCustomersCount,
        updatedCustomers: updatedCustomersCount,
        newOrders: newOrdersCount,
        skippedRows: skippedCount
      }
    });

  } catch (error) {
    console.error('Error importing Excel:', error);
    res.status(500).json({ message: 'Lỗi server khi import dữ liệu', error: error.message });
  }
};

export const createCustomer = async (req, res) => {
  try {
    const { name, phone, baby_name, baby_dob, edd, is_estimated_dob, status, orders } = req.body;
    
    // 1. Create or Find Customer
    let customer = await Customer.findOne({ phone });
    if (!customer) {
      customer = new Customer({ name, phone, baby_name, baby_dob, edd, is_estimated_dob, status, created_by: req.user?._id, updated_by: req.user?._id });
      await customer.save();
      await logActivity(req.user?._id, 'CREATE', 'Customer', customer._id, `Tạo khách hàng mới`);
    } else {
      customer.name = name || customer.name;
      customer.baby_name = baby_name || customer.baby_name;
      customer.baby_dob = baby_dob || customer.baby_dob;
      customer.edd = edd || customer.edd;
      if (is_estimated_dob !== undefined) customer.is_estimated_dob = is_estimated_dob;
      if (status !== undefined) customer.status = status;
      customer.updated_by = req.user?._id;
      await customer.save();
      await logActivity(req.user?._id, 'UPDATE', 'Customer', customer._id, `Cập nhật khách hàng khi thêm đơn`);
    }

    // 2. Process multiple orders
    if (orders && Array.isArray(orders)) {
      for (const orderData of orders) {
        if (orderData.product_name) {
          let product = await Product.findOne({ name: orderData.product_name });
          if (!product) {
            product = new Product({
              name: orderData.product_name,
              category: 'Khác',
              usage_cycle_days: 30,
              status: 'active'
            });
            await product.save();
          }

          const existingOrder = await Order.findOne({ customer_id: customer._id, product_id: product._id });
          if (existingOrder) {
            existingOrder.purchase_date = orderData.purchase_date ? new Date(orderData.purchase_date) : new Date();
            existingOrder.quantity = orderData.quantity || 1;
            existingOrder.updated_by = req.user?._id;
            await existingOrder.save();
            await logActivity(req.user?._id, 'UPDATE', 'Order', existingOrder._id, `Cập nhật đơn hàng`);
          } else {
            const newOrder = new Order({
              customer_id: customer._id,
              product_id: product._id,
              product_name: product.name,
              purchase_date: orderData.purchase_date ? new Date(orderData.purchase_date) : new Date(),
              quantity: orderData.quantity || 1,
              amount: product.price || 0,
              created_by: req.user?._id,
              updated_by: req.user?._id
            });
            await newOrder.save();
            await logActivity(req.user?._id, 'CREATE', 'Order', newOrder._id, `Tạo đơn hàng mới`);
          }
        }
      }
    }

    res.status(201).json({ message: 'Thêm khách hàng thành công' });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const getCustomers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) {
      filter.customer_type = req.query.type;
    }
    
    // Tìm khách hàng
    let customers = await Customer.find(filter)
      .sort({ createdAt: -1 })
      .populate('created_by', 'fullName')
      .populate('updated_by', 'fullName')
      .lean();
    
    // Lấy ID của tất cả khách hàng
    const customerIds = customers.map(c => c._id);
    
    // Lấy tất cả Order liên quan
    const orders = await Order.find({ customer_id: { $in: customerIds } }).sort({ expected_refill_date: 1 }).lean();
    
    // Ghép Order vào mảng purchased_products
    customers = customers.map(customer => {
      const customerOrders = orders.filter(o => o.customer_id.toString() === customer._id.toString());
      
      // Group by product_name to only show the latest order per product name (handles duplicate product IDs with same name)
      const productMap = new Map();
      customerOrders
        .filter(o => o.expected_refill_date)
        .forEach(o => {
           const key = o.product_name ? o.product_name.trim().toLowerCase() : 'unknown';
           const existing = productMap.get(key);
           if (!existing || new Date(o.expected_refill_date) > new Date(existing.expected_refill_date)) {
               productMap.set(key, o);
           }
        });

      const purchased_products = Array.from(productMap.values()).map(o => ({
         product_name: o.product_name,
         expected_refill_date: o.expected_refill_date
      }));

      return {
        ...customer,
        orders: customerOrders,
        purchased_products
      };
    });

    res.status(200).json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, baby_name, baby_dob, edd, is_estimated_dob, status, orders } = req.body;

    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      { name, phone, baby_name, baby_dob, edd, is_estimated_dob, status, updated_by: req.user?._id },
      { returnDocument: 'after' }
    );

    if (!updatedCustomer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    await logActivity(req.user?._id, 'UPDATE', 'Customer', updatedCustomer._id, `Cập nhật khách hàng`);

    if (orders && Array.isArray(orders)) {
      for (const orderData of orders) {
        if (orderData.product_name) {
          let product = await Product.findOne({ name: orderData.product_name });
          if (!product) {
            product = new Product({
              name: orderData.product_name,
              category: 'Khác',
              usage_cycle_days: 30,
              status: 'active'
            });
            await product.save();
          }

          const existingOrder = await Order.findOne({ customer_id: updatedCustomer._id, product_id: product._id });
          if (existingOrder) {
            existingOrder.purchase_date = orderData.purchase_date ? new Date(orderData.purchase_date) : new Date();
            existingOrder.quantity = orderData.quantity || 1;
            await existingOrder.save();
          } else {
            const newOrder = new Order({
              customer_id: updatedCustomer._id,
              product_id: product._id,
              product_name: product.name,
              purchase_date: orderData.purchase_date ? new Date(orderData.purchase_date) : new Date(),
              quantity: orderData.quantity || 1,
              amount: product.price || 0
            });
            await newOrder.save();
          }
        }
      }
    }

    res.status(200).json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedCustomer = await Customer.findByIdAndDelete(id);

    if (!deletedCustomer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    await logActivity(req.user?._id, 'DELETE', 'Customer', id, `Xóa khách hàng`);

    res.status(200).json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const bulkDeleteCustomers = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID khách hàng không hợp lệ' });
    }
    const result = await Customer.deleteMany({ _id: { $in: ids } });
    await Order.deleteMany({ customer_id: { $in: ids } });
    res.status(200).json({
      message: `Đã xóa thành công ${result.deletedCount} khách hàng`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error bulk deleting customers:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
