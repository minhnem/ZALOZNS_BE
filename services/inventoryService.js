import mongoose from 'mongoose';
import PurchaseOrder from '../models/PurchaseOrder.js';
import ProductBatch from '../models/ProductBatch.js';
import Product from '../models/Product.js';
import Supplier from '../models/Supplier.js';
import StockMovement from '../models/StockMovement.js';
import { calculateBatchStatus } from './batchExpiryService.js';

/**
 * Service: InventoryService
 * Xử lý nghiệp vụ lõi: Nhập kho, Xuất kho, Điều chỉnh tồn kho, Sổ kho
 */

/**
 * Hoàn tất nhập kho cho 1 Phiếu nhập kho (PurchaseOrder)
 * - Tạo/Cập nhật ProductBatch cho từng item
 * - Ghi nhận Sổ kho (StockMovement type 'IN')
 * - Cập nhật tổng tồn kho của Product (qua hook của ProductBatch)
 * - Cập nhật công nợ / tổng giá trị mua của Supplier
 * 
 * @param {ObjectId} purchaseOrderId 
 * @param {ObjectId} userId 
 * @returns {Promise<Object>} Phiếu nhập kho đã hoàn tất
 */
export async function processReceivePurchaseOrder(purchaseOrderId, userId) {
  const po = await PurchaseOrder.findById(purchaseOrderId);
  if (!po) {
    throw new Error('Không tìm thấy phiếu nhập kho');
  }

  if (po.status === 'received') {
    throw new Error('Phiếu nhập kho này đã được hoàn tất trước đó');
  }

  if (po.status === 'cancelled') {
    throw new Error('Không thể nhập kho từ phiếu đã bị hủy');
  }

  if (!po.items || po.items.length === 0) {
    throw new Error('Phiếu nhập kho không có sản phẩm nào');
  }

  // Duyệt qua từng sản phẩm trong phiếu nhập
  for (const item of po.items) {
    const product = await Product.findById(item.product_id);
    if (!product) {
      throw new Error(`Sản phẩm "${item.product_name}" không còn tồn tại trong hệ thống`);
    }

    const previousProductStock = product.total_stock || 0;

    // 1. Kiểm tra lô hàng đã tồn tại chưa (cùng product_id và batch_number)
    let batch = await ProductBatch.findOne({
      product_id: item.product_id,
      batch_number: item.batch_number
    });

    if (batch) {
      // Đã có lô này -> Tăng số lượng nhập & tồn kho
      batch.quantity_received += item.quantity;
      batch.quantity_in_stock += item.quantity;
      batch.cost_price = item.cost_price;
      if (item.expiry_date) batch.expiry_date = item.expiry_date;
      if (item.manufacturing_date) batch.manufacturing_date = item.manufacturing_date;

      const nearExpiryDays = product.near_expiry_days || 90;
      batch.status = calculateBatchStatus(batch, nearExpiryDays);
      batch.updated_by = userId;
      await batch.save();
    } else {
      // Tạo lô mới
      batch = new ProductBatch({
        product_id: item.product_id,
        batch_number: item.batch_number,
        manufacturing_date: item.manufacturing_date || null,
        expiry_date: item.expiry_date,
        quantity_received: item.quantity,
        quantity_in_stock: item.quantity,
        cost_price: item.cost_price,
        purchase_order_id: po._id,
        created_by: userId
      });

      const nearExpiryDays = product.near_expiry_days || 90;
      batch.status = calculateBatchStatus(batch, nearExpiryDays);
      await batch.save();
    }

    // Gán ID lô hàng vào item của phiếu nhập
    item.product_batch_id = batch._id;

    // 2. Ghi nhận Sổ kho (StockMovement)
    await StockMovement.create({
      product_id: item.product_id,
      batch_id: batch._id,
      batch_number: item.batch_number,
      type: 'IN',
      quantity: item.quantity,
      previous_stock: previousProductStock,
      current_stock: previousProductStock + item.quantity,
      unit_price: item.cost_price,
      total_value: item.total_price,
      reference_type: 'PurchaseOrder',
      reference_id: po._id,
      reference_code: po.code,
      notes: `Nhập kho theo phiếu ${po.code} từ NCC ${po.supplier_name}`,
      created_by: userId
    });
  }

  // 3. Cập nhật trạng thái phiếu nhập kho
  po.status = 'received';
  po.received_date = new Date();
  po.received_by = userId;
  await po.save();

  // 4. Cập nhật thống kê nhà cung cấp
  await Supplier.findByIdAndUpdate(po.supplier_id, {
    $inc: {
      total_purchases: po.final_amount || 0,
      purchase_count: 1
    }
  });

  return po;
}

