import mongoose from 'mongoose';
import { getTenantId, isSuperAdmin } from './tenantContext.js';

/**
 * Mongoose Tenant Plugin
 * 
 * "Người gác cổng" của hệ thống Multi-tenant.
 * Tự động thêm điều kiện { tenant_id } vào mọi thao tác CRUD trên MongoDB.
 * 
 * Cách dùng:
 *   import { tenantPlugin } from '../utils/tenantPlugin.js';
 *   mySchema.plugin(tenantPlugin);
 * 
 * Plugin sẽ:
 * - Thêm field `tenant_id` vào schema
 * - Tự động gắn tenant_id khi CREATE (save, insertMany)
 * - Tự động filter tenant_id khi READ (find, findOne, count, aggregate)
 * - Tự động filter tenant_id khi UPDATE (findOneAndUpdate, updateMany)
 * - Tự động filter tenant_id khi DELETE (deleteOne, deleteMany)
 * - Bypass tất cả nếu đang chạy trong Super Admin context
 */
export const tenantPlugin = (schema) => {
  // ═══════════════════════════════════════════════
  // 1. THÊM FIELD tenant_id VÀO SCHEMA
  // ═══════════════════════════════════════════════
  schema.add({
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [
        function() { return !this.is_super_admin; }, 
        'tenant_id là bắt buộc'
      ],
      index: true
    }
  });

  // ═══════════════════════════════════════════════
  // 2. TỰ ĐỘNG GẮN tenant_id KHI TẠO MỚI (trước khi validate)
  // ═══════════════════════════════════════════════
  schema.pre('validate', function () {
    if (isSuperAdmin()) return;

    // Chỉ gắn tenant_id khi tạo mới (isNew) và chưa có tenant_id
    if (this.isNew && !this.tenant_id) {
      const tenantId = getTenantId();
      if (!tenantId) {
        throw new Error('Không tìm thấy tenant context. Không thể tạo document.');
      }
      this.tenant_id = tenantId;
    }
  });


  // ═══════════════════════════════════════════════
  // 3. TỰ ĐỘNG GẮN tenant_id KHI insertMany
  // ═══════════════════════════════════════════════
  schema.pre('insertMany', function (next, docs) {
    if (isSuperAdmin()) return next();

    const tenantId = getTenantId();
    if (!tenantId) {
      return next(new Error('Không tìm thấy tenant context. Không thể insertMany.'));
    }

    if (Array.isArray(docs)) {
      docs.forEach(doc => {
        if (!doc.tenant_id) {
          doc.tenant_id = tenantId;
        }
      });
    }
    next();
  });

  // ═══════════════════════════════════════════════
  // 4. TỰ ĐỘNG FILTER tenant_id CHO TẤT CẢ QUERY
  // ═══════════════════════════════════════════════

  // Danh sách các query operations cần hook
  const queryHooks = [
    'find',
    'findOne',
    'findById',
    'countDocuments',
    'estimatedDocumentCount',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'replaceOne'
  ];

  queryHooks.forEach(hook => {
    schema.pre(hook, function () {
      if (isSuperAdmin()) return;

      const tenantId = getTenantId();
      if (!tenantId) {
        // Nếu không có context, CHẶN query để tránh rò rỉ dữ liệu
        // Thêm điều kiện impossible để query trả về rỗng
        this.where({ tenant_id: null });
        console.warn(`[TenantPlugin] WARNING: Query "${hook}" chạy không có tenant context. Đã chặn query.`);
        return;
      }

      // Thêm điều kiện filter tenant_id
      this.where({ tenant_id: tenantId });
    });
  });

  // ═══════════════════════════════════════════════
  // 5. TỰ ĐỘNG FILTER tenant_id CHO AGGREGATE
  // ═══════════════════════════════════════════════
  schema.pre('aggregate', function () {
    if (isSuperAdmin()) return;

    const tenantId = getTenantId();
    if (!tenantId) {
      // Chặn aggregate bằng điều kiện impossible
      this.pipeline().unshift({
        $match: { tenant_id: null }
      });
      console.warn('[TenantPlugin] WARNING: Aggregate chạy không có tenant context. Đã chặn pipeline.');
      return;
    }

    // Thêm $match tenant_id vào đầu pipeline
    this.pipeline().unshift({
      $match: { tenant_id: new mongoose.Types.ObjectId(tenantId) }
    });
  });
};

export default tenantPlugin;
