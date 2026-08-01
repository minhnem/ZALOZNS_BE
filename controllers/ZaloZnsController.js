import ZaloZNS from '../models/ZaloZNS.js';

// Get Zalo ZNS Config & Milestones
export const getConfig = async (req, res) => {
  try {
    const config = await ZaloZNS.findOne();
    res.status(200).json(config || {});
  } catch (error) {
    res.status(500).json({ message: "Lỗi lấy cấu hình ZNS", error: error.message });
  }
};

// Update or Create Zalo ZNS Config (oaId, accessToken, etc.)
export const updateConfig = async (req, res) => {
  try {
    const { oaId, oaName, appId, secretKey, accessToken, refreshToken, znsTemplateId } = req.body;
    let config = await ZaloZNS.findOne();
    
    if (!config) {
      config = new ZaloZNS({ oaId, oaName, appId, secretKey, accessToken, refreshToken, znsTemplateId });
    } else {
      if (oaId) config.oaId = oaId;
      if (oaName) config.oaName = oaName;
      if (appId) config.appId = appId;
      if (secretKey) config.secretKey = secretKey;
      if (accessToken) config.accessToken = accessToken;
      if (refreshToken) config.refreshToken = refreshToken;
      if (znsTemplateId) config.znsTemplateId = znsTemplateId;
    }

    await config.save();
    res.status(200).json({ message: "Cập nhật cấu hình thành công", config });
  } catch (error) {
    res.status(500).json({ message: "Lỗi cập nhật cấu hình", error: error.message });
  }
};

// Add a new Milestone
export const addMilestone = async (req, res) => {
  try {
    const { stage, weekAge, title, stage_greetings, care_content, recommended_items } = req.body;
    
    const config = await ZaloZNS.findOne();
    if (!config) {
      return res.status(404).json({ message: "Chưa có cấu hình ZaloZNS, vui lòng tạo trước." });
    }

    // Check if milestone exists
    const exists = config.scriptMilestones.find(m => m.stage === stage && m.weekAge === Number(weekAge));
    if (exists) {
      return res.status(400).json({ message: "Kịch bản ở mốc thời gian này đã tồn tại!" });
    }

    config.scriptMilestones.push({ stage, weekAge, title, stage_greetings, care_content, recommended_items });
    await config.save();

    res.status(201).json({ message: "Thêm kịch bản thành công", scriptMilestones: config.scriptMilestones });
  } catch (error) {
    res.status(500).json({ message: "Lỗi thêm kịch bản", error: error.message });
  }
};

// Edit an existing Milestone by ID
export const editMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    const { stage, weekAge, title, stage_greetings, care_content, recommended_items } = req.body;
    
    const config = await ZaloZNS.findOne();
    if (!config) return res.status(404).json({ message: "Không tìm thấy cấu hình." });

    const milestoneIndex = config.scriptMilestones.findIndex(m => m._id.toString() === id);
    if (milestoneIndex === -1) {
      return res.status(404).json({ message: "Không tìm thấy kịch bản cần sửa." });
    }

    config.scriptMilestones[milestoneIndex] = { 
      ...config.scriptMilestones[milestoneIndex].toObject(), 
      stage: stage || config.scriptMilestones[milestoneIndex].stage, 
      weekAge: weekAge !== undefined ? weekAge : config.scriptMilestones[milestoneIndex].weekAge, 
      title: title || config.scriptMilestones[milestoneIndex].title, 
      stage_greetings: stage_greetings || config.scriptMilestones[milestoneIndex].stage_greetings, 
      care_content: care_content || config.scriptMilestones[milestoneIndex].care_content, 
      recommended_items: recommended_items || config.scriptMilestones[milestoneIndex].recommended_items 
    };

    await config.save();
    res.status(200).json({ message: "Cập nhật kịch bản thành công", scriptMilestones: config.scriptMilestones });
  } catch (error) {
    res.status(500).json({ message: "Lỗi cập nhật kịch bản", error: error.message });
  }
};

// Delete a Milestone by ID
export const deleteMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    
    const config = await ZaloZNS.findOne();
    if (!config) return res.status(404).json({ message: "Không tìm thấy cấu hình." });

    const initialLength = config.scriptMilestones.length;
    config.scriptMilestones = config.scriptMilestones.filter(m => m._id.toString() !== id);

    if (config.scriptMilestones.length === initialLength) {
      return res.status(404).json({ message: "Không tìm thấy kịch bản cần xóa." });
    }

    await config.save();
    res.status(200).json({ message: "Xóa kịch bản thành công", scriptMilestones: config.scriptMilestones });
  } catch (error) {
    res.status(500).json({ message: "Lỗi xóa kịch bản", error: error.message });
  }
};
