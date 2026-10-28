const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const VALID = ['pending', 'verified', 'settled']

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()

  // 管理员校验
  const cfg = await db.collection('config').doc('admin').get().catch(() => ({ data: null }))
  const d = (cfg && cfg.data) || {}
  const admins = d.openids || []
  const owner = d.owner || admins[0] || ''
  if (!admins.includes(OPENID)) {
    return { success: false, message: '无权限' }
  }
  const isOwner = owner === OPENID
  const teamsEnabled = d.teamsEnabled === true

  const { id, status } = event
  if (!id || !VALID.includes(status)) {
    return { success: false, message: '参数错误' }
  }

  try {
    // 团队隔离：启用后普通管理员只能改本团队记录
    if (teamsEnabled && !isOwner) {
      const doc = await db.collection('reports').doc(id).get()
      const r = doc.data
      if (!r) return { success: false, message: '记录不存在' }
      if (r.teamOpenid !== OPENID) {
        return { success: false, message: '无权操作其他团队的记录' }
      }
    }

    await db.collection('reports').doc(id).update({
      data: { status, updatedAt: db.serverDate() }
    })
    return { success: true }
  } catch (err) {
    console.error('updateStatus 失败：', err)
    return { success: false, message: '更新失败' }
  }
}
