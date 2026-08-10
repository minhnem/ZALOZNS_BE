import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const deleteFileByUrl = async (url) => {
  try {
    const urlWithoutParams = url.split('?')[0];

    const uploadIndex = urlWithoutParams.indexOf('/upload/');
    if (uploadIndex === -1) {
      throw new Error('Không phải URL Cloudinary hợp lệ');
    }

    let fullPath = urlWithoutParams.slice(uploadIndex + 8);

    const versionMatch = fullPath.match(/^v\d+\//);
    if (versionMatch) {
      fullPath = fullPath.substring(versionMatch[0].length);
    }

    const publicId = fullPath.substring(0, fullPath.lastIndexOf('.'));

    const result = await cloudinary.uploader.destroy(publicId);

    return result;
  } catch (error) {
    console.error('Lỗi khi xóa ảnh từ Cloudinary:', error);
    throw error;
  }
};
