import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// SĐT an toàn dùng cho môi trường Dev (thay bằng SĐT của bạn nếu muốn)
const SAFE_PHONE = '84999999999';

async function cloneDatabase() {
  const prodUri = process.env.MONGODB_URI;
  if (!prodUri) {
    console.error('❌ Không tìm thấy MONGODB_URI trong file .env');
    process.exit(1);
  }

  // Tạo URI cho Dev Database bằng cách đổi tên database thành 'fb_ai_chatbot_dev'
  // Ví dụ: ...mongodb.net/fb_ai_chatbot?... -> ...mongodb.net/fb_ai_chatbot_dev?...
  const devUri = prodUri.replace(/\/fb_ai_chatbot(\?|$)/, '/fb_ai_chatbot_dev$1');

  console.log('🔄 Đang kết nối tới Database Production...');
  const prodConn = await mongoose.createConnection(prodUri).asPromise();
  console.log('✅ Đã kết nối Production DB:', prodConn.name);

  console.log('🔄 Đang kết nối tới Database Dev/Test...');
  const devConn = await mongoose.createConnection(devUri).asPromise();
  console.log('✅ Đã kết nối Dev DB:', devConn.name);

  const collections = await prodConn.db.listCollections().toArray();
  console.log(`\n📦 Tìm thấy ${collections.length} bảng dữ liệu (collections). Bắt đầu sao chép...\n`);

  for (const col of collections) {
    const colName = col.name;
    if (colName.startsWith('system.')) continue;

    console.log(`➡️ Đang sao chép collection: [${colName}]...`);
    const docs = await prodConn.db.collection(colName).find({}).toArray();

    if (docs.length > 0) {
      // Xoá collection cũ bên Dev DB nếu có để ghi đè bản mới
      await devConn.db.collection(colName).deleteMany({});
      // Chèn dữ liệu mới vào Dev DB
      await devConn.db.collection(colName).insertMany(docs);
      console.log(`   ✔️ Đã chép ${docs.length} documents sang dev.`);
    } else {
      console.log(`   ⚪ Collection [${colName}] rỗng, bỏ qua.`);
    }
  }

  // BƯỚC AN TOÀN: Làm sạch SĐT khách hàng trên Database Dev
  console.log('\n🔒 Đang làm sạch số điện thoại khách hàng trên Database Dev...');
  const customerCol = devConn.db.collection('customers');
  const updateResult = await customerCol.updateMany(
    {},
    { $set: { phone: SAFE_PHONE } }
  );
  console.log(`✅ Đã đổi số điện thoại của ${updateResult.modifiedCount} khách hàng thành: ${SAFE_PHONE}`);
  console.log('   (Tránh gửi nhầm tin Zalo ZNS tới khách hàng thật khi test trên dev)');

  await prodConn.close();
  await devConn.close();

  console.log('\n🎉 SAO CHÉP DATABASE THÀNH CÔNG RỰC RỠ!');
  console.log(`👉 Database Dev của bạn đã sẵn sàng: fb_ai_chatbot_dev\n`);
  process.exit(0);
}

cloneDatabase().catch((err) => {
  console.error('❌ Lỗi khi sao chép database:', err);
  process.exit(1);
});
