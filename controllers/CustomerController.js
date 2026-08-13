import Customer from '../models/Customer.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import xlsx from 'xlsx';

function formatPhoneNumber(phone) {
  if (!phone) return null;
  let formatted = String(phone).trim().replace(/\D/g, ''); // Remove non-digits
  if (formatted.startsWith('0')) {
    formatted = '84' + formatted.slice(1);
  } else if (!formatted.startsWith('84')) {
    formatted = '84' + formatted; // fallback
  }
  return formatted;
}

// Function to convert Excel date (serial number) to JS Date or parse string
function parseExcelDate(dateVal) {
  if (!dateVal) return null;
  if (typeof dateVal === 'number') {
    // Excel date serial number (days since 1899-12-30)
    return new Date(Math.round((dateVal - 25569) * 86400 * 1000));
  }
  // Try parsing string DD/MM/YYYY
  if (typeof dateVal === 'string') {
    const parts = dateVal.split('/');
    if (parts.length === 3) {
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`);
    }
    return new Date(dateVal);
  }
  return null;
}

export const importCustomersExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // Read raw values first
    const rows = xlsx.utils.sheet_to_json(sheet, { raw: true, defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({ message: 'File Excel rỗng' });
    }

    let successCount = 0;
    let newCustomersCount = 0;
    let newOrdersCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Map column headers
      const rawPhone = row['Số điện thoại'];
      const name = row['Tên khách hàng'] || '';
      const rawEdd = row['Ngày dự sinh'];
      const rawBabyDob = row['Ngày sinh bé'];
      const productName = row['Tên sản phẩm mua'];
      const rawQuantity = row['Số lượng'];
      const rawPurchaseDate = row['Ngày mua'];

      const phone = formatPhoneNumber(rawPhone);
      
      // Skip rows with no valid phone or no product name
      if (!phone || !productName) {
        continue;
      }

      const edd = parseExcelDate(rawEdd);
      const baby_dob = parseExcelDate(rawBabyDob);
      const purchase_date = parseExcelDate(rawPurchaseDate) || new Date();
      const quantity = parseInt(rawQuantity, 10) || 1;

      // 1. Upsert Customer
      let customer = await Customer.findOne({ phone });
      if (!customer) {
        customer = new Customer({
          name: name || 'Khách hàng',
          phone,
          edd,
          baby_dob,
          status: 'active'
        });
        await customer.save();
        newCustomersCount++;
      } else {
        // Update info if provided and not null
        let isModified = false;
        if (name && !customer.name) { customer.name = name; isModified = true; }
        if (edd && !customer.edd) { customer.edd = edd; isModified = true; }
        if (baby_dob && !customer.baby_dob) { customer.baby_dob = baby_dob; isModified = true; }
        if (isModified) await customer.save();
      }

      // 2. Upsert Product
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

      // 3. Create Order
      const newOrder = new Order({
        customer_id: customer._id,
        product_id: product._id,
        product_name: product.name,
        purchase_date: purchase_date,
        quantity: quantity,
        amount: product.price || 0
      });
      
      await newOrder.save();
      newOrdersCount++;
      successCount++;
    }

    res.status(200).json({ 
      message: 'Import dữ liệu thành công',
      data: {
        totalRowsProcessed: successCount,
        newCustomers: newCustomersCount,
        newOrders: newOrdersCount
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
      customer = new Customer({ name, phone, baby_name, baby_dob, edd, is_estimated_dob, status });
      await customer.save();
    } else {
      customer.name = name || customer.name;
      customer.baby_name = baby_name || customer.baby_name;
      customer.baby_dob = baby_dob || customer.baby_dob;
      customer.edd = edd || customer.edd;
      if (is_estimated_dob !== undefined) customer.is_estimated_dob = is_estimated_dob;
      if (status !== undefined) customer.status = status;
      await customer.save();
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
            await existingOrder.save();
          } else {
            const newOrder = new Order({
              customer_id: customer._id,
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
    let customers = await Customer.find(filter).sort({ createdAt: -1 }).lean();
    
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
      { name, phone, baby_name, baby_dob, edd, is_estimated_dob, status },
      { returnDocument: 'after' }
    );

    if (!updatedCustomer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

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

    res.status(200).json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
