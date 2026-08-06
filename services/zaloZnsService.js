import cron from 'node-cron';
import axios from 'axios';
import Customer from '../models/Customer.js';
import Campaign from '../models/Campaign.js';
import ZaloOAConfig from '../models/ZaloOAConfig.js';
import ZaloZNS from '../models/ZaloZNS.js'; // Old config with milestones
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
    const config = await getZaloConfig();
    if (!config.access_token) {
      console.error('Access token is missing. Please refresh token first.');
      return;
    }

    // Determine target customers based on target_condition
    let customerQuery = { status: { $ne: 'inactive' }, zns_enabled: { $ne: false } };

    const conditionType = campaign.target_condition?.type;
    const campaignType = campaign.type;

    if (campaignType === 'ENCOURAGE_PURCHASE') {
      // Khích lệ mua hàng: Chỉ gửi cho LEAD (chưa có đơn hàng)
      customerQuery.customer_type = 'LEAD';
    }
    else if (conditionType === 'refill_date' || campaignType === 'PRODUCT_REFILL') {
      // 1. Refill campaign: Only send to BUYERs whose next_refill_date is today or earlier
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      // Bỏ qua check customer_type = BUYER vì có next_refill_date là chắc chắn đã mua hàng
      customerQuery.next_refill_date = { $lte: today, $ne: null };
    }
    else if (conditionType === 'all' || campaignType === 'PROMOTION') {
      // 2. Send All: Sends to both LEAD and BUYER
    }
    else if (conditionType === 'LIFECYCLE') {
      // 3. Lifecycle (Vòng đời): Send to LEADs (and optionally BUYERs) with baby_dob or edd
      customerQuery.$or = [
        { baby_dob: { $exists: true, $ne: null } },
        { edd: { $exists: true, $ne: null } }
      ];
    }

    // --- GLOBAL PRODUCT FILTER ---
    // Nếu chiến dịch có gắn sản phẩm cụ thể → chỉ gửi cho khách đã mua SP đó
    if (campaign.product_id) {
      const orders = await Order.find({ product_id: campaign.product_id }).select('customer_id');
      const customerIds = [...new Set(orders.map(o => o.customer_id.toString()))];

      if (customerIds.length === 0) {
        console.log(`[Skip] No customers have purchased product ${campaign.product_id} for campaign [${campaign.name}]`);
        return;
      }

      // Merge with existing _id query if present
      if (customerQuery._id) {
        const existingIds = customerQuery._id.$in || [];
        const intersected = existingIds.filter(id => customerIds.includes(id.toString()));
        if (intersected.length === 0) {
          console.log(`[Skip] No intersecting customers for campaign [${campaign.name}]`);
          return;
        }
        customerQuery._id = { $in: intersected };
      } else {
        customerQuery._id = { $in: customerIds };
      }

      console.log(`[Filter] Globally filtered by product_id: ${campaign.product_id} → ${customerIds.length} potential customers`);
    }

    // --- EXCLUSION FILTER (Loại trừ tệp Refill) ---
    if (campaign.exclude_refill_today) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (!customerQuery.$and) customerQuery.$and = [];
      customerQuery.$and.push({
        $or: [
          { next_refill_date: { $gt: today } },
          { next_refill_date: null },
          { next_refill_date: { $exists: false } }
        ]
      });
      console.log(`[Filter] Excluded customers with refill due today.`);
    }

    console.log(`[Debug] customerQuery:`, JSON.stringify(customerQuery, null, 2));
    const customers = await Customer.find(customerQuery);
    console.log(`Found ${customers.length} target customers for this campaign.`);

    // If lifecycle, fetch the old ZaloZNS milestones to get the content
    let legacyMilestones = [];
    if (conditionType === 'LIFECYCLE') {
      const oldConfig = await ZaloZNS.findOne();
      if (oldConfig) legacyMilestones = oldConfig.scriptMilestones || [];
    }

    for (const customer of customers) {
      const formattedPhone = formatPhoneNumber(customer.phone);
      if (!formattedPhone) continue;

      let finalTemplateId = campaign.zns_template_id;

      let dynamicDataObj = {};
      if (campaign.dynamic_data) {
        // Safe conversion of Mongoose Map to plain object
        dynamicDataObj = typeof campaign.dynamic_data.toJSON === 'function' 
          ? campaign.dynamic_data.toJSON() 
          : { ...campaign.dynamic_data };
      }
      console.log(`[Debug] dynamicDataObj for campaign ${campaign.name}:`, JSON.stringify(dynamicDataObj));

      // Lifecycle logic matching
      if (conditionType === 'LIFECYCLE') {
        let stage = '';
        let currentWeek = null;

        if (customer.baby_dob) {
          stage = 'BABY';
          currentWeek = getBabyAgeInWeeks(customer.baby_dob);
        } else if (customer.edd) {
          stage = 'PREGNANCY';
          currentWeek = getPregnancyWeek(customer.edd);
        }

        if (currentWeek === null) continue;

        const milestone = legacyMilestones.find(
          m => m.stage === stage && m.weekAge === currentWeek
        );
        if (!milestone) continue; // No milestone script for this week

        // Override template data with milestone data
        dynamicDataObj.stage_greetings = milestone.stage_greetings;
        dynamicDataObj.care_content = milestone.care_content;
        dynamicDataObj.recommended_items = milestone.recommended_items;
      }

      // Anti-Spam Check: Check if this exact campaign has been sent to this customer successfully within the last 15 days
      const spamThreshold = new Date();
      spamThreshold.setDate(spamThreshold.getDate() - 15); // Adjust threshold as needed

      const existingLog = await ZnsLog.findOne({
        campaign_id: campaign._id,
        phoneSent: formattedPhone,
        status: 'success',
        sentAt: { $gte: spamThreshold }
      });

      if (existingLog) {
        console.log(`[Skip] Already sent Campaign [${campaign.name}] to ${formattedPhone} recently.`);
        continue;
      }

      // Prepare dynamic template data
      const templateData = {};

      // 1. System level variables (always provided if matched)
      templateData['customer_name'] = customer.name || 'Quý khách';
      templateData['phone'] = formattedPhone;
      templateData['product_name'] = customer.last_purchased_product || 'sản phẩm';
      if (customer.next_refill_date) {
        templateData['refill_date'] = new Date(customer.next_refill_date).toLocaleDateString('vi-VN');
      }

      // 2. Override with custom campaign variables (from the UI) and Lifecycle milestones
      for (const [key, value] of Object.entries(dynamicDataObj)) {
        // Gọt bỏ dấu ngoặc nhọn < > nếu có (VD: <voucher_code> -> voucher_code)
        const cleanKey = key.replace(/^[<]+|[>]+$/g, '');
        templateData[cleanKey] = value;
      }

      // 3. Prevent Zalo validation error for missing variables (e.g. 'expire') 
      // by injecting dummy values if not provided by the UI.
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
            znsTemplateId: campaign.zns_template_id,
            zaloMessageId: result.data?.message_id,
            campaign_id: campaign._id,
            trigger_type: 'CRON_AUTO'
          });
          console.log(`[Success] ZNS sent to ${formattedPhone}`);
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error(`[Error] Failed ZNS to ${formattedPhone}:`, error.response?.data?.message || error.message);
        // Log failure
        await ZnsLog.create({
          customerId: customer._id,
          phoneSent: formattedPhone,
          status: 'failed',
          znsTemplateId: campaign.zns_template_id,
          errorMessage: error.response?.data?.message || error.message,
          campaign_id: campaign._id,
          trigger_type: 'CRON_AUTO'
        });
      }
    }
  } catch (error) {
    console.error(`Error executing campaign [${campaign.name}]:`, error);
  }
};

