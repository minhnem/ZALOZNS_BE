import Customer from '../models/Customer.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';

export const createCustomer = async (req, res) => {
  try {
    const { phone, product_id, purchase_date } = req.body;
    
    // 1. Create or Find Customer
    let customer = await Customer.findOne({ phone });
    if (!customer) {
      customer = new Customer({ phone });
      await customer.save();
    }

    // 2. If a product_id is provided, create an Order to trigger the BUYER conversion
    if (product_id) {
      const product = await Product.findById(product_id);
      if (product) {
        const order = new Order({
          customer_id: customer._id,
          product_id: product._id,
          product_name: product.name,
          purchase_date: purchase_date ? new Date(purchase_date) : new Date(),
          quantity: 1,
          amount: product.price || 0
        });
        await order.save(); // The Order post-save hook will update customer_type to BUYER and set next_refill_date
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
    
    const customers = await Customer.find(filter).sort({ createdAt: -1 });
    res.status(200).json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, baby_name, baby_dob, edd, is_estimated_dob, status, product_id, purchase_date } = req.body;

    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      { name, phone, baby_name, baby_dob, edd, is_estimated_dob, status },
      { new: true }
    );

    if (!updatedCustomer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    if (product_id) {
      const product = await Product.findById(product_id);
      if (product) {
        const order = new Order({
          customer_id: updatedCustomer._id,
          product_id: product._id,
          product_name: product.name,
          purchase_date: purchase_date ? new Date(purchase_date) : new Date(),
          quantity: 1,
          amount: product.price || 0
        });
        await order.save();
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
