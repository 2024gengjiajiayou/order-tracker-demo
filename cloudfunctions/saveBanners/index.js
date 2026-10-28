const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 保存首页广告位配置（仅总管理员）
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { banners } = event || {}

  if (!Array.isArray(banners)) {
    return { success: false, message: 'banners 必须是数组' }
  }

  // 校验总管理员身份（普通管理员无权修改全局配置）
  let admins = []
  let owner = ''
  try {
    const cfg = await db.collection('config').doc('admin').get()
    const d = (cfg && cfg.data) || {}
    admins = d.openids || []
    owner = d.owner || admins[0] || ''
  } catch (e) {}
  if (!admins.includes(OPENID)) {
    return { success: false, message: '无权限，仅管理员可设置广告位' }
  }
  if (owner !== OPENID) {
    return { success: false, message: '仅总管理员可设置首页广告位' }
  }

  // 简单校验每项格式
  const valid = banners.filter(b => b && b.image && b.image.trim()).map(b => ({
    image: b.image.trim(),
    link: (b.link || '').trim(),
    title: (b.title || '').trim()
  }))

  try {
    // 优先 update；文档不存在则 set 新建
    try {
      await db.collection('config').doc('settings').update({ data: { banners: valid } })
    } catch (e) {
      await db.collection('config').doc('settings').set({ data: { banners: valid } })
    }
    return { success: true, banners: valid }
  } catch (err) {
    console.error('saveBanners 失败：', err)
    return { success: false, message: '保存失败：' + ((err && err.message) || String(err)) }
  }
}
