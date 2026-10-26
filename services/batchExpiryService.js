import cron from 'node-cron';
import ProductBatch from '../models/ProductBatch.js';
import Product from '../models/Product.js';
import ExpiryAlert from '../models/ExpiryAlert.js';
import Tenant from '../models/Tenant.js';
import { runAsSuperAdmin, runWithTenant } from '../utils/tenantContext.js';

/**
 * Batch Expiry Service
 * 
 * Core Algorithm — Tính toán 2 chiều:
 * 1. Từ HSD → Tính số ngày còn lại, phân loại trạng thái
 * 2. Từ NSX + Thời hạn sử dụng → Tính HSD (nếu chỉ biết NSX và shelf life)
 * 
 * Hệ thống tự phân loại trạng thái lô theo thời gian thực:
 * - active: Còn hạn, bình thường
 * - near_expiry: Sắp hết hạn (trong ngưỡng Product.near_expiry_days)
 * - expired: Đã quá hạn
 * - sold_out: Đã hết hàng (quantity_in_stock = 0)
 * - destroyed: Đã bị hủy (do người dùng đánh dấu)
 */

/**
 * Tính trạng thái thực tế của 1 lô dựa trên HSD và tồn kho
 * @param {Object} batch - ProductBatch document
 * @param {Number} nearExpiryDays - Ngưỡng cận date (ngày)
 * @returns {String} Trạng thái mới
 */
export function calculateBatchStatus(batch, nearExpiryDays = 90) {
  // Nếu đã bị hủy → Giữ nguyên
  if (batch.status === 'destroyed') return 'destroyed';

  // Nếu hết hàng → sold_out
  if (batch.quantity_in_stock <= 0) return 'sold_out';

  // Tính số ngày còn lại
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(batch.expiry_date);
  expiry.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) return 'expired';
  if (daysLeft <= nearExpiryDays) return 'near_expiry';
  return 'active';
}

/**
 * Xác định cấp độ cảnh báo theo số ngày còn lại
 * @param {Number} daysLeft 
 * @returns {String|null} 'expired' | 'near_expiry_30' | 'near_expiry_60' | 'near_expiry_90' | null
 */
export function determineAlertLevel(daysLeft) {
  if (daysLeft <= 0) return 'expired';
  if (daysLeft <= 30) return 'near_expiry_30';
  if (daysLeft <= 60) return 'near_expiry_60';
  if (daysLeft <= 90) return 'near_expiry_90';
  return null;
}

/**
 * Tính HSD từ NSX + Số ngày shelf life
 * @param {Date} manufacturingDate - Ngày sản xuất
 * @param {Number} shelfLifeDays - Hạn sử dụng (tính bằng ngày)
 * @returns {Date} Ngày hết hạn
 */
export function calculateExpiryFromManufacturing(manufacturingDate, shelfLifeDays) {
  const expiry = new Date(manufacturingDate);
  expiry.setDate(expiry.getDate() + shelfLifeDays);
  return expiry;
}

/**
 * Quét và cập nhật trạng thái tất cả lô hàng của 1 sản phẩm
 * @param {ObjectId} productId
 * @returns {Object} Kết quả cập nhật { updated, nearExpiry, expired }
 */
export async function refreshBatchStatusByProduct(productId) {
  const product = await Product.findById(productId);
  if (!product) return { updated: 0, nearExpiry: 0, expired: 0 };

  const nearExpiryDays = product.near_expiry_days || 90;
  const batches = await ProductBatch.find({
    product_id: productId,
    status: { $nin: ['destroyed'] }
  });

  let updated = 0;
  let nearExpiry = 0;
  let expired = 0;

  for (const batch of batches) {
    const newStatus = calculateBatchStatus(batch, nearExpiryDays);
    if (newStatus !== batch.status) {
      batch.status = newStatus;
      await batch.save();
      updated++;
    }
    if (newStatus === 'near_expiry') nearExpiry++;
    if (newStatus === 'expired') expired++;
  }

  return { updated, nearExpiry, expired };
}

/**
 * Lấy thống kê tồn kho của 1 sản phẩm theo trạng thái lô
 * @param {ObjectId} productId
 * @returns {Object} Thống kê chi tiết
 */
