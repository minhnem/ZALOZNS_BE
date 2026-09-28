import express from 'express';
import ZaloOAConfig from '../models/ZaloOAConfig.js';
import { runAsSuperAdmin, runWithTenant } from '../utils/tenantContext.js';

const router = express.Router();

// Route này KHÔNG đi qua authMiddleware (Zalo không gửi kèm JWT)
router.post('/zalo', async (req, res) => {
  const payload = req.body;
  const oa_id = payload?.recipient?.id || payload?.oa_id;
  
  if (!oa_id) return res.status(400).json({ error: 'Missing oa_id' });
  
  try {
    // Query KHÔNG qua plugin (dùng Super Admin context vì chưa có tenant)
    const oaConfig = await runAsSuperAdmin(() => 
      ZaloOAConfig.findOne({ oa_id })
    );
    
    if (!oaConfig) return res.status(404).json({ error: 'OA not found' });
    
    // Set tenant context và xử lý webhook
    await runWithTenant(oaConfig.tenant_id, async () => {
      // TODO: Xử lý logic webhook tại đây (VD: lưu tin nhắn, reply...)
      // Từ đây mọi lệnh query (như Customer.find, Message.create) 
      // đều tự động được gắn tenant_id của Shop
      console.log(`[Webhook] Đã nhận sự kiện Zalo cho Shop ID: ${oaConfig.tenant_id}`);
      console.log(`[Webhook] Event Name: ${payload?.event_name}`);
    });
    
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
