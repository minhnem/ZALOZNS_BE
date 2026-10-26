import ProductBatch from '../models/ProductBatch.js';
import Product from '../models/Product.js';
import ExpiryAlert from '../models/ExpiryAlert.js';
import {
  calculateBatchStatus,
  refreshBatchStatusByProduct,
  getProductStockSummary,
  triggerManualExpiryScan
} from '../services/batchExpiryService.js';

/**
 * Controller: ProductBatch (Quản lý Lô hàng)
 * CRUD + Refresh trạng thái + Thống kê tồn kho
 */

// ═══════════════════════════════════════════════
// GET /api/product-batches?product_id=xxx
// Lấy danh sách lô (có thể filter theo product_id)
// ═══════════════════════════════════════════════
export const getBatches = async (req, res) => {
  try {
    const { product_id, status } = req.query;
    const filter = {};
    if (product_id) filter.product_id = product_id;
    if (status && status !== 'all') filter.status = status;

    const batches = await ProductBatch.find(filter)
      .populate('product_id', 'name category unit near_expiry_days sku')
      .sort({ expiry_date: 1 });

    // Tính trạng thái thời gian thực cho từng lô trước khi trả về
    const enrichedBatches = batches.map(batch => {
      const batchObj = batch.toJSON();
      const nearExpiryDays = batch.product_id?.near_expiry_days || 90;
      batchObj.computed_status = calculateBatchStatus(batch, nearExpiryDays);
      return batchObj;
    });

    res.status(200).json(enrichedBatches);
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách lô hàng', error: error.message });
  }
};

// ═══════════════════════════════════════════════
// GET /api/product-batches/:id
// Lấy chi tiết 1 lô
// ═══════════════════════════════════════════════
export const getBatchById = async (req, res) => {
  try {
    const batch = await ProductBatch.findById(req.params.id)
      .populate('product_id', 'name category unit near_expiry_days sku');
    if (!batch) {
      return res.status(404).json({ message: 'Không tìm thấy lô hàng' });
    }
    res.status(200).json(batch);
  } catch (error) {
    console.error('Error fetching batch:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết lô', error: error.message });
  }
};

// ═══════════════════════════════════════════════
// POST /api/product-batches
// Tạo lô hàng mới
// ═══════════════════════════════════════════════
export const createBatch = async (req, res) => {
  try {
    const {
      product_id,
      batch_number,
      manufacturing_date,
      expiry_date,
      quantity_received,
      cost_price,
      notes
    } = req.body;

    // Validate sản phẩm tồn tại
    const product = await Product.findById(product_id);
    if (!product) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
    }

    // Tạo batch mới
    const batch = new ProductBatch({
      product_id,
      batch_number,
      manufacturing_date: manufacturing_date || null,
      expiry_date,
      quantity_received,
      quantity_in_stock: quantity_received, // Ban đầu tồn = nhập
      cost_price: cost_price || product.cost_price || 0,
      notes,
      created_by: req.user?._id
    });

    // Tính trạng thái ban đầu
    const nearExpiryDays = product.near_expiry_days || 90;
    batch.status = calculateBatchStatus(batch, nearExpiryDays);

    const saved = await batch.save();
    // Hook post-save sẽ tự cập nhật Product.total_stock

    const populated = await ProductBatch.findById(saved._id)
      .populate('product_id', 'name category unit');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating batch:', error);
    // Xử lý lỗi duplicate batch_number
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Mã lô đã tồn tại cho sản phẩm này. Vui lòng dùng mã lô khác.' });
    }
    res.status(400).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════
