import Customer from '../models/Customer.js';
import Order from '../models/Order.js';
import Campaign from '../models/Campaign.js';
import ZnsLog from '../models/ZnsLog.js';

// Helper: Calculate baby age in months
function getBabyAgeInMonths(dob) {
  if (!dob) return null;
  const today = new Date();
  const birthDate = new Date(dob);
  const diffTime = today.getTime() - birthDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  return Math.floor(diffDays / 30);
}

// Helper: Calculate pregnancy week
function getPregnancyWeek(edd) {
  if (!edd) return null;
  const today = new Date();
  const eddDate = new Date(edd);
  const diffTime = eddDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const currentWeek = 40 - Math.floor(diffDays / 7);
  return currentWeek < 0 ? 0 : currentWeek;
}

// Helper: Get lifecycle segment label
function getSegmentLabel(customer) {
  if (customer.edd && !customer.baby_dob) {
    return 'PREGNANCY';
  }
  if (customer.baby_dob) {
    const ageMonths = getBabyAgeInMonths(customer.baby_dob);
    if (ageMonths === null) return 'PREGNANCY'; // baby_dob in the future = still pregnant
    if (ageMonths < 6) return 'NEWBORN';
    if (ageMonths < 12) return 'INFANT';
    if (ageMonths < 36) return 'TODDLER';
    return 'PRESCHOOL';
  }
  return 'UNKNOWN';
}

