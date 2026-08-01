import cron from 'node-cron';
import axios from 'axios';
import Customer from '../models/Customer.js';
import ZaloZNS from '../models/ZaloZNS.js';
import ZnsLog from '../models/ZnsLog.js';

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

export const scheduleZaloZNS = () => {
  // 1. ZNS Message Cron Job (Runs every day at 9:00 AM)
  cron.schedule('0 9 * * *', async () => {
    console.log('--- Starting Zalo ZNS Daily Cron Job ---');
    try {
      const zaloConfig = await ZaloZNS.findOne();
      if (!zaloConfig || !zaloConfig.accessToken) {
        console.error('ZaloZNS config or Access Token missing in DB');
        return;
      }

      const customers = await Customer.find({
        status: 'active',
        phone: { $exists: true, $ne: null },
        $or: [
          { baby_dob: { $exists: true, $ne: null } },
          { edd: { $exists: true, $ne: null } }
        ]
      });

      for (const customer of customers) {
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

        const formattedPhone = formatPhoneNumber(customer.phone);
        if (!formattedPhone) continue;

        // Find Milestone content
        const milestone = zaloConfig.scriptMilestones.find(
          m => m.stage === stage && m.weekAge === currentWeek
        );

        if (!milestone) continue;

        // Lọc log theo Mẹ, Giai đoạn, và Tuần
        const logFilter = {
          customerId: customer._id,
          stage: stage,
          weekAge: currentWeek
        };

        const existingLog = await ZnsLog.findOne(logFilter);

        // Nếu đã từng gửi thành công thì bỏ qua
        if (existingLog && existingLog.status === 'success') {
          console.log(`ZNS already sent to ${formattedPhone} for ${stage} week ${currentWeek}`);
          continue;
        }

        // Send ZNS
        try {
          const payload = {
            phone: formattedPhone,
            template_id: zaloConfig.znsTemplateId,
            template_data: {
              customer_name: customer.name || 'Mẹ',
              stage_greetings: milestone.stage_greetings,
              care_content: milestone.care_content,
              recommended_items: milestone.recommended_items
            }
          };

          const response = await axios.post('https://business.openapi.zalo.me/message/template', payload, {
            headers: {
              'access_token': zaloConfig.accessToken,
              'Content-Type': 'application/json'
            }
          });

          const result = response.data;

          if (result.error === 0) {
            // Upsert Log: Cập nhật thành công
            await ZnsLog.findOneAndUpdate(
              logFilter,
              {
                phoneSent: formattedPhone,
                znsTemplateId: zaloConfig.znsTemplateId,
                status: 'success',
                zaloMessageId: result.data?.message_id,
                errorMessage: null
              },
              { upsert: true, returnDocument: 'after' }
            );
            console.log(`[Success] ZNS sent to ${formattedPhone}`);
          } else {
            throw new Error(`Zalo API Error: ${result.message}`);
          }
        } catch (error) {
          console.error(`[Error] Failed ZNS to ${formattedPhone}:`, error.response?.data || error.message);
          // Upsert Log: Cập nhật thất bại (Ghi đè dòng log cũ nếu đã từng thất bại)
          await ZnsLog.findOneAndUpdate(
            logFilter,
            {
              phoneSent: formattedPhone,
              znsTemplateId: zaloConfig.znsTemplateId,
              status: 'failed',
              errorMessage: error.response?.data?.message || error.message
            },
            { upsert: true, returnDocument: 'after' }
          );
        }
      }
      console.log('--- Finished Zalo ZNS Daily Cron Job ---');
    } catch (error) {
      console.error('Error in ZNS Cron Job:', error);
    }
  });

  // 2. Refresh Token Cron Job (Runs every day at 8:30 AM to ensure valid token before sending)
  cron.schedule('30 8 * * *', async () => {
    console.log('--- Starting Zalo Access Token Refresh Job ---');
    try {
      const zaloConfig = await ZaloZNS.findOne();
      if (!zaloConfig || !zaloConfig.refreshToken || !zaloConfig.appId || !zaloConfig.secretKey) {
        console.error('Missing Zalo credentials to refresh token');
        return;
      }

      const response = await axios.post('https://oauth.zaloapp.com/v4/oa/access_token', null, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'secret_key': zaloConfig.secretKey
        },
        params: {
          refresh_token: zaloConfig.refreshToken,
          app_id: zaloConfig.appId,
          grant_type: 'refresh_token'
        }
      });

      const data = response.data;
      if (data.access_token && data.refresh_token) {
        zaloConfig.accessToken = data.access_token;
        zaloConfig.refreshToken = data.refresh_token;
        await zaloConfig.save();
        console.log('[Success] Zalo Access Token Refreshed');
      } else {
        console.error('[Error] Zalo Refresh Failed:', data);
      }
    } catch (error) {
      console.error('[Error] Zalo Refresh Job Exception:', error.response?.data || error.message);
    }
  });
};
