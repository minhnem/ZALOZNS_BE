import axios from 'axios';
import KiotVietConfig from '../models/KiotVietConfig.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Order from '../models/Order.js';

const KIOTVIET_AUTH_URL = 'https://id.kiotviet.vn/connect/token';
const KIOTVIET_API_URL = 'https://public.kiotapi.com';

// Helper to format phone
function formatPhoneNumber(phone) {
  if (!phone) return null;
  let formatted = phone.trim().replace(/\D/g, ''); // Remove non-digits
  if (formatted.startsWith('0')) {
    formatted = '84' + formatted.slice(1);
  }
  return formatted;
}

export const getAccessToken = async () => {
  const config = await KiotVietConfig.findOne();
  if (!config) throw new Error('Chưa có cấu hình KiotViet');

  // Check if token exists and is still valid (add 5 mins buffer)
  if (config.accessToken && config.tokenCreatedAt && config.expiresIn) {
    const expiresAt = new Date(config.tokenCreatedAt.getTime() + config.expiresIn * 1000);
    const now = new Date(Date.now() + 5 * 60000);
    if (expiresAt > now) {
      return { token: config.accessToken, retailer: config.retailer };
    }
  }

  // Fetch new token
  try {
    const response = await axios.post(
      KIOTVIET_AUTH_URL,
      new URLSearchParams({
        scopes: 'PublicApi.Access',
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const data = response.data;
    config.accessToken = data.access_token;
    config.expiresIn = data.expires_in;
    config.tokenCreatedAt = new Date();
    await config.save();

    return { token: config.accessToken, retailer: config.retailer };
  } catch (error) {
    console.error('Lỗi khi lấy token KiotViet:', error.response?.data || error.message);
    throw new Error('Lỗi xác thực KiotViet. Vui lòng kiểm tra lại Client ID và Secret.');
  }
};

export const syncProducts = async () => {
  const { token, retailer } = await getAccessToken();
  let currentPage = 1;
  let hasMore = true;
  let syncedCount = 0;

  while (hasMore) {
    try {
      const response = await axios.get(`${KIOTVIET_API_URL}/products`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Retailer': retailer
        },
        params: {
          pageSize: 100,
          currentItem: (currentPage - 1) * 100
        }
      });

      const products = response.data.data;
      if (!products || products.length === 0) {
        hasMore = false;
        break;
      }

      for (const kvProduct of products) {
        // Find existing product by kiotviet_code or create new
        let p = await Product.findOne({ kiotviet_code: kvProduct.code });
        if (!p) {
           p = new Product({
             name: kvProduct.fullName || kvProduct.name,
             category: 'Khác',
             usage_cycle_days: 30,
             status: kvProduct.isActive ? 'active' : 'inactive',
             kiotviet_code: kvProduct.code
           });
           await p.save();
           console.log(`✅ Đã lưu Sản phẩm mới: ${p.name}`);
           syncedCount++;
        } else {
           if (p.name !== kvProduct.fullName || (kvProduct.isActive ? 'active' : 'inactive') !== p.status) {
              p.name = kvProduct.fullName || kvProduct.name;
              p.status = kvProduct.isActive ? 'active' : 'inactive';
              await p.save();
              console.log(`🔄 Đã cập nhật Sản phẩm: ${p.name}`);
              syncedCount++;
           }
        }
      }

      // Check if we fetched all
      if (products.length < 100) {
        hasMore = false;
      } else {
        currentPage++;
      }
    } catch (error) {
      console.error('Lỗi khi lấy Products KiotViet:', error.response?.data || error.message);
      throw error;
    }
  }
  return syncedCount;
};

export const syncCustomers = async () => {
  const { token, retailer } = await getAccessToken();
  let currentPage = 1;
  let hasMore = true;
  let syncedCount = 0;

  while (hasMore) {
    try {
      const response = await axios.get(`${KIOTVIET_API_URL}/customers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Retailer': retailer
        },
        params: {
          pageSize: 100,
          currentItem: (currentPage - 1) * 100
        }
      });

      const customers = response.data.data;
      if (!customers || customers.length === 0) {
        hasMore = false;
        break;
      }

      for (const kvCust of customers) {
        if (!kvCust.contactNumber) continue;
        const formattedPhone = formatPhoneNumber(kvCust.contactNumber);
        if (!formattedPhone) continue;

        let cust = await Customer.findOne({ phone: formattedPhone });
        if (!cust) {
          cust = new Customer({
            phone: formattedPhone,
            name: kvCust.name || 'Mẹ',
            source: 'KIOTVIET',
            kiotviet_id: kvCust.code
          });
          await cust.save();
          console.log(`✅ Đã lưu Khách hàng mới: ${cust.name} - ${cust.phone}`);
          syncedCount++;
        } else if (!cust.kiotviet_id || cust.kiotviet_id !== kvCust.code) {
          cust.kiotviet_id = kvCust.code;
          await cust.save();
          console.log(`🔄 Đã cập nhật ID KiotViet cho: ${cust.name} - ${cust.phone}`);
        }
      }

      if (customers.length < 100) {
        hasMore = false;
      } else {
        currentPage++;
      }
    } catch (error) {
       console.error('Lỗi khi lấy Customers KiotViet:', error.response?.data || error.message);
       throw error;
    }
  }
  return syncedCount;
};

export const syncInvoices = async () => {
  const { token, retailer } = await getAccessToken();

  let currentPage = 1;
  let hasMore = true;
  let syncedCount = 0;

  while (hasMore) {
    try {
      const response = await axios.get(`${KIOTVIET_API_URL}/invoices`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Retailer': retailer
        },
        params: {
          pageSize: 100,
          currentItem: (currentPage - 1) * 100,
          includeInvoiceDelivery: false,
          includePayment: false
        }
      });

      const invoices = response.data.data;
      if (!invoices || invoices.length === 0) {
        hasMore = false;
        break;
      }

      for (const invoice of invoices) {
        if (invoice.status !== 1) continue;

        // Skip invoices without customer or items
        if (!invoice.customerCode || !invoice.invoiceDetails) continue;

        // 1. Get customer details
        let cust = await Customer.findOne({ kiotviet_id: invoice.customerCode });
        
        // If not found locally, fetch from KiotViet as fallback
        if (!cust) {
          try {
            const kvCustResp = await axios.get(`${KIOTVIET_API_URL}/customers/${invoice.customerCode}`, {
              headers: { 'Authorization': `Bearer ${token}`, 'Retailer': retailer }
            });
            const kvCust = kvCustResp.data;
            if (!kvCust || !kvCust.contactNumber) continue;
            
            const formattedPhone = formatPhoneNumber(kvCust.contactNumber);
            if (!formattedPhone) continue;

            cust = await Customer.findOne({ phone: formattedPhone });
            if (!cust) {
              cust = new Customer({
                phone: formattedPhone,
                name: kvCust.name || 'Mẹ',
                source: 'KIOTVIET',
                kiotviet_id: kvCust.code
              });
              await cust.save();
            } else {
              cust.kiotviet_id = kvCust.code;
              await cust.save();
            }
          } catch (err) {
            console.error(`Lỗi khi tải thông tin khách hàng KiotViet (${invoice.customerCode}):`, err.message);
            continue;
          }
        }

        // 2. Process invoice details
        const purchaseDate = new Date(invoice.purchaseDate);

        for (const detail of invoice.invoiceDetails) {
          const pCode = detail.productCode;
          const qty = detail.quantity;

          // Check if this product is mapped in Zalo OA
          const localProduct = await Product.findOne({ kiotviet_code: pCode });
          if (!localProduct) continue;

          const existingOrder = await Order.findOne({
            customer_id: cust._id,
            product_id: localProduct._id
          });

          if (!existingOrder) {
            const order = new Order({
              customer_id: cust._id,
              product_id: localProduct._id,
              product_name: localProduct.name,
              purchase_date: purchaseDate,
              quantity: qty,
              amount: detail.subTotal
            });
            await order.save(); // The post-save hook will calculate expected_refill_date
            console.log(`✅ Đã lưu Đơn hàng mới: ${cust.name} mua ${localProduct.name}`);
            syncedCount++;
          } else {
            // Khách hàng đã từng mua sản phẩm này, chỉ cập nhật nếu hóa đơn này mới hơn mốc cũ
            if (purchaseDate > existingOrder.purchase_date) {
               existingOrder.purchase_date = purchaseDate;
               existingOrder.quantity = qty;
               existingOrder.amount = detail.subTotal;
               await existingOrder.save(); // Kích hoạt lại Hook để tính lại ngày hết sữa
               console.log(`🔄 Đã cập nhật Đơn hàng (Khách mua lại): ${cust.name} mua ${localProduct.name}`);
               syncedCount++;
            }
          }
        }
      }

      if (invoices.length < 100) {
        hasMore = false;
      } else {
        currentPage++;
      }
    } catch (error) {
      console.error('Lỗi khi lấy Invoices KiotViet:', error.response?.data || error.message);
      throw error;
    }
  }
  return syncedCount;
};