export const getDashboardStats = async (req, res) => {
  try {
    // 1. Total Customer Profiles
    const totalCustomers = await Customer.countDocuments({ status: { $ne: 'inactive' } });

    // 2. Khách hàng mới (Tháng này) - Khách có đơn hàng trong tháng
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const uniqueCustomersWithOrders = await Order.distinct('customer_id', {
      purchase_date: { $gte: startOfMonth }
    });
    const newRegistrations = uniqueCustomersWithOrders.length;

    // 3. Total Campaigns (tổng số chiến dịch)
    const totalCampaigns = await Campaign.countDocuments();

    // 4. Tin nhắn ZNS đã gửi (Tháng này)
    const totalZnsSent = await ZnsLog.countDocuments({
      sentAt: { $gte: startOfMonth },
      status: 'success'
    });

    // 5. Customer segments breakdown
    const allCustomers = await Customer.find({ status: { $ne: 'inactive' } }).lean();
    const segmentCounts = {
      PREGNANCY: 0,
      NEWBORN: 0,
      INFANT: 0,
      TODDLER: 0,
      PRESCHOOL: 0,
      UNKNOWN: 0
    };

    for (const cust of allCustomers) {
      const seg = getSegmentLabel(cust);
      segmentCounts[seg] = (segmentCounts[seg] || 0) + 1;
    }

    // 6. Monthly segmentation chart data (current year: Jan - Dec)
    const monthlySegmentation = [];
    const monthNames = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
    const currentYear = new Date().getFullYear();
    
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(currentYear, i, 1);
      const monthEnd = new Date(currentYear, i + 1, 0, 23, 59, 59, 999);

      const monthCustomers = allCustomers.filter(c => {
        const created = new Date(c.createdAt);
        return created >= monthStart && created <= monthEnd;
      });

      const monthData = {
        month: monthNames[i],
        pregnancy: 0,
        newborn: 0,
        infant: 0,
        toddler: 0,
        preschool: 0
      };

      for (const cust of monthCustomers) {
        const seg = getSegmentLabel(cust);
        if (seg === 'PREGNANCY') monthData.pregnancy++;
        else if (seg === 'NEWBORN') monthData.newborn++;
        else if (seg === 'INFANT') monthData.infant++;
        else if (seg === 'TODDLER') monthData.toddler++;
        else if (seg === 'PRESCHOOL') monthData.preschool++;
      }

      monthlySegmentation.push(monthData);
    }

    // 7. Recent & Upcoming Automations (active campaigns with milestones)
    const activeCampaigns = await Campaign.find({ status: { $in: ['active', 'scheduled'] } })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    const recentAutomations = activeCampaigns.map(camp => ({
      _id: camp._id,
      trigger: camp.type === 'LIFECYCLE' ? 'Vòng đời' : camp.type === 'PRODUCT_REFILL' ? 'Nhắc mua lại' : 'Khuyến mãi',
      childAgeStage: camp.milestones?.length > 0
        ? camp.milestones.map(m => `${m.stage === 'PREGNANCY' ? 'Thai kỳ' : 'Bé'} ${m.time_unit === 'WEEK' ? `Tuần ${m.time_value}` : `Tháng ${m.time_value}`}`).join(', ')
        : camp.type === 'PRODUCT_REFILL' ? 'Nhắc mua lại' : 'Tất cả',
      automationName: camp.name,
      status: camp.status
    }));

    // 8. Recent ZNS Logs (last 10)
    const recentLogs = await ZnsLog.find()
      .populate('customerId', 'name phone')
      .populate('campaign_id', 'name type')
      .sort({ sentAt: -1 })
      .limit(10)
      .lean();

    // 9. Customer list with lifecycle insights (top 20)
    const customerIds = allCustomers.slice(0, 20).map(c => c._id);
    const customerOrders = await Order.find({ customer_id: { $in: customerIds } })
      .sort({ purchase_date: -1 })
      .lean();

    const customerList = allCustomers.slice(0, 20).map(cust => {
      const orders = customerOrders.filter(o => o.customer_id.toString() === cust._id.toString());
      const lastOrder = orders[0];
      const totalSpent = orders.reduce((sum, o) => sum + (o.amount || 0), 0);
      const segment = getSegmentLabel(cust);

      let childAge = '';
      if (cust.baby_dob) {
        const months = getBabyAgeInMonths(cust.baby_dob);
        childAge = months !== null ? `${months} tháng` : '';
      } else if (cust.edd) {
        const week = getPregnancyWeek(cust.edd);
        childAge = week !== null ? `Thai kỳ (Tuần ${week})` : '';
      }

      return {
        _id: cust._id,
        parentName: cust.name || 'Mẹ',
        childName: cust.baby_name || '',
        dueDate: cust.edd || cust.baby_dob || null,
        childAge,
        segment,
        lastPurchase: lastOrder?.purchase_date || null,
        lifecycleValue: totalSpent,
        phone: cust.phone
      };
    });

    // 10. Alerts
    const alerts = [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 10.1 Refill alert (Sắp hết hàng trong 7 ngày tới)
    const next7Days = new Date(today);
    next7Days.setDate(next7Days.getDate() + 7);
    const refillOrdersCount = await Order.countDocuments({
      expected_refill_date: { $gte: today, $lte: next7Days }
    });
    if (refillOrdersCount > 0) {
      alerts.push({
        type: 'warning',
        message: `Có ${refillOrdersCount} khách hàng sắp dùng hết sản phẩm trong 7 ngày tới. Đừng quên thiết lập chiến dịch nhắc mua lại (Refill)!`
      });
    }

    // 10.2 ZNS Failed Today
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const failedZnsCount = await ZnsLog.countDocuments({
      sentAt: { $gte: today, $lt: tomorrow },
      status: 'failed'
    });
    if (failedZnsCount > 0) {
      alerts.push({
        type: 'error',
        message: `Hôm nay có ${failedZnsCount} tin nhắn ZNS gửi thất bại. Vui lòng kiểm tra lại Zalo OA hoặc mẫu tin nhắn.`
      });
    }

    // 10.3 Expecting Mothers (Dự sinh trong 14 ngày tới)
    const next14Days = new Date(today);
    next14Days.setDate(next14Days.getDate() + 14);
    const expectingMothersCount = await Customer.countDocuments({
      edd: { $gte: today, $lte: next14Days },
      status: { $ne: 'inactive' }
    });
    if (expectingMothersCount > 0) {
      alerts.push({
        type: 'info',
        message: `Có ${expectingMothersCount} mẹ bầu dự sinh trong vòng 2 tuần tới. Hãy sẵn sàng gửi ZNS chúc mừng và bán chéo đồ sơ sinh!`
      });
    }

    // 10.4 Generic positive alert if all clear
    if (alerts.length === 0) {
      alerts.push({
        type: 'success',
        message: 'Hệ thống đang hoạt động trơn tru. Không có cảnh báo hay rủi ro nào hôm nay.'
      });
    }

    res.status(200).json({
      keyMetrics: {
        totalCustomers,
        newRegistrations,
        totalCampaigns,
        totalZnsSent
      },
      segmentCounts,
      monthlySegmentation,
      recentAutomations,
      recentLogs,
      customerList,
      alerts
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Lỗi lấy dữ liệu dashboard', error: error.message });
  }
};