export async function getProductStockSummary(productId) {
  const batches = await ProductBatch.find({ product_id: productId }).sort({ expiry_date: 1 });
  const product = await Product.findById(productId);

  const summary = {
    product_id: productId,
    product_name: product?.name || '',
    total_stock: 0,
    total_batches: batches.length,
    active_stock: 0,
    near_expiry_stock: 0,
    expired_stock: 0,
    sold_out_batches: 0,
    destroyed_batches: 0,
    earliest_expiry: null,
    batches: []
  };

  const nearExpiryDays = product?.near_expiry_days || 90;

  for (const batch of batches) {
    const realStatus = calculateBatchStatus(batch, nearExpiryDays);

    const batchInfo = {
      _id: batch._id,
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date,
      manufacturing_date: batch.manufacturing_date,
      quantity_in_stock: batch.quantity_in_stock,
      quantity_received: batch.quantity_received,
      status: realStatus,
      days_until_expiry: batch.days_until_expiry,
      cost_price: batch.cost_price
    };

    summary.batches.push(batchInfo);
    summary.total_stock += batch.quantity_in_stock;

    switch (realStatus) {
      case 'active':
        summary.active_stock += batch.quantity_in_stock;
        break;
      case 'near_expiry':
        summary.near_expiry_stock += batch.quantity_in_stock;
        break;
      case 'expired':
        summary.expired_stock += batch.quantity_in_stock;
        break;
      case 'sold_out':
        summary.sold_out_batches++;
        break;
      case 'destroyed':
        summary.destroyed_batches++;
        break;
    }

    if (batch.quantity_in_stock > 0 && realStatus !== 'destroyed') {
      if (!summary.earliest_expiry || batch.expiry_date < summary.earliest_expiry) {
        summary.earliest_expiry = batch.expiry_date;
      }
    }
  }

  return summary;
}

// ═══════════════════════════════════════════════════
// GIAI ĐOẠN 4: QUÉT HSD TOÀN DIỆN & TẠO EXPIRY ALERTS
// ═══════════════════════════════════════════════════

/**
 * Quét toàn bộ lô hàng của 1 tenant cụ thể:
 * 1. Cập nhật trạng thái batch: active, near_expiry, expired, sold_out
 * 2. Tự động đồng bộ ExpiryAlert (tạo mới hoặc cập nhật)
 * 3. Tự động giải quyết (resolve) alert nếu lô đã hết hàng hoặc đã huỷ
 * 
 * @param {ObjectId|string} tenantId 
 * @returns {Promise<Object>} Thống kê quét
 */
