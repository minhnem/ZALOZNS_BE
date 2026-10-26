import mongoose from 'mongoose';
import SalesOrder from '../models/SalesOrder.js';
import ProductBatch from '../models/ProductBatch.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Order from '../models/Order.js';
import StockMovement from '../models/StockMovement.js';
import Tenant from '../models/Tenant.js';

/**
 * Service: POS Service (Bán hàng tại quầy & Thuật toán FEFO)
 */

/**
 * Sinh mã hóa đơn bán lẻ duy nhất theo ngày: HD-YYMMDD-XXXX
 */
export async function generateOrderCode() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePrefix = `HD-${year}${month}${day}`;

  // Đếm số đơn trong ngày để sinh số thứ tự
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const countToday = await SalesOrder.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });

  const seq = String(countToday + 1).padStart(4, '0');
  return `${datePrefix}-${seq}`;
}

/**
 * Lấy danh sách các lô hàng còn tồn theo thuật toán FEFO (First Expired, First Out)
 * Sắp xếp: Hạn sử dụng gần nhất lên trước (expiry_date: 1)
 * 
 * @param {ObjectId|string} productId 
 * @returns {Promise<Array>}
 */
export async function getBatchesFEFO(productId) {
  const batches = await ProductBatch.find({
    product_id: productId,
    quantity_in_stock: { $gt: 0 },
    status: { $in: ['active', 'near_expiry'] }
  })
    .sort({ expiry_date: 1, createdAt: 1 })
    .lean();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return batches.map((batch, index) => {
    const expiry = new Date(batch.expiry_date);
    expiry.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    return {
      ...batch,
      days_until_expiry: daysUntilExpiry,
      // Lô đầu tiên có HSD gần nhất sẽ được hệ thống đề xuất xuất trước (FEFO)
      is_fefo_recommended: index === 0
    };
  });
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tìm kiếm sản phẩm bán hàng tại POS (Barcode scanner / SKU / Tên)
 * Kèm thông tin tồn kho tổng và lô FEFO ưu tiên
 * @param {string} query - Từ khóa tìm kiếm
 * @param {boolean} inStockOnly - Chỉ lấy sản phẩm còn tồn kho
 * @param {number} limit - Số lượng tối đa trả về
 */
export async function searchPosProducts(query = '', inStockOnly = false, limit = 200) {
  const trimmed = query.trim();
  const filter = { status: 'active' };

  if (inStockOnly) {
    filter.total_stock = { $gt: 0 };
  }

  if (trimmed) {
    const escaped = escapeRegex(trimmed);
    filter.$or = [
      { barcode: trimmed },
      { sku: { $regex: escaped, $options: 'i' } },
      { kiotviet_code: trimmed },
      { name: { $regex: escaped, $options: 'i' } }
    ];
  }

  const maxLimit = Math.max(100, Math.min(500, Number(limit) || 200));
  const products = await Product.find(filter)
    .populate('category_id', 'name')
    .sort({ total_stock: -1, name: 1 })
    .limit(maxLimit)
    .lean();

  if (products.length === 0) return [];

  // Nạp tất cả lô hàng khả dụng trong 1 truy vấn duy nhất (Tối ưu hiệu năng cao)
  const productIds = products.map((p) => p._id);
  const allBatches = await ProductBatch.find({
    product_id: { $in: productIds },
    quantity_in_stock: { $gt: 0 },
    status: { $in: ['active', 'near_expiry'] }
  })
    .sort({ expiry_date: 1, createdAt: 1 })
    .lean();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const batchesByProduct = {};
  for (const batch of allBatches) {
    const pid = String(batch.product_id);
    if (!batchesByProduct[pid]) {
      batchesByProduct[pid] = [];
    }
    const expiry = new Date(batch.expiry_date);
    expiry.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    batchesByProduct[pid].push({
      ...batch,
      days_until_expiry: daysUntilExpiry,
      is_fefo_recommended: batchesByProduct[pid].length === 0
    });
  }

  let results = products.map((prod) => {
    const batches = batchesByProduct[String(prod._id)] || [];
    return {
      ...prod,
      available_batches: batches,
      fefo_batch: batches.length > 0 ? batches[0] : null
    };
  });

  if (inStockOnly) {
    results = results.filter(p => (p.total_stock > 0 || (p.available_batches && p.available_batches.length > 0)));
  }

  return results;
}

/**
 * Xử lý thanh toán hóa đơn POS tại quầy
 * 1. Kiểm tra tồn kho từng lô
 * 2. Trừ tồn kho ProductBatch
 * 3. Ghi Sổ kho StockMovement
 * 4. Tích hợp ngược CRM (tạo Order.js kích hoạt hook refill_date & ZNS)
 * 5. Lưu SalesOrder
 */
export async function processPosCheckout(data, user) {
  const {
    customer_id,
    customer_name,
    customer_phone,
    items = [],
    discount_amount = 0,
    payment_method = 'CASH',
    amount_paid = 0,
    notes = ''
  } = data;

  if (!items || items.length === 0) {
    throw new Error('Đơn hàng không có sản phẩm nào');
  }

  // 1. Kiểm tra và xác thực từng sản phẩm & lô hàng
  const processedItems = [];
  let subtotalAmount = 0;
  let totalQuantity = 0;

  for (const item of items) {
    if (!item.product_id || !item.batch_id || !item.quantity || item.quantity <= 0) {
      throw new Error('Dữ liệu sản phẩm hoặc lô hàng không hợp lệ');
    }

    const product = await Product.findById(item.product_id);
    if (!product) {
      throw new Error(`Không tìm thấy sản phẩm ID: ${item.product_id}`);
    }

    const batch = await ProductBatch.findById(item.batch_id);
    if (!batch) {
      throw new Error(`Không tìm thấy lô hàng ID: ${item.batch_id}`);
    }

    // Kiểm tra tồn kho của lô
    if (batch.quantity_in_stock < item.quantity) {
      throw new Error(
        `Lô "${batch.batch_number}" của sản phẩm "${product.name}" chỉ còn ${batch.quantity_in_stock} sản phẩm (yêu cầu: ${item.quantity})`
      );
    }

    const unitPrice = item.unit_price !== undefined ? Number(item.unit_price) : (product.sell_price || 0);
    const itemDiscount = Number(item.discount) || 0;
    const itemSubtotal = Math.max(0, (unitPrice * item.quantity) - itemDiscount);

    subtotalAmount += itemSubtotal;
    totalQuantity += item.quantity;

    processedItems.push({
      product_id: product._id,
      product_name: product.name,
      product_sku: product.sku || '',
      unit: product.unit || 'Cái',
      batch_id: batch._id,
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date,
      quantity: item.quantity,
      unit_price: unitPrice,
      cost_price: batch.cost_price || product.cost_price || 0,
      discount: itemDiscount,
      subtotal: itemSubtotal,
      _batch_instance: batch,
      _product_instance: product
    });
  }

  // 2. Tính toán tổng tài chính
  const discountVal = Math.min(Number(discount_amount) || 0, subtotalAmount);
  const finalAmount = Math.max(0, subtotalAmount - discountVal);
  const paidVal = Number(amount_paid) || finalAmount;
  const changeAmount = Math.max(0, paidVal - finalAmount);

  // Sinh mã đơn hàng
  const orderCode = await generateOrderCode();

  // 3. Xử lý thông tin khách hàng (tìm hoặc tạo mới nếu có SĐT)
  let actualCustomerId = customer_id || null;
  let actualCustomerName = customer_name ? customer_name.trim() : 'Khách lẻ';
  let actualCustomerPhone = customer_phone ? customer_phone.trim() : '';

  if (!actualCustomerId && actualCustomerPhone) {
    // Tìm khách hàng theo SĐT
    let existingCust = await Customer.findOne({ phone: actualCustomerPhone });
    if (!existingCust) {
      // Tạo mới khách hàng nhanh tại quầy
      existingCust = await Customer.create({
        name: actualCustomerName !== 'Khách lẻ' ? actualCustomerName : 'Mẹ',
        phone: actualCustomerPhone,
        customer_type: 'BUYER',
        source: 'POS_COUNTER',
        created_by: user?._id
      });
    }
    actualCustomerId = existingCust._id;
    actualCustomerName = existingCust.name;
  }

  // 4. Trừ kho ProductBatch & Ghi Sổ kho StockMovement & Tích hợp ngược CRM
  const finalItemsForSave = [];

  for (const item of processedItems) {
    const batch = item._batch_instance;
    const product = item._product_instance;
    const previousBatchStock = batch.quantity_in_stock;
    const previousProductStock = product.total_stock || 0;

    // a. Trừ tồn kho lô
    batch.quantity_in_stock -= item.quantity;
    if (batch.quantity_in_stock === 0) {
      batch.status = 'sold_out';
    }
    batch.updated_by = user?._id;
    await batch.save(); // Hook ProductBatch sẽ tự đồng bộ tổng tồn của Product!

    // b. Ghi nhận Sổ kho (StockMovement)
    await StockMovement.create({
      product_id: product._id,
      batch_id: batch._id,
      batch_number: batch.batch_number,
      type: 'OUT',
      quantity: -item.quantity,
      previous_stock: previousProductStock,
      current_stock: Math.max(0, previousProductStock - item.quantity),
      unit_price: item.unit_price,
      total_value: item.subtotal,
      reference_type: 'SalesOrder',
      reference_code: orderCode,
      notes: `Bán lẻ tại quầy đơn ${orderCode} - Lô: ${batch.batch_number}`,
      created_by: user?._id
    });

    // c. TÍCH HỢP NGƯỢC CRM (Tạo Order.js kích hoạt hook tính refill_date & Zalo ZNS)
    let orderRefId = null;
    if (actualCustomerId) {
      try {
        const crmOrder = new Order({
          customer_id: actualCustomerId,
          product_id: product._id,
          product_name: product.name,
          purchase_date: new Date(),
          quantity: item.quantity,
          amount: item.subtotal,
          created_by: user?._id
        });
        const savedCrmOrder = await crmOrder.save();
        orderRefId = savedCrmOrder._id;
        console.log(`[POS CRM Sync] Đã đồng bộ sang Order CRM ${orderRefId} cho khách ${actualCustomerPhone}`);
      } catch (crmErr) {
        console.error('[POS CRM Sync Error]', crmErr.message);
        // Không block giao dịch POS nếu CRM hook lỗi
      }
    }

    finalItemsForSave.push({
      product_id: item.product_id,
      product_name: item.product_name,
      product_sku: item.product_sku,
      unit: item.unit,
      batch_id: item.batch_id,
      batch_number: item.batch_number,
      expiry_date: item.expiry_date,
      quantity: item.quantity,
      unit_price: item.unit_price,
      cost_price: item.cost_price,
      discount: item.discount,
      subtotal: item.subtotal,
      order_ref_id: orderRefId
    });
  }

  // 5. Lưu hóa đơn SalesOrder
  const salesOrder = new SalesOrder({
    order_code: orderCode,
    customer_id: actualCustomerId,
    customer_name: actualCustomerName,
    customer_phone: actualCustomerPhone,
    cashier_id: user?._id,
    cashier_name: user?.fullName || 'Thu ngân',
    items: finalItemsForSave,
    total_quantity: totalQuantity,
    subtotal_amount: subtotalAmount,
    discount_amount: discountVal,
    final_amount: finalAmount,
    payment_method,
    amount_paid: paidVal,
    change_amount: changeAmount,
    status: 'completed',
    notes: notes || ''
  });

  const savedOrder = await salesOrder.save();

  // Lấy thêm thông tin Shop/Tenant để in hóa đơn nhiệt
  let tenantInfo = null;
  if (user?.tenant_id) {
    tenantInfo = await Tenant.findById(user.tenant_id).select('name phone address').lean();
  }

  return {
    order: savedOrder,
    tenant: tenantInfo
  };
}