// 3. Main Dispatcher Function
export const runCampaignDispatcher = async () => {
  console.log('--- Running Zalo ZNS Campaign Dispatcher ---');
  try {
    const now = new Date();

    // Find auto-run campaigns that are active.
    // If they have a start_time, it must be <= now.
    // If they have an end_time, it must be >= now.
    const activeCampaigns = await Campaign.find({
      status: 'active',
      is_auto_run: true,
      $or: [
        { start_time: { $exists: false } },
        { start_time: null },
        { start_time: { $lte: now } }
      ],
      $and: [
        {
          $or: [
            { end_time: { $exists: false } },
            { end_time: null },
            { end_time: { $gte: now } }
          ]
        }
      ]
    });

    console.log(`Found ${activeCampaigns.length} active auto-run campaigns.`);

    for (const campaign of activeCampaigns) {
      await executeCampaign(campaign);
    }

  } catch (error) {
    console.error('Error in Campaign Dispatcher:', error);
  }
};

// 4. Schedule the Jobs
export const scheduleZaloZNS = () => {
  // Job 1: Refresh Token every day at 08:30 AM
  cron.schedule('30 8 * * *', refreshZaloToken);

  // Job 2: Campaign Dispatcher every day at 09:00 AM
  // We keep it at 9:00 AM as requested by the UI (so it sends batch messages in the morning).
  cron.schedule('0 9 * * *', runCampaignDispatcher);

  console.log('Zalo ZNS Cron Jobs Scheduled: Token Refresh at 08:30 AM, Dispatcher at 09:00 AM');
};
