const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 删除单条上报记录
// 权限：本团队管理员或总管理员；普通成员不能删（避免误删已核对的账）
// 删除记录的同时清理关联截图，减少存储占用
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { id } = event || {}

  if (!id) return { success: false, message: '缺少记录 id' }

  let record = null
  try {
    const doc = await db.collection('reports').doc(id).get()
    record = doc.data
  } catch (e) {
    record = null
  }
  if (!record) return { success: false, message: '记录不存在或已删除' }

  // 读取配置判断权限
  let admins = []
  let owner = ''
  let teamsEnabled = false
  try {
    const cfg = await db.collection('config').doc('admin').get()
    const d = (cfg && cfg.data) || {}
    admins = d.openids || []
    owner = d.owner || admins[0] || ''
    teamsEnabled = d.teamsEnabled === true
  } catch (e) {}

  const isAdmin = admins.includes(OPENID)
  const isOwner = owner === OPENID
  // 未启用团队功能时所有管理员都可删；启用后只能删本团队的
  const isTeamAdmin = isAdmin && (!teamsEnabled || record.teamOpenid === OPENID)

  if (!isOwner && !isTeamAdmin) {
    return { success: false, message: '无权删除该记录' }
  }

  try {
    await db.collection('reports').doc(id).remove()
  } catch (err) {
    console.error('deleteReport 失败：', err)
    return { success: false, message: '删除失败：' + ((err && err.message) || String(err)) }
  }

  // 尽力清理截图，失败不影响删除结果
  if (Array.isArray(record.images) && record.images.length) {
    try {
      await cloud.deleteFile({ fileList: record.images })
    } catch (e) {
      console.warn('截图清理失败（可忽略）：', e)
    }
  }

  return { success: true, id }
}
