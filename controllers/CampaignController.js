import Campaign from '../models/Campaign.js';
import { runCampaignDispatcher, executeCampaign } from '../services/zaloZnsService.js';

export const getCampaigns = async (req, res) => {
  try {
    const { status, is_auto_run } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (is_auto_run !== undefined) filter.is_auto_run = is_auto_run === 'true';

    const campaigns = await Campaign.find(filter)
      .populate('product_id', 'name category usage_cycle_days')
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
      .populate('product_id', 'name category usage_cycle_days');
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
    const campaign = new Campaign(req.body);
    const saved = await campaign.save();
    res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(400).json({ message: error.message });
  }
};

export const updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Campaign.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(400).json({ message: error.message });
  }
};

export const deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Campaign.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    res.status(200).json({ message: 'Đã xóa chiến dịch thành công' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const triggerManualCampaign = async (req, res) => {
  try {
    const { campaignId, audience } = req.body;
    
    // Nếu chọn 'all', chạy dispatcher mặc định (quét tất cả campaign active)
    if (campaignId === 'all') {
      await runCampaignDispatcher();
      return res.status(200).json({ message: 'Đã kích hoạt quét toàn bộ hệ thống.' });
    }

    // Nếu chọn 1 chiến dịch cụ thể
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }

    // Chạy chiến dịch đó (tạm thời bỏ qua filter audience=test ở level DB, 
    // vì ta chỉ cần kích hoạt hàm executeCampaign)
    await executeCampaign(campaign);

    res.status(200).json({ message: 'Đã kích hoạt chiến dịch thành công' });
  } catch (error) {
    console.error('Error triggering manual campaign:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
