import mongoose from 'mongoose';

const zaloZNSSchema = new mongoose.Schema({
  oaId: { type: String, required: true, unique: true },
  oaName: { type: String, required: true },
  appId: { type: String }, 
  secretKey: { type: String }, 
  accessToken: { type: String },
  refreshToken: { type: String },
  znsTemplateId: { type: String, required: true }, 

  scriptMilestones: [{
    stage: { type: String, enum: ['PREGNANCY', 'BABY'], required: true },
    weekAge: { type: Number, required: true },
    title: { type: String, required: true },
    stage_greetings: { type: String, required: true }, 
    care_content: { type: String, required: true },    
    recommended_items: { type: String, required: true } 
  }]
}, { timestamps: true });

export default mongoose.model('ZaloZNS', zaloZNSSchema);
