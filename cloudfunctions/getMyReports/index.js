const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 读取「当前用户本人」上报的记录（服务端查询，不受集合权限限制）
exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return { success: false, list: [], message: '无法获取用户身份，请稍后重试' }
  }

  try {
    const res = await db.collection('reports')
      .where({ openid: OPENID })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()

    const list = (res.data || []).map(r => ({
      ...r,
      // 把服务端 Date 转成毫秒时间戳，前端可稳定格式化，避免云函数序列化导致时间丢失
      createdAtTs: (r.createdAt && typeof r.createdAt.getTime === 'function')
        ? r.createdAt.getTime()
        : (r.createdAt ? new Date(r.createdAt).getTime() : 0)
    }))

    return { success: true, list }
  } catch (err) {
    console.error('getMyReports 失败：', err)
    const msg = (err && err.message) || String(err)
    if (/collection|集合|not exist|不存在/i.test(msg)) {
      return { success: false, list: [], message: 'reports 集合未创建：请先在「管理后台」点击「一键初始化」' }
    }
    return { success: false, list: [], message: '读取失败：' + msg }
  }
}
