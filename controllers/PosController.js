import {
  searchPosProducts,
  getBatchesFEFO,
  processPosCheckout
} from '../services/posService.js';
import SalesOrder from '../models/SalesOrder.js';
import Customer from '../models/Customer.js';
import Tenant from '../models/Tenant.js';
import { logActivity } from '../utils/auditLog.js';

/**
 * Controller: POS Terminal (Điểm bán hàng tại quầy)
 */

// GET /api/pos/products
export const getPosProducts = async (req, res) => {
  try {
    const { q = '', inStock = 'false', limit = 200 } = req.query;
    const inStockOnly = inStock === 'true';
    const products = await searchPosProducts(q, inStockOnly, Number(limit) || 200);
    res.status(200).json(products);
  } catch (error) {
    console.error('Error searching POS products:', error);
    res.status(500).json({ message: 'Lỗi khi tìm kiếm sản phẩm', error: error.message });
  }
};

// GET /api/pos/products/:id/batches
export const getProductBatches = async (req, res) => {
  try {
    const { id } = req.params;
    const batches = await getBatchesFEFO(id);
    res.status(200).json(batches);
  } catch (error) {
    console.error('Error getting batches for product:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách lô hàng', error: error.message });
  }
};

// GET /api/pos/customers
export const searchPosCustomers = async (req, res) => {
  try {
    const { q = '' } = req.query;
    const trimmed = q.trim();

    if (!trimmed) {
      const recents = await Customer.find({ status: 'active' })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('name phone customer_type baby_name edd baby_dob')
        .lean();
      return res.status(200).json(recents);
    }

    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const customers = await Customer.find({
      status: 'active',
      $or: [
        { phone: { $regex: escaped, $options: 'i' } },
        { name: { $regex: escaped, $options: 'i' } }
      ]
    })
      .limit(20)
      .select('name phone customer_type baby_name edd baby_dob')
      .lean();

    res.status(200).json(customers);
  } catch (error) {
    console.error('Error searching POS customers:', error);
    res.status(500).json({ message: 'Lỗi khi tìm kiếm khách hàng', error: error.message });
  }
};

// POST /api/pos/customers
export const createPosQuickCustomer = async (req, res) => {
  try {
    const { name, phone, baby_name, baby_dob, edd } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: 'Số điện thoại là bắt buộc' });
    }

    const cleanPhone = phone.trim();
    const existing = await Customer.findOne({ phone: cleanPhone });
    if (existing) {
      return res.status(200).json(existing);
    }

    const customer = new Customer({
      name: name && name.trim() ? name.trim() : 'Mẹ',
      phone: cleanPhone,
      baby_name: baby_name ? baby_name.trim() : undefined,
      baby_dob: baby_dob || undefined,
      edd: edd || undefined,
      customer_type: 'BUYER',
      source: 'POS_COUNTER',
      created_by: req.user?._id
    });

    const saved = await customer.save();
    await logActivity(req.user?._id, 'CREATE', 'Customer', saved._id, `Tạo nhanh khách hàng tại quầy POS: ${saved.name} (${saved.phone})`);

    res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating POS customer:', error);
    res.status(400).json({ message: error.message });
  }
};

// POST /api/pos/checkout
export const posCheckout = async (req, res) => {
  try {
    const result = await processPosCheckout(req.body, req.user);

    await logActivity(
      req.user?._id,
      'CREATE',
      'SalesOrder',
      result.order._id,
      `Bán lẻ tại quầy: Hóa đơn ${result.order.order_code} - Khách: ${result.order.customer_name} - Tổng tiền: ${result.order.final_amount.toLocaleString('vi-VN')} đ`
    );

    res.status(201).json(result);
  } catch (error) {
    console.error('POS Checkout Error:', error);
    res.status(400).json({ message: error.message });
  }
};

// GET /api/pos/orders
export const getPosOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const filter = {};

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { order_code: { $regex: q, $options: 'i' } },
        { customer_name: { $regex: q, $options: 'i' } },
        { customer_phone: { $regex: q, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      SalesOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      SalesOrder.countDocuments(filter)
    ]);

    res.status(200).json({
      orders,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit))
    });
  } catch (error) {
    console.error('Error fetching POS orders:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách đơn bán hàng', error: error.message });
  }
};

// GET /api/pos/orders/:id
export const getPosOrderById = async (req, res) => {
  try {
    const order = await SalesOrder.findById(req.params.id).lean();
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
    }

    let tenant = null;
    if (order.tenant_id) {
      tenant = await Tenant.findById(order.tenant_id).select('name phone address').lean();
    }

    res.status(200).json({ order, tenant });
  } catch (error) {
    console.error('Error fetching POS order detail:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết hóa đơn', error: error.message });
  }
};
