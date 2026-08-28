import cron from 'node-cron';
import axios from 'axios';
import Customer from '../models/Customer.js';
import Campaign from '../models/Campaign.js';
import ZaloOAConfig from '../models/ZaloOAConfig.js';
import ZnsLog from '../models/ZnsLog.js';
import Order from '../models/Order.js';

// Calculate Pregnancy Week
function getPregnancyWeek(edd) {
  if (!edd) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eddDate = new Date(edd);
  eddDate.setHours(0, 0, 0, 0);
  const diffTime = eddDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const currentWeek = 40 - Math.floor(diffDays / 7);
  return currentWeek < 0 ? 0 : currentWeek;
}

// Calculate Pregnancy Month
function getPregnancyMonth(edd) {
  const week = getPregnancyWeek(edd);
  if (week === null) return null;
  return Math.ceil(week / 4);
}

// Calculate Pregnancy Day
function getPregnancyDay(edd) {
  if (!edd) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eddDate = new Date(edd);
  eddDate.setHours(0, 0, 0, 0);
  const diffTime = eddDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const currentDay = 280 - diffDays;
  return currentDay < 0 ? 0 : currentDay;
}

// Calculate Baby Age in Weeks
function getBabyAgeInWeeks(dob) {
  if (!dob) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const birthDate = new Date(dob);
  birthDate.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - birthDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  return Math.floor(diffDays / 7);
}

// Calculate Baby Age in Days
function getBabyAgeInDays(dob) {
  if (!dob) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const birthDate = new Date(dob);
  birthDate.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - birthDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays < 0 ? null : diffDays;
}

// Calculate Baby Age in Months
function getBabyAgeInMonths(dob) {
  if (!dob) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const birthDate = new Date(dob);
  birthDate.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - birthDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  return Math.floor(diffDays / 30);
}

// Format Phone Number to 84xxx
function formatPhoneNumber(phone) {
  if (!phone) return null;
  let formatted = phone.trim().replace(/\D/g, ''); // Remove non-digits
  if (formatted.startsWith('0')) {
    formatted = '84' + formatted.slice(1);
  }
  return formatted;
}

// Function to get active Zalo OA Config
async function getZaloConfig() {
  const config = await ZaloOAConfig.findOne();
  if (!config) throw new Error('Zalo OA Config is missing from the database.');
  return config;
}

// 1. Refresh Token Function
export const refreshZaloToken = async () => {
  console.log('--- Starting Zalo Access Token Refresh Job ---');
  try {
    const config = await getZaloConfig();
    if (!config.refresh_token || !config.app_id || !config.secret_key) {
      console.error('Missing Zalo credentials to refresh token');
      return;
    }

    const response = await axios.post('https://oauth.zaloapp.com/v4/oa/access_token', null, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': config.secret_key
      },
      params: {
        refresh_token: config.refresh_token,
        app_id: config.app_id,
        grant_type: 'refresh_token'
      }
    });

    const data = response.data;
    if (data.access_token && data.refresh_token) {
      config.access_token = data.access_token;
      config.refresh_token = data.refresh_token;
      config.token_expires_at = new Date(Date.now() + (data.expires_in * 1000));
      await config.save();
      console.log('[Success] Zalo Access Token Refreshed');
    } else {
      console.error('[Error] Zalo Refresh Failed:', data);
    }
  } catch (error) {
    console.error('[Error] Zalo Refresh Job Exception:', error.response?.data || error.message);
  }
};

