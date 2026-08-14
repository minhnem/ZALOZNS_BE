import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'SYNC'],
    required: true
  },
  entity_type: {
    type: String,
    required: true
  },
  entity_id: {
    type: String
  },
  details: {
    type: String,
    default: ''
  },
  changes: {
    type: mongoose.Schema.Types.Mixed // Có thể lưu object JSON chứa oldData, newData
  }
}, { timestamps: true });

// Indexing for faster queries (by user, by action, by entity)
activityLogSchema.index({ user_id: 1, createdAt: -1 });
activityLogSchema.index({ entity_type: 1, entity_id: 1 });

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
