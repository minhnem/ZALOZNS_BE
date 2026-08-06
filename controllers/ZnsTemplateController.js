import ZnsTemplate from '../models/ZnsTemplate.js';
import ZaloOAConfig from '../models/ZaloOAConfig.js';
import axios from 'axios';

// 1. Sync Templates from Zalo OA API
export const syncTemplates = async (req, res) => {
  try {
    const config = await ZaloOAConfig.findOne();
    if (!config || !config.access_token) {
      return res.status(400).json({ message: 'Chưa cấu hình Zalo OA hoặc thiếu Access Token.' });
    }

    const response = await axios.get('https://business.openapi.zalo.me/template/all', {
      headers: {
        'access_token': config.access_token,
        'Content-Type': 'application/json'
      },
      params: {
        offset: 0,
        limit: 100
      }
    });

    const data = response.data;

    if (data.error !== 0) {
      return res.status(400).json({ 
        message: 'Lỗi từ Zalo OA API', 
        error: data.message 
      });
    }

    const zaloTemplates = data.data || [];
    let syncedCount = 0;

    // Known SYSTEM variables that auto-map from Customer data
    const SYSTEM_VARS = {
      'customer_name': 'Tên khách hàng',
      'phone': 'Số điện thoại',
      'product_name': 'Tên sản phẩm',
      'refill_date': 'Ngày dự kiến hết',
      'baby_name': 'Tên bé'
    };

    const LIFECYCLE_VARS = {
      'stage_greetings': 'Lời chào theo giai đoạn',
      'care_content': 'Nội dung chăm sóc',
      'recommended_items': 'Gợi ý sản phẩm'
    };

    for (const tpl of zaloTemplates) {
      // Extract params from template content (find {param_name} patterns)
      const contentStr = tpl.previewUrl || tpl.templateContent || '';
      const paramMatches = contentStr.match(/\{(\w+)\}/g);
      const paramNames = paramMatches ? [...new Set(paramMatches.map(p => p.replace(/[{}]/g, '')))] : [];

      // Build structured params, auto-detect type
      const params = paramNames.map(name => {
        if (SYSTEM_VARS[name]) return { name, label: SYSTEM_VARS[name], type: 'SYSTEM' };
        if (LIFECYCLE_VARS[name]) return { name, label: LIFECYCLE_VARS[name], type: 'LIFECYCLE' };
        return { name, label: name, type: 'CUSTOM' };
      });

      // Only update params if template is new (don't overwrite admin's manual config)
      const existing = await ZnsTemplate.findOne({ template_id: String(tpl.templateId) });

      const updateData = {
        template_id: String(tpl.templateId),
        name: tpl.templateName || 'Không có tên',
        status: tpl.status === 1 ? 'APPROVED' : tpl.status === 2 ? 'REJECTED' : 'PENDING',
        type: tpl.templateTag || 'CSKH',
        price: tpl.price || 0,
        content: contentStr,
        last_synced_at: new Date()
      };

      // Only set params if template is new (preserve admin config on existing)
      if (!existing) {
        updateData.params = params;
      }

      await ZnsTemplate.findOneAndUpdate(
        { template_id: String(tpl.templateId) },
        updateData,
        { upsert: true, new: true }
      );
      syncedCount++;
    }

    res.status(200).json({ 
      message: `Đồng bộ thành công ${syncedCount} template từ Zalo OA!`, 
      count: syncedCount 
    });
  } catch (error) {
    console.error('Error syncing templates:', error.response?.data || error.message);
    res.status(500).json({ message: 'Lỗi đồng bộ template', error: error.message });
  }
};

// 2. Get All Templates (with search & filter)
export const getTemplates = async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { template_id: { $regex: search, $options: 'i' } }
      ];
    }

    const templates = await ZnsTemplate.find(filter).sort({ updatedAt: -1 });
    res.status(200).json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ message: 'Lỗi lấy danh sách template', error: error.message });
  }
};

// 3. Get Template by ID
export const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await ZnsTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ message: 'Không tìm thấy template' });
    }
    res.status(200).json(template);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy chi tiết template', error: error.message });
  }
};

// 4. Create Template (manual)
export const createTemplate = async (req, res) => {
  try {
    const { template_id, name, type, price, content, status, params } = req.body;

    // Check if template_id already exists
    const existing = await ZnsTemplate.findOne({ template_id });
    if (existing) {
      return res.status(400).json({ message: 'Template ID đã tồn tại!' });
    }

    const template = new ZnsTemplate({
      template_id,
      name,
      type: type || 'CSKH',
      price: price || 0,
      content: content || '',
      status: status || 'PENDING',
      params: params || []
    });

    await template.save();
    res.status(201).json({ message: 'Thêm template thành công!', template });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ message: 'Lỗi thêm template', error: error.message });
  }
};

// 5. Update Template
export const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { template_id, name, type, price, content, status, params } = req.body;

    const updated = await ZnsTemplate.findByIdAndUpdate(
      id,
      { template_id, name, type, price, content, status, params: params || [] },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy template' });
    }

    res.status(200).json({ message: 'Cập nhật template thành công!', template: updated });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ message: 'Lỗi cập nhật template', error: error.message });
  }
};

// 6. Delete Template
export const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ZnsTemplate.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy template' });
    }

    res.status(200).json({ message: 'Xóa template thành công!' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ message: 'Lỗi xóa template', error: error.message });
  }
};
