import KiotVietConfig from '../models/KiotVietConfig.js';
import { syncProducts, syncCustomers, syncInvoices } from '../services/kiotvietService.js';

export const getConfig = async (req, res) => {
  try {
    const config = await KiotVietConfig.findOne();
    if (config) {
      // Don't send back access token and expires in to FE for security
      const { retailer, clientId, clientSecret } = config;
      res.status(200).json({ retailer, clientId, clientSecret });
    } else {
      res.status(404).json({ message: 'Configuration not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving configuration', error: error.message });
  }
};

export const saveConfig = async (req, res) => {
  try {
    const { retailer, clientId, clientSecret } = req.body;
    
    if (!retailer || !clientId || !clientSecret) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    let config = await KiotVietConfig.findOne();
    if (config) {
      config.retailer = retailer;
      config.clientId = clientId;
      config.clientSecret = clientSecret;
      await config.save();
    } else {
      config = new KiotVietConfig({ retailer, clientId, clientSecret });
      await config.save();
    }

    res.status(200).json({ message: 'Configuration saved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error saving configuration', error: error.message });
  }
};

export const syncProductsHandler = async (req, res) => {
  try {
    const count = await syncProducts();
    res.status(200).json({ message: `Đã đồng bộ ${count} sản phẩm mới hoặc cập nhật từ KiotViet.` });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi đồng bộ sản phẩm', error: error.message });
  }
};

export const syncCustomersHandler = async (req, res) => {
  try {
    const count = await syncCustomers();
    res.status(200).json({ message: `Đã đồng bộ ${count} khách hàng mới từ KiotViet.` });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi đồng bộ khách hàng', error: error.message });
  }
};

export const syncInvoicesHandler = async (req, res) => {
  try {
    const count = await syncInvoices();
    res.status(200).json({ message: `Đã đồng bộ ${count} đơn hàng từ hóa đơn KiotViet.` });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi đồng bộ hóa đơn', error: error.message });
  }
};

export const syncAllHandler = async (req, res) => {
  try {
    const productsCount = await syncProducts();
    const customersCount = await syncCustomers();
    const invoicesCount = await syncInvoices();
    
    res.status(200).json({ 
      message: 'Đồng bộ hoàn tất!',
      details: `Đã đồng bộ: ${productsCount} sản phẩm, ${customersCount} khách hàng, và ${invoicesCount} đơn hàng.`
    });
  } catch (error) {
    res.status(500).json({ message: 'Có lỗi xảy ra trong quá trình đồng bộ tổng hợp', error: error.message });
  }
};

