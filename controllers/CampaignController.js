import Campaign from '../models/Campaign.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import AuditLog from '../models/AuditLog.js';
import { logActivity } from '../utils/auditLog.js';
import { executeCampaign, executeMasterSubEvent, updateCampaignCronJob, removeCampaignCronJob } from '../services/zaloZnsService.js';

const syncProductCyclesAndOrders = async (milestones) => {
  if (!Array.isArray(milestones)) return;
  for (const m of milestones) {
    if (m.product_id && m.usage_cycle_days) {
      const cycle = parseInt(m.usage_cycle_days, 10);
      if (isNaN(cycle) || cycle <= 0) continue;

      const product = await Product.findById(m.product_id);
      if (product && product.usage_cycle_days !== cycle) {
        // Update product cycle
        product.usage_cycle_days = cycle;
        await product.save();
        
        // Retroactively update orders (where expected_refill_date is null/missing)
        const ordersToUpdate = await Order.find({ 
          product_id: product._id, 
          $or: [{ expected_refill_date: null }, { expected_refill_date: { $exists: false } }] 
        });
        
        if (ordersToUpdate.length > 0) {
          const bulkOps = ordersToUpdate.map(order => {
            const refillDate = new Date(order.purchase_date);
            refillDate.setDate(refillDate.getDate() + cycle);
            return {
              updateOne: {
                filter: { _id: order._id },
                update: { $set: { expected_refill_date: refillDate } }
              }
            };
          });
          await Order.bulkWrite(bulkOps);
          console.log(`[Sync] Updated ${bulkOps.length} orders for product ${product._id} with cycle ${cycle} days.`);
        }
      }
    }
  }
};

export const getCampaigns = async (req, res) => {
  try {
    const { status, is_auto_run } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (is_auto_run !== undefined) filter.is_auto_run = is_auto_run === 'true';

    // The user's right to view campaigns is already validated by requirePermission('campaign_view')
    // All users with this permission can view all campaigns.

    const campaigns = await Campaign.find(filter)
      .populate('product_id', 'name category usage_cycle_days')
      .populate('milestones.product_id', 'name category usage_cycle_days')
      .populate('created_by', 'fullName avatar')
      .populate('updated_by', 'fullName avatar')
      .sort({ createdAt: -1 });
    res.status(200).json(campaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const getCampaignById = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate('product_id', 'name category usage_cycle_days')
      .populate('milestones.product_id', 'name category usage_cycle_days');
    if (!campaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    res.status(200).json(campaign);
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const createCampaign = async (req, res) => {
  try {
    if (req.body.type === 'PRODUCT_REFILL' && req.body.milestones) {
      await syncProductCyclesAndOrders(req.body.milestones);
    }
    
    if (req.user) {
      req.body.created_by = req.user._id;
      req.body.updated_by = req.user._id;
    }

    const campaign = new Campaign(req.body);
    const saved = await campaign.save();
    await logActivity(req.user?._id, 'CREATE', 'Campaign', saved._id, `Tạo chiến dịch: ${saved.name}`);
    updateCampaignCronJob(saved);
    res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(400).json({ message: error.message });
  }
};

export const updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    const existingCampaign = await Campaign.findById(id);
    if (!existingCampaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    // The user's right to edit is already validated by requirePermission('campaign_edit')
    // so we don't need to restrict editing to only the creator.

    if (req.body.type === 'PRODUCT_REFILL' && req.body.milestones) {
      await syncProductCyclesAndOrders(req.body.milestones);
    }
    
    if (req.user) {
      req.body.updated_by = req.user._id;
    }

    const updated = await Campaign.findByIdAndUpdate(id, req.body, { returnDocument: 'after', runValidators: true });
    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    await logActivity(req.user?._id, 'UPDATE', 'Campaign', updated._id, `Cập nhật chiến dịch: ${updated.name}`);
    updateCampaignCronJob(updated);
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(400).json({ message: error.message });
  }
};

export const deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    const existingCampaign = await Campaign.findById(id);
    if (!existingCampaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    // The user's right to delete is already validated by requirePermission('campaign_delete')
    // so we don't need to restrict deletion to only the creator.

    await Campaign.findByIdAndDelete(id);
    
    if (req.user) {
      await logActivity(req.user._id, 'DELETE', 'Campaign', id, `Xóa chiến dịch: ${existingCampaign.name}`);
    }

    removeCampaignCronJob(id);
    res.status(200).json({ message: 'Đã xóa chiến dịch thành công' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const triggerManualCampaign = async (req, res) => {
  try {
    const { campaignId, audience, subEventIndex } = req.body;
    
    // Nếu chọn 'all', chạy dispatcher thủ công (quét tất cả campaign active)
    if (campaignId === 'all') {
      const activeCampaigns = await Campaign.find({ status: 'active' });
      for (const camp of activeCampaigns) {
        await executeCampaign(camp);
      }
      return res.status(200).json({ message: 'Đã kích hoạt quét toàn bộ hệ thống.' });
    }

    // Nếu chọn 1 chiến dịch cụ thể
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }

    // Master Campaign: chạy sub-events
    if (campaign.type === 'MASTER_CAMPAIGN') {
      const subEvents = campaign.sub_events || [];
      if (subEvents.length === 0) {
        return res.status(400).json({ message: 'Chiến dịch không có sự kiện con nào.' });
      }

      // Nếu truyền subEventIndex → chạy 1 sub-event cụ thể
      if (subEventIndex !== undefined && subEventIndex !== null) {
        const idx = parseInt(subEventIndex, 10);
        if (idx < 0 || idx >= subEvents.length) {
          return res.status(400).json({ message: `Sub-event index ${idx} không hợp lệ.` });
        }
        await executeMasterSubEvent(campaign, subEvents[idx], idx);
        return res.status(200).json({ message: `Đã kích hoạt sự kiện con [${subEvents[idx].name}] thành công.` });
      }

      // Nếu không truyền index → chạy tất cả sub-events
      for (let i = 0; i < subEvents.length; i++) {
        await executeMasterSubEvent(campaign, subEvents[i], i);
      }
      return res.status(200).json({ message: `Đã kích hoạt toàn bộ ${subEvents.length} sự kiện con thành công.` });
    }

    // Chạy chiến dịch thường
    await executeCampaign(campaign);

    res.status(200).json({ message: 'Đã kích hoạt chiến dịch thành công' });
  } catch (error) {
    console.error('Error triggering manual campaign:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
