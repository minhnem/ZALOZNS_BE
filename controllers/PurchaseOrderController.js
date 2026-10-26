import PurchaseOrder from '../models/PurchaseOrder.js';
import Supplier from '../models/Supplier.js';
import Product from '../models/Product.js';
import ProductBatch from '../models/ProductBatch.js';
import { processReceivePurchaseOrder } from '../services/inventoryService.js';
import { calculateBatchStatus } from '../services/batchExpiryService.js';

/**
 * Controller: PurchaseOrder (Quản lý Phiếu Nhập Kho)
 */

// GET /api/purchase-orders
export const getPurchaseOrders = async (req, res) => {
  try {
    const { search, status, supplier_id } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (supplier_id && supplier_id !== 'all') {
      filter.supplier_id = supplier_id;
    }

    if (search) {
      const q = search.trim();
      filter.$or = [
        { code: { $regex: q, $options: 'i' } },
        { supplier_name: { $regex: q, $options: 'i' } },
        { 'items.batch_number': { $regex: q, $options: 'i' } },
        { 'items.product_name': { $regex: q, $options: 'i' } }
      ];
    }

    const orders = await PurchaseOrder.find(filter)
      .populate('supplier_id', 'name code phone')
      .populate('created_by', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json(orders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách phiếu nhập kho', error: error.message });
  }
};

// GET /api/purchase-orders/:id
export const getPurchaseOrderById = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id)
      .populate('supplier_id', 'name code phone email address tax_code')
      .populate('items.product_id', 'name sku unit total_stock category')
      .populate('items.product_batch_id', 'batch_number expiry_date status quantity_in_stock')
      .populate('created_by', 'name email')
      .populate('received_by', 'name email');

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy phiếu nhập kho' });
    }

    res.status(200).json(order);
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết phiếu nhập', error: error.message });
  }
};