// 2. Execute a Single Campaign
export const executeCampaign = async (campaign) => {
  console.log(`\n>>> Executing Campaign: [${campaign.name}]`);
  try {
    let config = await getZaloConfig();
    if (!config.access_token) {
      console.error('Access token is missing. Please refresh token first.');
      return;
    }

    if (config.token_expires_at && new Date(config.token_expires_at) <= new Date(Date.now() + 5 * 60000)) {
        console.log('[Info] Access token is expired or about to expire. Refreshing before campaign execution...');
        await refreshZaloToken();
        config = await getZaloConfig();
    }

    const campaignType = campaign.type;
    let targets = []; // Array of { customer, product_name, refill_date, product_id, milestone_prefix }

    if (campaignType === 'PRODUCT_REFILL') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setHours(23, 59, 59, 999);

      const milestones = campaign.milestones || [];
      for (const milestone of milestones) {
        if (!milestone.product_id) continue;
        
        let conditions = [];

        // 1. Nhắc đúng ngày
        if (milestone.remind_on_exact_date !== false) {
           conditions.push({ expected_refill_date: { $gte: todayStart, $lte: todayEnd } });
        }

        // 2. Nhắc trước X ngày
        const remindBefore = milestone.remind_before_days !== undefined ? milestone.remind_before_days : 3;
        if (remindBefore > 0) {
           const futureStart = new Date(todayStart);
           futureStart.setDate(futureStart.getDate() + remindBefore);
           const futureEnd = new Date(futureStart);
           futureEnd.setHours(23, 59, 59, 999);
           conditions.push({ expected_refill_date: { $gte: futureStart, $lte: futureEnd } });
        }

        if (conditions.length === 0) continue;

        let orderQuery = { 
          product_id: milestone.product_id,
          $or: conditions
        };

        const orders = await Order.find(orderQuery).populate('customer_id');
        console.log(`Found ${orders.length} refilling orders for product ${milestone.product_id}.`);

        for (const order of orders) {
          const cust = order.customer_id;
          if (cust && cust.status !== 'inactive' && cust.zns_enabled !== false) {
             let remindType = 'EXACT';
             if (order.expected_refill_date > todayEnd) {
                remindType = 'BEFORE';
             }

             targets.push({
               customer: cust,
               product_name: order.product_name,
               refill_date: order.expected_refill_date,
               product_id: order.product_id,
               remind_type: remindType,
               milestone_prefix: `REFILL_${order.product_id}_${remindType}`,
               milestone_match: milestone
             });
          }
        }
      }
    } else {
      // 2. Other Campaigns (ENCOURAGE_PURCHASE, LIFECYCLE, PROMOTION)
      let customerQuery = { status: { $ne: 'inactive' }, zns_enabled: { $ne: false } };

      if (campaignType === 'ENCOURAGE_PURCHASE') {
        customerQuery.customer_type = 'LEAD';
      } else if (campaignType === 'LIFECYCLE') {
        customerQuery.$or = [
          { baby_dob: { $exists: true, $ne: null } },
          { edd: { $exists: true, $ne: null } }
        ];
      }

      // --- GLOBAL PRODUCT FILTER ---
      if (campaign.product_id) {
        const orders = await Order.find({ product_id: campaign.product_id }).select('customer_id');
        const customerIds = [...new Set(orders.map(o => o.customer_id.toString()))];
        if (customerIds.length === 0) {
          console.log(`[Skip] No customers have purchased product ${campaign.product_id} for campaign [${campaign.name}]`);
          return;
        }

        if (customerQuery._id) {
          const existingIds = customerQuery._id.$in || [];
          const intersected = existingIds.filter(id => customerIds.includes(id.toString()));
          if (intersected.length === 0) return;
          customerQuery._id = { $in: intersected };
        } else {
          customerQuery._id = { $in: customerIds };
        }
        console.log(`[Filter] Globally filtered by product_id: ${campaign.product_id}`);
      }

      // --- EXCLUSION FILTER (Loại trừ tệp Refill) ---
      if (campaign.exclude_refill_today) {
        const today = new Date();
        today.setHours(0,0,0,0);
        const endOfToday = new Date(today);
        endOfToday.setHours(23, 59, 59, 999);
        
        // Loại trừ những người có order refill hôm nay
        const refillingOrders = await Order.find({
            expected_refill_date: { $gte: today, $lte: endOfToday }
        }).select('customer_id');
        const refillingCustomerIds = [...new Set(refillingOrders.map(o => o.customer_id.toString()))];

        if (refillingCustomerIds.length > 0) {
            if (!customerQuery._id) customerQuery._id = {};
            if (customerQuery._id.$in) {
               customerQuery._id.$in = customerQuery._id.$in.filter(id => !refillingCustomerIds.includes(id.toString()));
            } else {
               customerQuery._id.$nin = refillingCustomerIds;
            }
            console.log(`[Filter] Excluded ${refillingCustomerIds.length} customers with refill due today.`);
        }
      }

      const customers = await Customer.find(customerQuery);
      console.log(`Found ${customers.length} target customers for this campaign.`);

      for (const cust of customers) {
         targets.push({
             customer: cust,
             product_name: cust.last_purchased_product || 'sản phẩm',
             refill_date: cust.next_refill_date,
             product_id: campaign.product_id || null,
             milestone_prefix: ''
         });
      }
    }

    // Campaign milestones
    const milestones = campaign.milestones || [];

    for (const target of targets) {
      const { customer, product_name, refill_date, product_id, milestone_prefix, milestone_match } = target;
      const formattedPhone = formatPhoneNumber(customer.phone);
      if (!formattedPhone) continue;

      let finalTemplateId = campaign.zns_template_id;
      let milestoneKey = milestone_prefix;

      let dynamicDataObj = {};
      if (campaign.dynamic_data) {
        // Safe conversion of Mongoose Map to plain object
        if (campaign.dynamic_data instanceof Map) {
          dynamicDataObj = Object.fromEntries(campaign.dynamic_data);
        } else if (typeof campaign.dynamic_data.toJSON === 'function') {
          dynamicDataObj = campaign.dynamic_data.toJSON();
        } else {
          dynamicDataObj = { ...campaign.dynamic_data };
        }
      }

      // Lifecycle logic matching
      if (campaignType === 'LIFECYCLE') {
        let stage = '';
        let currentAgeDay = null;
        let currentAgeWeek = null;
        let currentAgeMonth = null;

        if (customer.baby_dob) {
          stage = 'BABY';
          currentAgeDay = getBabyAgeInDays(customer.baby_dob);
          currentAgeWeek = getBabyAgeInWeeks(customer.baby_dob);
          currentAgeMonth = getBabyAgeInMonths(customer.baby_dob);
        } else if (customer.edd) {
          stage = 'PREGNANCY';
          currentAgeDay = getPregnancyDay(customer.edd);
          currentAgeWeek = getPregnancyWeek(customer.edd);
          currentAgeMonth = getPregnancyMonth(customer.edd);
        }

        if (currentAgeDay === null && currentAgeWeek === null && currentAgeMonth === null) continue;

        // Find matching milestone in campaign config
        const milestone = milestones.find(m => {
          if (m.stage !== stage) return false;
          if (m.time_unit === 'DAY' && m.time_value === currentAgeDay) return true;
          if (m.time_unit === 'WEEK' && m.time_value === currentAgeWeek) return true;
          if (m.time_unit === 'MONTH' && m.time_value === currentAgeMonth) return true;
          return false;
        });

        if (!milestone) continue; // No milestone script for this exact age

        // Override finalTemplateId if milestone has one configured
        if (milestone.zns_template_id) {
          finalTemplateId = milestone.zns_template_id;
        }
        
        milestoneKey = `${milestone.stage}_${milestone.time_unit}_${milestone.time_value}`;

        // Merge milestone dynamic data into template payload
        if (milestone.dynamic_data) {
          let mData = {};
          if (milestone.dynamic_data instanceof Map) {
            mData = Object.fromEntries(milestone.dynamic_data);
          } else if (typeof milestone.dynamic_data.toJSON === 'function') {
            mData = milestone.dynamic_data.toJSON();
          } else {
            mData = { ...milestone.dynamic_data };
          }
          dynamicDataObj = { ...dynamicDataObj, ...mData };
        }
      } else if (campaignType === 'PRODUCT_REFILL' && milestone_match) {
        const milestone = milestone_match;
        if (milestone.zns_template_id) {
          finalTemplateId = milestone.zns_template_id;
        }
        if (milestone.dynamic_data) {
          let mData = {};
          if (milestone.dynamic_data instanceof Map) {
            mData = Object.fromEntries(milestone.dynamic_data);
          } else if (typeof milestone.dynamic_data.toJSON === 'function') {
            mData = milestone.dynamic_data.toJSON();
          } else {
            mData = { ...milestone.dynamic_data };
          }
          dynamicDataObj = { ...dynamicDataObj, ...mData };
        }
      }

      // Anti-Spam Check
      let existingLog;
      if (campaignType === 'LIFECYCLE') {
        existingLog = await ZnsLog.findOne({
          campaign_id: campaign._id,
          phoneSent: formattedPhone,
          status: 'success',
          milestone_key: milestoneKey
        });
      } else if (campaignType === 'PRODUCT_REFILL') {
        // --- KIỂM TRA ĐƠN HÀNG MỚI HƠN ---
        // Tránh tình trạng: Mua ngày 1/1 (hết hạn 31/1), mua tiếp 15/1 (hết hạn 14/2). Đến 31/1 không được nhắn vì đã mua hôm 15/1.
        if (product_id && refill_date) {
           const newerOrder = await Order.findOne({
             customer_id: customer._id,
             product_id: product_id,
             expected_refill_date: { $gt: refill_date }
           });
           
           if (newerOrder) {
             console.log(`[Skip] Bỏ qua gửi ZNS cho ${formattedPhone} vì khách đã mua lại sản phẩm này gần đây. Sẽ nhắc vào ${newerOrder.expected_refill_date}`);
             continue; // Bỏ qua lần lặp này
           }
        }

        // Chỉ block nếu đúng loại sản phẩm này đã được gửi nhắc nhở gần đây
        const spamThreshold = new Date();
        spamThreshold.setDate(spamThreshold.getDate() - 15);
        existingLog = await ZnsLog.findOne({
          campaign_id: campaign._id,
          phoneSent: formattedPhone,
          status: 'success',
          sentAt: { $gte: spamThreshold },
          milestone_key: milestoneKey
        });
      } else {
        const spamThreshold = new Date();
        spamThreshold.setDate(spamThreshold.getDate() - 15);
        existingLog = await ZnsLog.findOne({
          campaign_id: campaign._id,
          phoneSent: formattedPhone,
          status: 'success',
          sentAt: { $gte: spamThreshold }
        });
      }

      if (existingLog) {
        console.log(`[Skip] Already sent Campaign [${campaign.name}]${milestoneKey ? ` (Milestone: ${milestoneKey})` : ''} to ${formattedPhone}.`);
        continue;
      }

      // Prepare dynamic template data
      const templateData = {};

      // 1. System level variables (always provided if matched)
      templateData['customer_name'] = customer.name || 'Quý khách';
      templateData['phone'] = formattedPhone;
      templateData['product_name'] = product_name;
      if (refill_date) {
        templateData['refill_date'] = new Date(refill_date).toLocaleDateString('vi-VN');
      }

      // 2. Override with custom campaign variables (from the UI) and Lifecycle milestones
      for (const [key, value] of Object.entries(dynamicDataObj)) {
        const cleanKey = key.trim().replace(/^[<]+|[>]+$/g, '').trim();
        templateData[cleanKey] = value;
      }

      // 3. Prevent Zalo validation error for missing variables
      if (!templateData.expire) {
        templateData.expire = '31/12/2099';
      }

      // Prepare ZNS payload
      const payload = {
        phone: formattedPhone,
        template_id: finalTemplateId,
        template_data: templateData
      };

      try {
        const response = await axios.post('https://business.openapi.zalo.me/message/template', payload, {
          headers: {
            'access_token': config.access_token,
            'Content-Type': 'application/json'
          }
        });

        const result = response.data;

        if (result.error === 0) {
          // Log success
          await ZnsLog.create({
            customerId: customer._id,
            phoneSent: formattedPhone,
            status: 'success',
            znsTemplateId: finalTemplateId,
            zaloMessageId: result.data?.message_id,
            campaign_id: campaign._id,
            campaign_type: campaignType,
            milestone_key: milestoneKey,
            trigger_type: 'CRON_AUTO'
          });
          console.log(`[Success] ZNS sent to ${formattedPhone}`);
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        console.error(`[Error] Failed ZNS to ${formattedPhone}:`, errorMsg);
        
        if (errorMsg.includes('Access token invalid') || errorMsg.includes('token') || errorMsg.includes('Invalid Access Token')) {
            console.log('[Info] Attempting to refresh token dynamically...');
            await refreshZaloToken();
            config = await getZaloConfig();
            // Lần gửi sau trong vòng lặp sẽ dùng config.access_token mới
        }

        // Log failure
        await ZnsLog.create({
          customerId: customer._id,
          phoneSent: formattedPhone,
          status: 'failed',
          znsTemplateId: finalTemplateId,
          errorMessage: errorMsg,
          campaign_id: campaign._id,
          campaign_type: campaignType,
          milestone_key: milestoneKey,
          trigger_type: 'CRON_AUTO'
        });
      }
    }
  } catch (error) {
    console.error(`Error executing campaign [${campaign.name}]:`, error);
  }
};

