const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function getAdminConfig() {
  const cfg = await db.collection('config').doc('admin').get().catch(() => ({ data: null }))
  const d = (cfg && cfg.data) || {}
  const admins = d.openids || []
  const owner = d.owner || admins[0] || ''
  return {
    admins,
    owner,
    names: d.names || {},
    inviteCodes: d.inviteCodes || {},
    initialized: admins.length > 0,
    teamsEnabled: d.teamsEnabled === true
  }
}

// 成员通过邀请码加入某个管理员的团队
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const code = String((event && event.code) || '').trim().toUpperCase()
  if (!code) return { success: false, message: '请输入邀请码' }

  const cfg = await getAdminConfig()
  if (!cfg.initialized) return { success: false, message: '系统尚未初始化，请先让管理员初始化' }
  if (!cfg.teamsEnabled) return { success: false, message: '团队功能尚未启用，请联系总管理员' }
  if (cfg.admins.includes(OPENID)) {
    return { success: false, message: '你已经是管理员，无需加入团队' }
  }

  const teamOpenid = Object.keys(cfg.inviteCodes).find(
    o => String(cfg.inviteCodes[o]).toUpperCase() === code
  )
  if (!teamOpenid) return { success: false, message: '邀请码无效，请向管理员确认' }

  // 已绑定过团队：同团队直接成功，不同团队拒绝（避免成员串队）
  try {
    const existing = await db.collection('members').doc(OPENID).get()
    const m = existing.data
    if (m && m.teamOpenid && m.teamOpenid !== teamOpenid) {
      return { success: false, message: '你已加入其他团队，如需更换请联系总管理员' }
    }
  } catch (e) {
    // 集合或文档不存在，继续
  }

  // 首次使用时自动创建 members 集合
  await db.createCollection('members').catch(() => {})

  await db.collection('members').doc(OPENID).set({
    data: {
      openid: OPENID,
      teamOpenid,
      joinedAt: db.serverDate()
    }
  })

  return {
    success: true,
    teamOpenid,
    teamName: cfg.names[teamOpenid] || '未命名团队'
  }
}