// POST /api/purchase-orders
export const createPurchaseOrder = async (req, res) => {
  try {
    const {
      code,
      supplier_id,
      status,
      order_date,
      expected_delivery_date,
      items,
      discount = 0,
      tax = 0,
      payment_status = 'unpaid',
      paid_amount = 0,
      payment_method = 'bank_transfer',
      notes,
      auto_receive = false
    } = req.body;

    // 1. Kiểm tra nhà cung cấp
    const supplier = await Supplier.findById(supplier_id);
    if (!supplier) {
      return res.status(404).json({ message: 'Nhà cung cấp không tồn tại' });
    }

    // 2. Sinh mã phiếu nhập nếu chưa có
    let poCode = code ? code.trim().toUpperCase() : null;
    if (!poCode) {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const count = await PurchaseOrder.countDocuments();
      poCode = `PO-${todayStr}-${String(count + 1).padStart(3, '0')}`;
    }

    // 3. Tính toán tiền chi tiết từng item & tổng đơn
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Phiếu nhập phải có ít nhất 1 sản phẩm' });
    }

    let calculatedTotalAmount = 0;
    const processedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product_id);
      if (!product) {
        return res.status(404).json({ message: `Sản phẩm ID ${item.product_id} không tồn tại` });
      }

      const qty = Number(item.quantity) || 1;
      const cost = Number(item.cost_price) || 0;
      const itemTotal = qty * cost;
      calculatedTotalAmount += itemTotal;

      processedItems.push({
        product_id: product._id,
        product_name: product.name,
        sku: product.sku || '',
        unit: product.unit || 'Cái',
        batch_number: item.batch_number ? item.batch_number.trim().toUpperCase() : `LOT-${todayStr}-${Math.floor(100 + Math.random() * 900)}`,
        manufacturing_date: item.manufacturing_date || null,
        expiry_date: item.expiry_date,
        quantity: qty,
        cost_price: cost,
        total_price: itemTotal
      });
    }

    const calculatedFinalAmount = Math.max(0, calculatedTotalAmount - Number(discount) + Number(tax));

    const po = new PurchaseOrder({
      code: poCode,
      supplier_id: supplier._id,
      supplier_name: supplier.name,
      status: 'draft', // Khởi tạo luôn là draft trước
      order_date: order_date || new Date(),
      expected_delivery_date: expected_delivery_date || null,
      items: processedItems,
      total_amount: calculatedTotalAmount,
      discount: Number(discount) || 0,
      tax: Number(tax) || 0,
      final_amount: calculatedFinalAmount,
      payment_status,
      paid_amount: Number(paid_amount) || 0,
      payment_method,
      notes: notes || '',
      created_by: req.user?._id
    });

    const savedPO = await po.save();

    // Nếu chọn Nhập kho trực tiếp ngay (auto_receive = true hoặc status = 'received')
    if (auto_receive || status === 'received') {
      const receivedPO = await processReceivePurchaseOrder(savedPO._id, req.user?._id);
      return res.status(201).json(receivedPO);
    } else if (status === 'confirmed') {
      savedPO.status = 'confirmed';
      await savedPO.save();
    }

    res.status(201).json(savedPO);
  } catch (error) {
    console.error('Error creating purchase order:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Mã phiếu nhập đã tồn tại trong hệ thống' });
    }
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/purchase-orders/:id
export const updatePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const po = await PurchaseOrder.findById(id);

    if (!po) {
      return res.status(404).json({ message: 'Không tìm thấy phiếu nhập kho' });
    }

    if (po.status === 'cancelled') {
      return res.status(400).json({ message: 'Phiếu đã hủy, không thể chỉnh sửa' });
    }

    // 1. Cập nhật thông tin nhà cung cấp nếu có thay đổi
    if (req.body.supplier_id && String(req.body.supplier_id) !== String(po.supplier_id)) {
      const supplier = await Supplier.findById(req.body.supplier_id);
      if (supplier) {
        po.supplier_id = supplier._id;
        po.supplier_name = supplier.name;
      }
    }

    // 2. Cập nhật các trường thông tin chung
    const allowedFields = [
      'expected_delivery_date', 'discount', 'tax', 'payment_status',
      'paid_amount', 'payment_method', 'notes', 'order_date'
    ];

    for (const f of allowedFields) {
      if (req.body[f] !== undefined) {
        po[f] = req.body[f];
      }
    }

    // 3. Xử lý cập nhật danh sách items
    if (req.body.items && Array.isArray(req.body.items)) {
      let calculatedTotal = 0;
      const updatedItems = [];

      if (po.status === 'received') {
        // TRƯỜNG HỢP PHIẾU ĐÃ NHẬP KHO: Đồng bộ trực tiếp với Lô hàng (ProductBatch)
        for (const item of req.body.items) {
          const qty = Number(item.quantity) || 1;
          const cost = Number(item.cost_price) || 0;
          const itemTotal = qty * cost;
          calculatedTotal += itemTotal;

          const product = await Product.findById(item.product_id);
          if (!product) {
            return res.status(404).json({ message: `Sản phẩm ID ${item.product_id} không tồn tại` });
          }

          // Tìm lô hàng liên kết
          let batchId = item.product_batch_id || item._id;
          let batch = null;

          if (batchId) {
            batch = await ProductBatch.findById(batchId);
          }

          if (!batch && item.batch_number) {
            batch = await ProductBatch.findOne({
              product_id: item.product_id,
              batch_number: item.batch_number.trim().toUpperCase()
            });
          }

          if (batch) {
            // Lô đã có -> Tính toán độ lệch số lượng để điều chỉnh tồn kho
            const existingPoItem = po.items.find(
              (it) => String(it.product_batch_id) === String(batch._id) || String(it._id) === String(item._id)
            );
            const oldQty = existingPoItem ? existingPoItem.quantity : batch.quantity_received;
            const diff = qty - oldQty;

            if (diff !== 0) {
              if (batch.quantity_in_stock + diff < 0) {
                return res.status(400).json({
                  message: `Không thể giảm số lượng lô ${batch.batch_number} (${qty}) xuống dưới số lượng tồn kho thực tế hiện tại (${batch.quantity_in_stock}) do một phần đã xuất bán!`
                });
              }
              batch.quantity_received += diff;
              batch.quantity_in_stock += diff;
            }

            if (item.batch_number) batch.batch_number = item.batch_number.trim().toUpperCase();
            if (item.expiry_date) batch.expiry_date = item.expiry_date;
            if (item.manufacturing_date !== undefined) batch.manufacturing_date = item.manufacturing_date || null;
            batch.cost_price = cost;

            const nearExpiryDays = product.near_expiry_days || 90;
            batch.status = calculateBatchStatus(batch, nearExpiryDays);
            batch.updated_by = req.user?._id;
            await batch.save(); // Hook save sẽ tự động cập nhật lại Product.total_stock!
          } else {
            // Dòng sản phẩm mới thêm vào phiếu đã nhận -> Tạo lô mới
            const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const batchNo = item.batch_number ? item.batch_number.trim().toUpperCase() : `LOT-${todayStr}-${Math.floor(100 + Math.random() * 900)}`;
            batch = new ProductBatch({
              product_id: item.product_id,
              batch_number: batchNo,
              manufacturing_date: item.manufacturing_date || null,
              expiry_date: item.expiry_date,
              quantity_received: qty,
              quantity_in_stock: qty,
              cost_price: cost,
              purchase_order_id: po._id,
              created_by: req.user?._id
            });
            const nearExpiryDays = product.near_expiry_days || 90;
            batch.status = calculateBatchStatus(batch, nearExpiryDays);
            await batch.save();
          }

          updatedItems.push({
            product_id: product._id,
            product_name: product.name,
            sku: product.sku || '',
            unit: product.unit || 'Cái',
            batch_number: item.batch_number ? item.batch_number.trim().toUpperCase() : batch.batch_number,
            manufacturing_date: item.manufacturing_date || null,
            expiry_date: item.expiry_date,
            quantity: qty,
            cost_price: cost,
            total_price: itemTotal,
            product_batch_id: batch._id
          });
        }
      } else {
        // TRƯỜNG HỢP PHIẾU CHƯA NHẬP KHO (draft hoặc confirmed): Sửa thông thường
        for (const item of req.body.items) {
          const product = await Product.findById(item.product_id);
          if (!product) {
            return res.status(404).json({ message: `Sản phẩm ID ${item.product_id} không tồn tại` });
          }

          const qty = Number(item.quantity) || 1;
          const cost = Number(item.cost_price) || 0;
          const itemTotal = qty * cost;
          calculatedTotal += itemTotal;

          updatedItems.push({
            product_id: product._id,
            product_name: product.name,
            sku: product.sku || '',
            unit: product.unit || 'Cái',
            batch_number: item.batch_number ? item.batch_number.trim().toUpperCase() : '',
            manufacturing_date: item.manufacturing_date || null,
            expiry_date: item.expiry_date,
            quantity: qty,
            cost_price: cost,
            total_price: itemTotal
          });
        }
      }

      po.items = updatedItems;
      po.total_amount = calculatedTotal;
    }

    po.final_amount = Math.max(0, po.total_amount - Number(po.discount || 0) + Number(po.tax || 0));
    const saved = await po.save();

    // Nếu phiếu chưa nhận nhưng được tích chọn auto_receive
    if (po.status !== 'received' && req.body.auto_receive) {
      const receivedPO = await processReceivePurchaseOrder(saved._id, req.user?._id);
      return res.status(200).json(receivedPO);
    }

    res.status(200).json(saved);
  } catch (error) {
    console.error('Error updating purchase order:', error);
    res.status(400).json({ message: error.message });
  }
};

