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

// 获取项目列表
// - 普通成员：只返回自己所属团队、启用中的项目
// - 管理员：只返回自己团队的项目（includeDisabled 时含停用项，供后台管理）
// - 总管理员：返回全部项目
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { includeDisabled } = event || {}

  const cfg = await getAdminConfig()
  const isAdmin = cfg.admins.includes(OPENID)
  const isOwner = cfg.owner === OPENID

  // 团队功能尚未启用（老版本兼容）：沿用旧的“全员共享项目”逻辑
  if (!cfg.teamsEnabled) {
    try {
      const q = (isAdmin && includeDisabled) ? {} : { enabled: true }
      const res = await db.collection('projects')
        .where(q)
        .orderBy('createdAt', 'asc')
        .limit(100)
        .get()
      return { success: true, list: res.data || [], needJoin: false, teamName: '', teamOpenid: '' }
    } catch (err) {
      return { success: true, list: [], needJoin: false, teamName: '', teamOpenid: '' }
    }
  }

  let teamOpenid = ''
  if (isAdmin) {
    teamOpenid = OPENID
  } else {
    const m = await getMember(OPENID)
    teamOpenid = (m && m.teamOpenid) || ''
  }

  if (!isAdmin && !teamOpenid) {
    return { success: true, list: [], needJoin: true, teamName: '', teamOpenid: '' }
  }

  const query = {}
  if (!(isAdmin && includeDisabled)) query.enabled = true
  if (!isOwner) {
    query.ownerOpenid = teamOpenid
  } else if (!includeDisabled) {
    // 总管理员在上报页只选自己团队的项目；后台管理（includeDisabled）看全部
    query.ownerOpenid = OPENID
  }

  try {
    const res = await db.collection('projects')
      .where(query)
      .orderBy('createdAt', 'asc')
      .limit(100)
      .get()
    return {
      success: true,
      list: res.data || [],
      needJoin: false,
      teamOpenid,
      teamName: cfg.names[teamOpenid] || ''
    }
  } catch (err) {
    // 集合尚未创建时返回空，不影响上报流程
    console.error('getProjects 失败：', err)
    return {
      success: true,
      list: [],
      needJoin: false,
      teamOpenid,
      teamName: cfg.names[teamOpenid] || ''
    }
  }
}