// 3. Execute a Single Sub-Event of a Master Campaign
export const executeMasterSubEvent = async (campaign, subEvent, subEventIndex) => {
  console.log(`\n>>> Executing Master Sub-Event [${subEvent.name}] (Index: ${subEventIndex}) of Campaign [${campaign.name}]`);
  try {
    let config = await getZaloConfig();
    if (!config.access_token) {
      console.error('Access token is missing. Please refresh token first.');
      return;
    }

    if (config.token_expires_at && new Date(config.token_expires_at) <= new Date(Date.now() + 5 * 60000)) {
      console.log('[Info] Access token is expired or about to expire. Refreshing...');
      await refreshZaloToken();
      config = await getZaloConfig();
    }

    // --- Build customer query based on audience_condition ---
    const condition = subEvent.audience_condition || { type: 'ALL' };
    const conditionType = condition.type || 'ALL';
    let customerQuery = { status: { $ne: 'inactive' }, zns_enabled: { $ne: false } };

    console.log(`[Master] Audience condition type: ${conditionType}`);

    switch (conditionType) {
      case 'ALL':
        // No extra filter
        break;

      case 'NOT_PURCHASED_SINCE_EVENT': {
        // Find the reference event's execute_time
        const refIndex = condition.since_event_index !== undefined ? condition.since_event_index : (subEventIndex - 1);
        const subEvents = campaign.sub_events || [];
        if (refIndex >= 0 && refIndex < subEvents.length) {
          const refTime = new Date(subEvents[refIndex].execute_time);
          // Find customers who HAVE orders after the reference event time
          const ordersAfter = await Order.find({
            purchase_date: { $gte: refTime }
          }).select('customer_id');
          const purchasedIds = [...new Set(ordersAfter.map(o => o.customer_id.toString()))];
          if (purchasedIds.length > 0) {
            customerQuery._id = { $nin: purchasedIds };
            console.log(`[Master] Excluding ${purchasedIds.length} customers who purchased since event ${refIndex}`);
          }
        }
        break;
      }

      case 'BABY_AGE_RANGE': {
        const minMonths = condition.baby_age_min || 0;
        const maxMonths = condition.baby_age_max || 999;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // baby_dob range: baby born between (today - maxMonths*30 days) and (today - minMonths*30 days)
        const dobMax = new Date(today);
        dobMax.setDate(dobMax.getDate() - (minMonths * 30));
        const dobMin = new Date(today);
        dobMin.setDate(dobMin.getDate() - (maxMonths * 30));
        customerQuery.baby_dob = { $gte: dobMin, $lte: dobMax };
        console.log(`[Master] Filtering babies aged ${minMonths}-${maxMonths} months`);
        break;
      }

      case 'NO_ORDER_THIS_MONTH': {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const ordersThisMonth = await Order.find({
          purchase_date: { $gte: monthStart }
        }).select('customer_id');
        const orderedIds = [...new Set(ordersThisMonth.map(o => o.customer_id.toString()))];
        if (orderedIds.length > 0) {
          customerQuery._id = { $nin: orderedIds };
          console.log(`[Master] Excluding ${orderedIds.length} customers with orders this month`);
        }
        break;
      }
    }

    const customers = await Customer.find(customerQuery);
    console.log(`[Master] Found ${customers.length} target customers for sub-event [${subEvent.name}]`);

    if (customers.length === 0) return;

    const milestoneKey = `MASTER_SUB_${subEventIndex}`;
    const templateId = subEvent.zns_template_id;

    // Parse dynamic_data
    let dynamicDataObj = {};
    if (subEvent.dynamic_data) {
      if (subEvent.dynamic_data instanceof Map) {
        dynamicDataObj = Object.fromEntries(subEvent.dynamic_data);
      } else if (typeof subEvent.dynamic_data.toJSON === 'function') {
        dynamicDataObj = subEvent.dynamic_data.toJSON();
      } else {
        dynamicDataObj = { ...subEvent.dynamic_data };
      }
    }

    for (const customer of customers) {
      const formattedPhone = formatPhoneNumber(customer.phone);
      if (!formattedPhone) continue;

      // Anti-Spam Check
      const existingLog = await ZnsLog.findOne({
        campaign_id: campaign._id,
        phoneSent: formattedPhone,
        status: 'success',
        milestone_key: milestoneKey
      });

      if (existingLog) {
        console.log(`[Skip] Already sent sub-event [${subEvent.name}] to ${formattedPhone}`);
        continue;
      }

      // Prepare template data
      const templateData = {};
      templateData['customer_name'] = customer.name || 'Quý khách';
      templateData['phone'] = formattedPhone;

      // Override with custom dynamic data
      for (const [key, value] of Object.entries(dynamicDataObj)) {
        const cleanKey = key.trim().replace(/^[<]+|[>]+$/g, '').trim();
        templateData[cleanKey] = value;
      }

      if (!templateData.expire) {
        templateData.expire = '31/12/2099';
      }

      const payload = {
        phone: formattedPhone,
        template_id: templateId,
        template_data: templateData
      };

      try {
        const response = await axios.post('https://business.openapi.zalo.me/message/template', payload, {
          headers: {
            'access_token': config.access_token,
            'Content-Type': 'application/json'
          }
        });

        const result = response.data;

        if (result.error === 0) {
          await ZnsLog.create({
            customerId: customer._id,
            phoneSent: formattedPhone,
            status: 'success',
            znsTemplateId: templateId,
            zaloMessageId: result.data?.message_id,
            campaign_id: campaign._id,
            campaign_type: 'MASTER_CAMPAIGN',
            milestone_key: milestoneKey,
            trigger_type: 'CRON_AUTO'
          });
          console.log(`[Success] ZNS sent to ${formattedPhone} for sub-event [${subEvent.name}]`);
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        console.error(`[Error] Failed ZNS to ${formattedPhone}:`, errorMsg);

        if (errorMsg.includes('Access token invalid') || errorMsg.includes('token') || errorMsg.includes('Invalid Access Token')) {
          console.log('[Info] Attempting to refresh token dynamically...');
          await refreshZaloToken();
          config = await getZaloConfig();
        }

        await ZnsLog.create({
          customerId: customer._id,
          phoneSent: formattedPhone,
          status: 'failed',
          znsTemplateId: templateId,
          errorMessage: errorMsg,
          campaign_id: campaign._id,
          campaign_type: 'MASTER_CAMPAIGN',
          milestone_key: milestoneKey,
          trigger_type: 'CRON_AUTO'
        });
      }
    }

    console.log(`<<< Finished Master Sub-Event [${subEvent.name}]`);
  } catch (error) {
    console.error(`Error executing master sub-event [${subEvent.name}]:`, error);
  }
};

// --- MULTI-CRON JOB MANAGEMENT ---
export const activeCronJobs = new Map();

export const removeCampaignCronJob = (campaignId) => {
  const idStr = campaignId.toString();
  // Remove regular cron job
  const job = activeCronJobs.get(idStr);
  if (job) {
    if (typeof job.stop === 'function') job.stop();
    else if (typeof job === 'number' || typeof job === 'object') clearTimeout(job);
    activeCronJobs.delete(idStr);
    console.log(`[Cron] Removed job for campaign ID ${idStr}`);
  }
  // Remove all sub-event timers
  for (const [key, timer] of activeCronJobs.entries()) {
    if (key.startsWith(`${idStr}_sub_`)) {
      clearTimeout(timer);
      activeCronJobs.delete(key);
      console.log(`[Cron] Removed sub-event timer: ${key}`);
    }
  }
};

export const updateCampaignCronJob = (campaign) => {
  const idStr = campaign._id.toString();
  removeCampaignCronJob(idStr);

  if (campaign.status !== 'active') return;

  // --- MASTER_CAMPAIGN: Schedule each sub-event with setTimeout ---
  if (campaign.type === 'MASTER_CAMPAIGN') {
    const subEvents = campaign.sub_events || [];
    const now = new Date();
    let scheduledCount = 0;

    for (let i = 0; i < subEvents.length; i++) {
      const sub = subEvents[i];
      const execTime = new Date(sub.execute_time);
      const delay = execTime.getTime() - now.getTime();

      if (delay > 0) {
        const timer = setTimeout(async () => {
          try {
            const freshCampaign = await Campaign.findById(idStr);
            if (freshCampaign && freshCampaign.status === 'active') {
              await executeMasterSubEvent(freshCampaign, freshCampaign.sub_events[i], i);
            }
          } catch (err) {
            console.error(`[Cron] Error executing master sub-event ${i}:`, err);
          } finally {
            activeCronJobs.delete(`${idStr}_sub_${i}`);
          }
        }, delay);

        activeCronJobs.set(`${idStr}_sub_${i}`, timer);
        scheduledCount++;
        console.log(`[Cron] Scheduled sub-event [${sub.name}] at ${execTime.toLocaleString('vi-VN')} (in ${Math.round(delay / 60000)} minutes)`);
      } else {
        console.log(`[Cron] Sub-event [${sub.name}] is in the past (${execTime.toLocaleString('vi-VN')}), skipping.`);
      }
    }

    if (scheduledCount > 0) {
      console.log(`[Cron] Master Campaign [${campaign.name}]: ${scheduledCount}/${subEvents.length} sub-events scheduled.`);
    }
    return;
  }
  
  // --- Regular campaigns: use recurring cron ---
  if (!campaign.is_auto_run) return;

  // Default to 09:00 AM if no schedule is provided but it's set to auto-run
  const scheduleTime = campaign.recurring_schedule || '0 9 * * *';

  const job = cron.schedule(scheduleTime, async () => {
    // Re-fetch to ensure it's still active and within time constraints
    const dbCamp = await Campaign.findById(idStr);
    if (!dbCamp || dbCamp.status !== 'active' || !dbCamp.is_auto_run) {
      removeCampaignCronJob(idStr);
      return;
    }
    
    const now = new Date();
    if (dbCamp.start_time && new Date(dbCamp.start_time) > now) return;
    if (dbCamp.end_time && new Date(dbCamp.end_time) < now) {
      // If expired, we can optionally stop it
      removeCampaignCronJob(idStr);
      return;
    }

    await executeCampaign(dbCamp);
  });
  
  activeCronJobs.set(idStr, job);
  console.log(`[Cron] Scheduled job for campaign [${campaign.name}] at ${scheduleTime}`);
};

export const initCampaignCronJobs = async () => {
  try {
    // Initialize recurring campaigns
    const recurringCampaigns = await Campaign.find({ status: 'active', is_auto_run: true, type: { $ne: 'MASTER_CAMPAIGN' } });
    recurringCampaigns.forEach(updateCampaignCronJob);

    // Initialize Master Campaigns (schedule sub-events)
    const masterCampaigns = await Campaign.find({ status: 'active', type: 'MASTER_CAMPAIGN' });
    masterCampaigns.forEach(updateCampaignCronJob);

    console.log(`[Cron] Initialized ${activeCronJobs.size} dynamic campaign jobs (including ${masterCampaigns.length} master campaigns).`);
  } catch (error) {
    console.error('Error initializing campaign cron jobs:', error);
  }
};

// 4. Schedule the Jobs (System Level)
export const scheduleZaloZNS = () => {
  // Job 1: Refresh Token every day at 08:30 AM
  cron.schedule('30 8 * * *', refreshZaloToken);

  // Job 2: Initialize all dynamic campaign jobs
  initCampaignCronJobs();

  console.log('Zalo ZNS Cron Jobs Scheduled: Token Refresh at 08:30 AM, and Dynamic Campaign Jobs.');
};