export async function runTenantExpiryScan(tenantId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Lấy tất cả lô còn tồn tại (chưa hủy hoàn toàn)
  const batches = await ProductBatch.find({
    status: { $nin: ['destroyed'] }
  }).populate('product_id', 'name near_expiry_days sell_price cost_price');

  let updatedBatchesCount = 0;
  let activeAlertsCount = 0;
  let resolvedAlertsCount = 0;
  let nearExpiryCount = 0;
  let expiredCount = 0;
  let totalRiskValue = 0;

  for (const batch of batches) {
    const product = batch.product_id;
    if (!product) continue;

    const nearExpiryDays = product.near_expiry_days || 90;
    const oldStatus = batch.status;
    const newStatus = calculateBatchStatus(batch, nearExpiryDays);

    // Cập nhật trạng thái lô nếu thay đổi
    if (newStatus !== oldStatus) {
      batch.status = newStatus;
      await batch.save();
      updatedBatchesCount++;
    }

    // Tính số ngày còn lại
    const expiry = new Date(batch.expiry_date);
    expiry.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const alertLevel = determineAlertLevel(daysLeft);

    const costPrice = batch.cost_price || product.cost_price || 0;
    const riskValue = (batch.quantity_in_stock || 0) * costPrice;

    // Tìm alert đang active của lô này (nếu có)
    const existingAlert = await ExpiryAlert.findOne({
      batch_id: batch._id,
      status: 'active'
    });

    // Trường hợp 1: Lô đã hết hàng (sold_out) hoặc đã bị huỷ
    if (batch.quantity_in_stock <= 0 || newStatus === 'sold_out' || newStatus === 'destroyed') {
      if (existingAlert) {
        existingAlert.status = 'resolved';
        existingAlert.resolved_at = new Date();
        existingAlert.notes = 'Lô hàng đã bán hết hoặc đã xuất kho';
        await existingAlert.save();
        resolvedAlertsCount++;
      }
      continue;
    }

    // Trường hợp 2: Lô cần cảnh báo (HSD <= nearExpiryDays hoặc đã quá hạn)
    if (alertLevel && batch.quantity_in_stock > 0) {
      if (newStatus === 'near_expiry') nearExpiryCount++;
      if (newStatus === 'expired') expiredCount++;
      totalRiskValue += riskValue;

      if (existingAlert) {
        // Cập nhật thông số mới nhất của alert
        existingAlert.days_left = daysLeft;
        existingAlert.quantity_in_stock = batch.quantity_in_stock;
        existingAlert.cost_price = costPrice;
        existingAlert.risk_value = riskValue;
        existingAlert.alert_level = alertLevel;
        existingAlert.last_scanned_at = new Date();
        await existingAlert.save();
        activeAlertsCount++;
      } else {
        // Tạo mới ExpiryAlert
        await ExpiryAlert.create({
          product_id: product._id,
          product_name: product.name,
          batch_id: batch._id,
          batch_number: batch.batch_number,
          expiry_date: batch.expiry_date,
          days_left: daysLeft,
          quantity_in_stock: batch.quantity_in_stock,
          cost_price: costPrice,
          risk_value: riskValue,
          alert_level: alertLevel,
          status: 'active',
          action_taken: 'none',
          last_scanned_at: new Date()
        });
        activeAlertsCount++;
      }
    } else {
      // Trường hợp 3: Lô vẫn còn hạn an toàn (> nearExpiryDays)
      // Nếu trước đó từng có alert active nhầm thì resolve
      if (existingAlert) {
        existingAlert.status = 'resolved';
        existingAlert.resolved_at = new Date();
        existingAlert.notes = 'Lô hàng đã an toàn (HSD > ngưỡng cảnh báo)';
        await existingAlert.save();
        resolvedAlertsCount++;
      }
    }
  }

  return {
    scannedBatches: batches.length,
    updatedBatchesCount,
    activeAlertsCount,
    resolvedAlertsCount,
    nearExpiryCount,
    expiredCount,
    totalRiskValue
  };
}

/**
 * Kích hoạt quét HSD thủ công cho tenant hiện tại
 * @param {ObjectId|string} tenantId 
 */
export async function triggerManualExpiryScan(tenantId) {
  return await runWithTenant(tenantId, async () => {
    return await runTenantExpiryScan(tenantId);
  });
}

/**
 * Cronjob: Tự động quét kiểm tra HSD tất cả các cửa hàng vào 06:00 AM mỗi ngày
 */
export function scheduleExpiryCheck() {
  // Lịch chạy: 06:00 AM hàng ngày (0 6 * * *)
  cron.schedule('0 6 * * *', async () => {
    console.log('[Expiry Cronjob] ═════ BẮT ĐẦU QUÉT HSD TOÀN HỆ THỐNG (06:00 AM) ═════');
    try {
      // Lấy tất cả tenant đang hoạt động (dùng SuperAdmin context để query toàn cục)
      const tenants = await runAsSuperAdmin(async () => {
        return await Tenant.find({ status: { $in: ['active', 'trial'] } });
      });

      console.log(`[Expiry Cronjob] Tìm thấy ${tenants.length} cửa hàng cần quét HSD.`);

      for (const tenant of tenants) {
        try {
          await runWithTenant(tenant._id, async () => {
            const result = await runTenantExpiryScan(tenant._id);
            console.log(
              `[Expiry Cronjob] Shop: [${tenant.name}] (${tenant._id}) → ` +
              `Quét: ${result.scannedBatches} lô | Cận date: ${result.nearExpiryCount} | ` +
              `Hết hạn: ${result.expiredCount} | Vốn rủi ro: ${result.totalRiskValue.toLocaleString('vi-VN')} đ`
            );
          });
        } catch (shopErr) {
          console.error(`[Expiry Cronjob Error] Lỗi quét tại shop [${tenant.name}] (${tenant._id}):`, shopErr.message);
        }
      }

      console.log('[Expiry Cronjob] ═════ HOÀN TẤT QUÉT HSD TOÀN HỆ THỐNG ═════');
    } catch (error) {
      console.error('[Expiry Cronjob Fatal Error]:', error);
    }
  });

  console.log('Cronjob ExpiryCheck: SCHEDULED (06:00 AM Daily)');
}