/**
 * Điều chỉnh tồn kho lô hàng (Kiểm kê kho)
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function adjustStock({
  product_id,
  batch_id,
  actual_quantity,
  reason,
  userId
}) {
  const batch = await ProductBatch.findById(batch_id);
  if (!batch) throw new Error('Không tìm thấy lô hàng');

  const product = await Product.findById(product_id || batch.product_id);
  if (!product) throw new Error('Không tìm thấy sản phẩm');

  const oldStock = batch.quantity_in_stock;
  const diff = actual_quantity - oldStock; // Dương: tăng, Âm: giảm

  if (diff === 0) {
    return { message: 'Tồn kho không thay đổi', batch };
  }

  batch.quantity_in_stock = actual_quantity;
  const nearExpiryDays = product.near_expiry_days || 90;
  batch.status = calculateBatchStatus(batch, nearExpiryDays);
  batch.updated_by = userId;
  await batch.save(); // Hook sẽ tự đồng bộ Product.total_stock

  // Ghi nhận biến động kho
  await StockMovement.create({
    product_id: product._id,
    batch_id: batch._id,
    batch_number: batch.batch_number,
    type: 'ADJUSTMENT',
    quantity: diff,
    previous_stock: oldStock,
    current_stock: actual_quantity,
    unit_price: batch.cost_price || 0,
    total_value: Math.abs(diff) * (batch.cost_price || 0),
    reference_type: 'Stocktaking',
    reference_id: batch._id,
    reference_code: `ADJ-${batch.batch_number}`,
    notes: reason || 'Điều chỉnh kiểm kê kho định kỳ',
    created_by: userId
  });

  return batch;
}

/**
 * Xuất hủy hàng (Cận date / Hỏng rách)
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function discardStock({
  batch_id,
  quantity,
  reason,
  userId
}) {
  const batch = await ProductBatch.findById(batch_id);
  if (!batch) throw new Error('Không tìm thấy lô hàng');

  if (quantity > batch.quantity_in_stock) {
    throw new Error(`Số lượng hủy (${quantity}) vượt quá tồn kho hiện tại (${batch.quantity_in_stock})`);
  }

  const product = await Product.findById(batch.product_id);
  const oldStock = batch.quantity_in_stock;
  const newStock = oldStock - quantity;

  batch.quantity_in_stock = newStock;
  if (newStock === 0) {
    batch.status = 'sold_out';
  }
  batch.updated_by = userId;
  await batch.save();

  // Ghi nhận sổ kho
  await StockMovement.create({
    product_id: batch.product_id,
    batch_id: batch._id,
    batch_number: batch.batch_number,
    type: 'DISCARD',
    quantity: -quantity,
    previous_stock: oldStock,
    current_stock: newStock,
    unit_price: batch.cost_price || 0,
    total_value: quantity * (batch.cost_price || 0),
    reference_type: 'ExpiryDiscard',
    reference_id: batch._id,
    reference_code: `DIS-${batch.batch_number}`,
    notes: reason || 'Xuất hủy hàng cận date / hỏng hóc',
    created_by: userId
  });

  return batch;
}

/**
 * Tạo phiếu kiểm kê kho hàng loạt (nhiều sản phẩm / lô hàng cùng lúc)
 * @param {Object} params
 * @param {String} params.stocktaking_code - Mã phiếu kiểm kê (tự sinh nếu không truyền)
 * @param {String} params.reason - Lý do kiểm kê
 * @param {Array} params.items - Danh sách kiểm kê: [{ batch_id, actual_quantity, notes }]
 * @param {ObjectId} params.userId - Người thực hiện
 */
export async function bulkAdjustStock({ stocktaking_code, reason, items, userId }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Danh sách hàng kiểm kê không được rỗng');
  }

  // Tự sinh mã phiếu kiểm kê nếu chưa có: KK-YYMMDD-XXXX
  let code = stocktaking_code;
  if (!code) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePrefix = `KK-${yy}${mm}${dd}`;

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const countToday = await StockMovement.countDocuments({
      reference_code: { $regex: `^${datePrefix}` },
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });
    const seq = String(countToday + 1).padStart(4, '0');
    code = `${datePrefix}-${seq}`;
  }

  let updatedCount = 0;
  let unchangedCount = 0;
  let totalDiffQuantity = 0;
  let totalDiffValue = 0;

  for (const item of items) {
    const { batch_id, actual_quantity, notes } = item;
    if (!batch_id || actual_quantity === undefined || actual_quantity === null || actual_quantity < 0) {
      continue;
    }

    const batch = await ProductBatch.findById(batch_id);
    if (!batch) continue;

    const product = await Product.findById(batch.product_id);
    if (!product) continue;

    const oldStock = batch.quantity_in_stock || 0;
    const actual = Number(actual_quantity);
    const diff = actual - oldStock; // Dương: Thừa kho (+), Âm: Thiếu kho (-)

    if (diff === 0) {
      unchangedCount++;
      continue;
    }

    // Cập nhật tồn kho lô
    batch.quantity_in_stock = actual;
    const nearExpiryDays = product.near_expiry_days || 90;
    batch.status = calculateBatchStatus(batch, nearExpiryDays);
    batch.updated_by = userId;
    await batch.save(); // Hook ProductBatch tự động cập nhật Product.total_stock

    const costPrice = batch.cost_price || product.cost_price || 0;
    const value = Math.abs(diff) * costPrice;

    // Ghi nhận lịch sử Sổ kho
    await StockMovement.create({
      product_id: product._id,
      batch_id: batch._id,
      batch_number: batch.batch_number,
      type: 'ADJUSTMENT',
      quantity: diff,
      previous_stock: oldStock,
      current_stock: actual,
      unit_price: costPrice,
      total_value: value,
      reference_type: 'Stocktaking',
      reference_id: batch._id,
      reference_code: code,
      notes: notes || reason || `Kiểm kê kho theo phiếu ${code}`,
      created_by: userId
    });

    updatedCount++;
    totalDiffQuantity += diff;
    totalDiffValue += value;
  }

  return {
    stocktaking_code: code,
    updated_count: updatedCount,
    unchanged_count: unchangedCount,
    total_items: items.length,
    total_diff_quantity: totalDiffQuantity,
    total_diff_value: totalDiffValue
  };
}

