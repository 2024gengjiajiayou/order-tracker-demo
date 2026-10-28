const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 移除管理员
// 权限规则：只有「总管理员 owner」能移除管理员；owner 本人不可被移除
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { openid: targetOpenid } = event || {}

  if (!targetOpenid || !String(targetOpenid).trim()) {
    return { success: false, message: '缺少要移除的 openid' }
  }
  const target = String(targetOpenid).trim()

  // 读取管理员配置
  let admins = []
  let owner = ''
  let names = {}
  let inviteCodes = {}
  try {
    const cfg = await db.collection('config').doc('admin').get()
    const d = (cfg && cfg.data) || {}
    admins = d.openids || []
    owner = d.owner || admins[0] || ''
    names = { ...(d.names || {}) }
    inviteCodes = { ...(d.inviteCodes || {}) }
  } catch (e) {
    return { success: false, message: '系统尚未初始化，无法操作' }
  }

  if (!admins.includes(OPENID)) {
    return { success: false, message: '无权限，仅管理员可操作' }
  }
  if (OPENID !== owner) {
    return { success: false, message: '仅总管理员可移除管理员，管理员之间不能互相移除' }
  }
  if (target === owner) {
    return { success: false, message: '总管理员不可被移除' }
  }
  if (!admins.includes(target)) {
    return { success: false, message: '该用户当前不是管理员' }
  }
  if (admins.length <= 1) {
    return { success: false, message: '至少需保留一名管理员' }
  }

  const next = admins.filter(o => o !== target)
  delete names[target]
  delete inviteCodes[target]
  try {
    await db.collection('config').doc('admin').update({
      data: { openids: next, owner, names, inviteCodes }
    })
    return { success: true, openid: target, admins: next, owner }
  } catch (err) {
    console.error('removeAdmin 失败：', err)
    return { success: false, message: '移除失败：' + ((err && err.message) || String(err)) }
  }
}
