import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  customer_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Customer', 
    required: true 
  },
  product_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  product_name: { 
    type: String, 
    required: true 
  },
  purchase_date: { 
    type: Date, 
    required: true, 
    default: Date.now 
  },
  quantity: { 
    type: Number, 
    default: 1, 
    min: 1 
  },
  amount: { 
    type: Number, 
    default: 0 
  },
  expected_refill_date: { 
    type: Date 
  }
}, { timestamps: true });

// Mongoose Hook: Sau khi tạo Order, tự động cập nhật Customer.next_refill_date
orderSchema.post('save', async function (doc) {
  try {
    const Product = mongoose.model('Product');
    const Customer = mongoose.model('Customer');

    const product = await Product.findById(doc.product_id);
    if (!product || !product.usage_cycle_days) return;

    // Tính ngày dự kiến hết
    const refillDate = new Date(doc.purchase_date);
    refillDate.setDate(refillDate.getDate() + product.usage_cycle_days);

    // Cập nhật vào chính Order này
    await mongoose.model('Order').findByIdAndUpdate(doc._id, {
      expected_refill_date: refillDate
    });

    // Cập nhật Customer.next_refill_date = ngày refill gần nhất trong tương lai, đồng thời chuyển loại thành BUYER
    await Customer.findByIdAndUpdate(doc.customer_id, {
      next_refill_date: refillDate,
      last_purchased_product: doc.product_name,
      customer_type: 'BUYER'
    });

    console.log(`[Order Hook] Updated next_refill_date for customer ${doc.customer_id} → ${refillDate.toISOString()}`);
  } catch (error) {
    console.error('[Order Hook Error]', error.message);
  }
});

export default mongoose.model('Order', orderSchema);