// PUT /api/product-batches/:id
// Cập nhật thông tin lô
// ═══════════════════════════════════════════════
export const updateBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await ProductBatch.findById(id);
    if (!batch) {
      return res.status(404).json({ message: 'Không tìm thấy lô hàng' });
    }

    // Cập nhật các trường được phép sửa
    const allowedFields = [
      'batch_number', 'manufacturing_date', 'expiry_date',
      'quantity_in_stock', 'cost_price', 'notes', 'status'
    ];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        batch[field] = req.body[field];
      }
    }
    batch.updated_by = req.user?._id;

    // Tính lại trạng thái nếu không phải destroyed thủ công
    if (req.body.status !== 'destroyed') {
      const product = await Product.findById(batch.product_id);
      const nearExpiryDays = product?.near_expiry_days || 90;
      batch.status = calculateBatchStatus(batch, nearExpiryDays);
    }

    const saved = await batch.save();
    const populated = await ProductBatch.findById(saved._id)
      .populate('product_id', 'name category unit');

    res.status(200).json(populated);
  } catch (error) {
    console.error('Error updating batch:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Mã lô đã tồn tại cho sản phẩm này.' });
    }
    res.status(400).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════
// DELETE /api/product-batches/:id
// Xóa lô hàng
// ═══════════════════════════════════════════════
export const deleteBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ProductBatch.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy lô hàng' });
    }
    // Hook post-findOneAndDelete sẽ tự cập nhật Product.total_stock
    res.status(200).json({ message: 'Đã xóa lô hàng thành công' });
  } catch (error) {
    console.error('Error deleting batch:', error);
    res.status(500).json({ message: 'Lỗi khi xóa lô hàng', error: error.message });
  }
};

export const bulkDeleteBatches = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID lô hàng không hợp lệ' });
    }
    const batches = await ProductBatch.find({ _id: { $in: ids } });
    const productIdsToRefresh = new Set();
    for (const b of batches) {
      if (b.product_id) productIdsToRefresh.add(String(b.product_id));
      await ProductBatch.findByIdAndDelete(b._id);
    }
    for (const pId of productIdsToRefresh) {
      await refreshBatchStatusByProduct(pId);
    }
    res.status(200).json({
      message: `Đã xóa thành công ${batches.length} lô hàng`,
      deletedCount: batches.length
    });
  } catch (error) {
    console.error('Error bulk deleting batches:', error);
    res.status(500).json({ message: 'Lỗi khi xóa nhiều lô hàng', error: error.message });
  }
};

// ═══════════════════════════════════════════════
// POST /api/product-batches/refresh-status/:productId
// Quét và cập nhật trạng thái tất cả lô của 1 sản phẩm
// ═══════════════════════════════════════════════
export const refreshBatchStatus = async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await refreshBatchStatusByProduct(productId);
    res.status(200).json({
      message: `Đã cập nhật ${result.updated} lô. Cận date: ${result.nearExpiry}, Hết hạn: ${result.expired}.`,
      ...result
    });
  } catch (error) {
    console.error('Error refreshing batch status:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái lô', error: error.message });
  }
};

// ═══════════════════════════════════════════════
// GET /api/product-batches/stock-summary/:productId
// Thống kê tồn kho chi tiết theo lô của 1 sản phẩm
// ═══════════════════════════════════════════════
export const getStockSummary = async (req, res) => {
  try {
    const { productId } = req.params;
    const summary = await getProductStockSummary(productId);
    res.status(200).json(summary);
  } catch (error) {
    console.error('Error fetching stock summary:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thống kê tồn kho', error: error.message });
  }
};

// ═══════════════════════════════════════════════
// GET /api/product-batches/expiry-overview
// Dashboard: Tổng quan HSD tất cả sản phẩm (sắp hết hạn, đã hết hạn)
// ═══════════════════════════════════════════════
export const getExpiryOverview = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Lô đã hết hạn (còn tồn kho)
    const expiredBatches = await ProductBatch.find({
      expiry_date: { $lt: today },
      quantity_in_stock: { $gt: 0 },
      status: { $nin: ['destroyed'] }
    })
      .populate('product_id', 'name category unit')
      .sort({ expiry_date: 1 })
      .limit(50);

    // Lô sắp hết hạn trong 30 ngày
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const nearExpiry30 = await ProductBatch.find({
      expiry_date: { $gte: today, $lte: thirtyDaysLater },
      quantity_in_stock: { $gt: 0 },
      status: { $nin: ['destroyed'] }
    })
      .populate('product_id', 'name category unit')
      .sort({ expiry_date: 1 });

    // Lô sắp hết hạn trong 90 ngày
    const ninetyDaysLater = new Date(today);
    ninetyDaysLater.setDate(ninetyDaysLater.getDate() + 90);
    const nearExpiry90 = await ProductBatch.find({
      expiry_date: { $gte: today, $lte: ninetyDaysLater },
      quantity_in_stock: { $gt: 0 },
      status: { $nin: ['destroyed'] }
    })
      .populate('product_id', 'name category unit')
      .sort({ expiry_date: 1 });

    res.status(200).json({
      expired: {
        count: expiredBatches.length,
        batches: expiredBatches
      },
      near_expiry_30: {
        count: nearExpiry30.length,
        batches: nearExpiry30
      },
      near_expiry_90: {
        count: nearExpiry90.length,
        batches: nearExpiry90
      }
    });
  } catch (error) {
    console.error('Error fetching expiry overview:', error);
    res.status(500).json({ message: 'Lỗi khi lấy tổng quan hạn sử dụng', error: error.message });
  }
};

