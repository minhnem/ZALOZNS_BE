import Campaign from '../models/Campaign.js';
import ZnsLog from '../models/ZnsLog.js';
import mongoose from 'mongoose';

export const getCampaignReports = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build match condition for ZnsLog dates
    const dateMatch = {};
    if (startDate) {
      dateMatch.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateMatch.$lte = end;
    }

    // Find all campaigns first
    const campaigns = await Campaign.find({}).lean();
    
    // Aggregate ZnsLogs to count success/failed per campaign within the date range
    const aggregateQuery = [];
    if (Object.keys(dateMatch).length > 0) {
      aggregateQuery.push({ $match: { sentAt: dateMatch } });
    }

    aggregateQuery.push({
      $group: {
        _id: '$campaign_id',
        successCount: {
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
        },
        failedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        totalCount: { $sum: 1 }
      }
    });

    const logStats = await ZnsLog.aggregate(aggregateQuery);

    // Overall Stats & Daily Stats for Charts
    const overallStats = { success: 0, failed: 0 };
    const dailyMap = {}; // { 'YYYY-MM-DD': { success: 0, failed: 0 } }

    const result = campaigns.map(camp => {
      const stat = logStats.find(s => s._id && s._id.toString() === camp._id.toString()) || {
        successCount: 0,
        failedCount: 0,
        totalCount: 0
      };
      
      return {
        _id: camp._id,
        name: camp.name,
        type: camp.type,
        status: camp.status,
        successCount: stat.successCount,
        failedCount: stat.failedCount,
        totalCount: stat.totalCount
      };
    }).filter(camp => camp.totalCount > 0);

    // Get raw logs for the charts
    const rawLogs = await ZnsLog.find(Object.keys(dateMatch).length > 0 ? { sentAt: dateMatch } : {}).select('sentAt status').lean();
    rawLogs.forEach(log => {
      if (log.status === 'success') overallStats.success++;
      else if (log.status === 'failed') overallStats.failed++;

      if (log.sentAt) {
        const d = new Date(log.sentAt);
        const dateString = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        if (!dailyMap[dateString]) dailyMap[dateString] = { success: 0, failed: 0, date: dateString };
        if (log.status === 'success') dailyMap[dateString].success++;
        else if (log.status === 'failed') dailyMap[dateString].failed++;
      }
    });

    const dailyStats = Object.values(dailyMap).sort((a, b) => {
      const [dayA, monthA] = a.date.split('/');
      const [dayB, monthB] = b.date.split('/');
      return new Date(2000, monthA - 1, dayA) - new Date(2000, monthB - 1, dayB);
    });

    res.status(200).json({
      campaigns: result,
      overallStats,
      dailyStats
    });
  } catch (error) {
    console.error('Error fetching campaign reports:', error);
    res.status(500).json({ message: 'Lỗi khi lấy báo cáo chiến dịch', error: error.message });
  }
};

export const getCampaignDetailLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const query = { campaign_id: id };

    if (startDate || endDate) {
      query.sentAt = {};
      if (startDate) query.sentAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.sentAt.$lte = end;
      }
    }

    const logs = await ZnsLog.find(query)
      .populate('customerId', 'name phone baby_name baby_dob edd')
      .sort({ sentAt: -1 })
      .lean();

    res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching campaign logs:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết chiến dịch', error: error.message });
  }
};
