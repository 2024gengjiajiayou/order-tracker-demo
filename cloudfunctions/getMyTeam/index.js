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

async function getMember(openid) {
  try {
    const res = await db.collection('members').doc(openid).get()
    return res.data || null
  } catch (e) {
    return null
  }
}

// 读取当前用户的团队信息
exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  const cfg = await getAdminConfig()
  const isAdmin = cfg.admins.includes(OPENID)
  const isOwner = cfg.owner === OPENID

  let teamOpenid = ''
  let teamName = ''

  if (cfg.teamsEnabled) {
    if (isAdmin) {
      // 管理员本身就是团长，团队就是自己
      teamOpenid = OPENID
      teamName = cfg.names[OPENID] || '我的团队'
    } else {
      const m = await getMember(OPENID)
      if (m && m.teamOpenid) {
        teamOpenid = m.teamOpenid
        teamName = cfg.names[teamOpenid] || '未命名团队'
      }
    }
  }

  // 只有总管理员能看到全部团队清单（含邀请码）
  const teams = (isOwner && cfg.teamsEnabled)
    ? cfg.admins.map(o => ({
        openid: o,
        name: cfg.names[o] || '未命名团队',
        inviteCode: cfg.inviteCodes[o] || '',
        isOwner: o === cfg.owner
      }))
    : []

  return {
    success: true,
    initialized: cfg.initialized,
    teamsEnabled: cfg.teamsEnabled,
    openid: OPENID,
    isAdmin,
    isOwner,
    teamOpenid,
    teamName,
    needJoin: cfg.teamsEnabled && !isAdmin && !teamOpenid,
    inviteCode: (cfg.teamsEnabled && isAdmin) ? (cfg.inviteCodes[OPENID] || '') : '',
    teams
  }
}
