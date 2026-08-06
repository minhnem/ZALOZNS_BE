import Order from '../models/Order.js';
import Product from '../models/Product.js';

export const getOrders = async (req, res) => {
  try {
    const { customer_id } = req.query;
    const filter = customer_id ? { customer_id } : {};

    const orders = await Order.find(filter)
      .populate('customer_id', 'name phone')
      .populate('product_id', 'name category usage_cycle_days')
      .sort({ purchase_date: -1 });

    res.status(200).json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const createOrder = async (req, res) => {
  try {
    // Auto-fill product_name từ product_id nếu FE không gửi
    if (req.body.product_id && !req.body.product_name) {
      const product = await Product.findById(req.body.product_id);
      if (product) {
        req.body.product_name = product.name;
      }
    }

    const order = new Order(req.body);
    const saved = await order.save(); // Hook post-save tự động cập nhật Customer.next_refill_date
    res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(400).json({ message: error.message });
  }
};

export const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Order.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(400).json({ message: error.message });
  }
};

export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Order.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
    res.status(200).json({ message: 'Đã xóa đơn hàng thành công' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