// POST /api/purchase-orders/:id/receive
// Xác nhận hoàn tất nhập kho hàng thực tế
export const receivePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const receivedPO = await processReceivePurchaseOrder(id, req.user?._id);
    res.status(200).json({
      message: `Đã hoàn tất nhập kho phiếu ${receivedPO.code} thành công!`,
      purchaseOrder: receivedPO
    });
  } catch (error) {
    console.error('Error receiving purchase order:', error);
    res.status(400).json({ message: error.message });
  }
};

// POST /api/purchase-orders/:id/cancel
// Hủy phiếu nhập kho
export const cancelPurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const po = await PurchaseOrder.findById(id);

    if (!po) return res.status(404).json({ message: 'Không tìm thấy phiếu nhập kho' });
    if (po.status === 'received') {
      return res.status(400).json({ message: 'Không thể hủy phiếu đã hoàn thành nhập kho vào hệ thống' });
    }

    po.status = 'cancelled';
    await po.save();
    res.status(200).json({ message: 'Đã hủy phiếu nhập kho thành công', purchaseOrder: po });
  } catch (error) {
    console.error('Error cancelling purchase order:', error);
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/purchase-orders/:id
export const deletePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const po = await PurchaseOrder.findById(id);

    if (!po) return res.status(404).json({ message: 'Không tìm thấy phiếu nhập' });
    if (po.status === 'received') {
      return res.status(400).json({ message: 'Không thể xóa phiếu đã nhập kho thực tế' });
    }

    await PurchaseOrder.findByIdAndDelete(id);
    res.status(200).json({ message: 'Đã xóa phiếu nhập kho thành công' });
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    res.status(500).json({ message: error.message });
  }
};

export const bulkDeletePurchaseOrders = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
    }
    const pos = await PurchaseOrder.find({ _id: { $in: ids } });
    let deletedCount = 0;
    let skippedCount = 0;
    for (const po of pos) {
      if (po.status === 'received') {
        skippedCount++;
        continue;
      }
      await PurchaseOrder.findByIdAndDelete(po._id);
      deletedCount++;
    }
    res.status(200).json({
      message: `Đã xóa ${deletedCount} phiếu nhập kho.${skippedCount > 0 ? ` (Bỏ qua ${skippedCount} phiếu đã hoàn thành nhập kho thực tế)` : ''}`,
      deletedCount,
      skippedCount
    });
  } catch (error) {
    console.error('Error bulk deleting purchase orders:', error);
    res.status(500).json({ message: error.message });
  }
};
