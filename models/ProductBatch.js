import mongoose from 'mongoose';
import { tenantPlugin } from '../utils/tenantPlugin.js';

/**
 * Model: ProductBatch (Quản lý Lô hàng)
 * 
 * Mỗi sản phẩm (Product) có thể có nhiều lô hàng khác nhau.
 * Mỗi lô có ngày sản xuất, hạn sử dụng, số lượng tồn riêng biệt.
 * 
 * Trạng thái lô được hệ thống tự phân loại theo thời gian thực:
 * - active: Còn hạn sử dụng, đang bán bình thường
 * - near_expiry: Sắp hết hạn (theo ngưỡng Product.near_expiry_days)
 * - expired: Đã quá hạn sử dụng
 * - sold_out: Đã bán hết (quantity_in_stock = 0)
 * - destroyed: Đã bị hủy
 */
const productBatchSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Sản phẩm là bắt buộc'],
    index: true
  },

  // Thông tin lô
  batch_number: {
    type: String,
    required: [true, 'Mã lô/Số lô là bắt buộc'],
    trim: true
  },
  manufacturing_date: {
    type: Date
    // Ngày sản xuất (NSX) — Không bắt buộc vì một số sản phẩm không ghi NSX
  },
  expiry_date: {
    type: Date,
    required: [true, 'Hạn sử dụng là bắt buộc'],
    index: true
  },

  // Số lượng
  quantity_received: {
    type: Number,
    required: [true, 'Số lượng nhập là bắt buộc'],
    min: [1, 'Số lượng nhập phải >= 1']
  },
  quantity_in_stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
    // Tồn kho thực tế hiện tại của lô này
    // Giảm khi bán hàng (POS) hoặc xuất kho
    // Tăng khi nhập kho hoặc điều chỉnh kiểm kê
  },

  // Giá
  cost_price: {
    type: Number,
    default: 0,
    min: 0
    // Giá nhập (per unit) của lô này — có thể khác giá nhập chung của Product
  },

  // Trạng thái lô
  status: {
    type: String,
    enum: ['active', 'near_expiry', 'expired', 'sold_out', 'destroyed'],
    default: 'active'
  },

  // Liên kết phiếu nhập kho (GĐ2 sẽ dùng)
  purchase_order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder'
  },

  // Ghi chú
  notes: {
    type: String,
    trim: true,
    default: ''
  },

  // Tracking
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// ═══════════════════════════════════════════════
// Indexes
// ═══════════════════════════════════════════════

// Mã lô unique trong phạm vi từng sản phẩm của từng shop
productBatchSchema.index({ tenant_id: 1, product_id: 1, batch_number: 1 }, { unique: true });

// Index phục vụ truy vấn FEFO (First Expired, First Out) — GĐ3 POS sẽ dùng
productBatchSchema.index({ tenant_id: 1, product_id: 1, expiry_date: 1, status: 1 });

// Index phục vụ cronjob quét hạn sử dụng — GĐ4 sẽ dùng
productBatchSchema.index({ tenant_id: 1, status: 1, expiry_date: 1 });

// ═══════════════════════════════════════════════
// Virtuals: Tính toán thời gian thực
// ═══════════════════════════════════════════════

// Số ngày còn lại đến hạn sử dụng
productBatchSchema.virtual('days_until_expiry').get(function () {
  if (!this.expiry_date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(this.expiry_date);
  expiry.setHours(0, 0, 0, 0);
  const diffMs = expiry.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
});

// Thời hạn sử dụng tổng (từ NSX đến HSD)
productBatchSchema.virtual('shelf_life_days').get(function () {
  if (!this.manufacturing_date || !this.expiry_date) return null;
  const mfg = new Date(this.manufacturing_date);
  const exp = new Date(this.expiry_date);
  return Math.ceil((exp.getTime() - mfg.getTime()) / (1000 * 60 * 60 * 24));
});

// Đảm bảo virtuals xuất hiện trong JSON response
productBatchSchema.set('toJSON', { virtuals: true });
productBatchSchema.set('toObject', { virtuals: true });

// ═══════════════════════════════════════════════
// Hooks: Tự động cập nhật tồn kho tổng của Product
// ═══════════════════════════════════════════════

async function updateProductTotalStock(productId) {
  try {
    const ProductBatch = mongoose.model('ProductBatch');
    const Product = mongoose.model('Product');

    const result = await ProductBatch.aggregate([
      { $match: { product_id: new mongoose.Types.ObjectId(productId), status: { $nin: ['destroyed'] } } },
      { $group: { _id: null, total: { $sum: '$quantity_in_stock' } } }
    ]);

    const totalStock = result.length > 0 ? result[0].total : 0;
    await Product.findByIdAndUpdate(productId, { total_stock: totalStock });
  } catch (error) {
    console.error('[ProductBatch Hook] Error updating total_stock:', error.message);
  }
}

// Sau khi lưu batch → Cập nhật tồn kho tổng Product
productBatchSchema.post('save', async function (doc) {
  await updateProductTotalStock(doc.product_id);
});

// Sau khi xóa batch → Cập nhật tồn kho tổng Product
productBatchSchema.post('findOneAndDelete', async function (doc) {
  if (doc) {
    await updateProductTotalStock(doc.product_id);
  }
});

// ═══════════════════════════════════════════════
// Đăng ký Tenant Plugin
// ═══════════════════════════════════════════════
productBatchSchema.plugin(tenantPlugin);

export default mongoose.model('ProductBatch', productBatchSchema);
