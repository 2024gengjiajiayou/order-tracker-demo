const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 修改团队名称
// 权限：管理员只能改自己团队的名称；总管理员可改任意团队
// 改名后同步 projects.ownerName 与 reports.teamName，避免历史记录仍显示旧名
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { teamOpenid, name } = event || {}

  const newName = String(name || '').trim()
  if (!newName) return { success: false, message: '请输入团队名称' }
  if (newName.length > 20) return { success: false, message: '团队名称不能超过 20 个字' }

  const cfg = await db.collection('config').doc('admin').get().catch(() => ({ data: null }))
  const d = (cfg && cfg.data) || {}
  const admins = d.openids || []
  const owner = d.owner || admins[0] || ''

  if (!admins.includes(OPENID)) {
    return { success: false, message: '无权限' }
  }

  const target = String(teamOpenid || OPENID).trim()
  if (!admins.includes(target)) {
    return { success: false, message: '团队不存在' }
  }
  if (OPENID !== owner && target !== OPENID) {
    return { success: false, message: '只能修改自己团队的名称' }
  }

  const names = { ...(d.names || {}) }
  names[target] = newName

  try {
    await db.collection('config').doc('admin').update({ data: { names } })
  } catch (err) {
    return { success: false, message: '保存失败：' + ((err && err.message) || String(err)) }
  }

  // 同步冗余字段（失败不影响改名本身，属于尽力而为）
  let projectCount = 0
  let reportCount = 0

  try {
    const p = await db.collection('projects')
      .where({ ownerOpenid: target })
      .update({ data: { ownerName: newName } })
    projectCount = (p.stats && p.stats.updated) || 0
  } catch (e) {
    console.warn('同步 projects.ownerName 失败：', e)
  }

  try {
    // 分批同步，单次更新有上限，循环到没有可更新的记录为止
    let guard = 0
    while (guard < 20) {
      guard++
      const r = await db.collection('reports')
        .where({ teamOpenid: target })
        .update({ data: { teamName: newName } })
      const n = (r.stats && r.stats.updated) || 0
      reportCount += n
      if (n === 0) break
    }
  } catch (e) {
    console.warn('同步 reports.teamName 失败：', e)
  }

  return {
    success: true,
    teamOpenid: target,
    name: newName,
    projects: projectCount,
    reports: reportCount
  }
}
