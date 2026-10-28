const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 获取首页广告位（公开读取）
exports.main = async () => {
  try {
    const res = await db.collection('config').doc('settings').get()
    const banners = (res.data && res.data.banners) || []
    return { success: true, banners }
  } catch (err) {
    // settings 文档不存在时返回空数组
    return { success: true, banners: [] }
  }
}