// ═══════════════════════════════════════════════
// POST /api/product-batches/scan-expiry
// Kích hoạt quét HSD thủ công cho shop hiện tại
// ═══════════════════════════════════════════════
export const scanExpiry = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const result = await triggerManualExpiryScan(tenantId);
    res.status(200).json({
      message: `Quét hoàn tất: ${result.scannedBatches} lô. Cận date: ${result.nearExpiryCount}, Hết hạn: ${result.expiredCount}. Tổng vốn rủi ro: ${result.totalRiskValue.toLocaleString('vi-VN')} đ.`,
      result
    });
  } catch (error) {
    console.error('Error scanning expiry:', error);
    res.status(500).json({ message: 'Lỗi khi quét hạn sử dụng', error: error.message });
  }
};

// ═══════════════════════════════════════════════
// GET /api/product-batches/expiry-alerts
// Lấy danh sách cảnh báo HSD (active / resolved)
// ═══════════════════════════════════════════════
export const getExpiryAlerts = async (req, res) => {
  try {
    const { status = 'active', alert_level, product_id } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (alert_level && alert_level !== 'all') filter.alert_level = alert_level;
    if (product_id) filter.product_id = product_id;

    const alerts = await ExpiryAlert.find(filter)
      .populate('product_id', 'name category unit sku sell_price cost_price')
      .populate('batch_id', 'batch_number expiry_date manufacturing_date quantity_in_stock status')
      .populate('campaign_id', 'name type status')
      .sort({ days_left: 1 });

    // Tính tổng vốn rủi ro
    const totalRiskValue = alerts.reduce((sum, al) => sum + (al.risk_value || 0), 0);
    const expiredCount = alerts.filter(al => al.alert_level === 'expired').length;
    const nearExpiry30Count = alerts.filter(al => al.alert_level === 'near_expiry_30').length;

    res.status(200).json({
      summary: {
        totalAlerts: alerts.length,
        expiredCount,
        nearExpiry30Count,
        totalRiskValue
      },
      alerts
    });
  } catch (error) {
    console.error('Error fetching expiry alerts:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách cảnh báo HSD', error: error.message });
  }
};

// ═══════════════════════════════════════════════
// PATCH /api/product-batches/expiry-alerts/:id/action
// Cập nhật hành động xử lý cảnh báo (gắn chiến dịch ZNS, giảm giá, xuất hủy)
// ═══════════════════════════════════════════════
export const updateExpiryAlertAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action_taken, campaign_id, notes, resolve = false } = req.body;

    const alert = await ExpiryAlert.findById(id);
    if (!alert) {
      return res.status(404).json({ message: 'Không tìm thấy cảnh báo' });
    }

    if (action_taken) alert.action_taken = action_taken;
    if (campaign_id) alert.campaign_id = campaign_id;
    if (notes !== undefined) alert.notes = notes;

    if (resolve) {
      alert.status = 'resolved';
      alert.resolved_at = new Date();
      alert.resolved_by = req.user._id;
    }

    await alert.save();

    res.status(200).json({
      message: 'Cập nhật hành động xử lý cảnh báo thành công',
      alert
    });
  } catch (error) {
    console.error('Error updating expiry alert action:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật cảnh báo', error: error.message });
  }
};

