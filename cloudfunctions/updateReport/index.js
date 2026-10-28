const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 修改一条上报记录
// 权限：本人（仅待核对状态）或本团队管理员或总管理员
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const {
    id, name, phone, platform, orderNo,
    trackingList, amount, images, remark,
    projectId, projectName
  } = event

  if (!id) return { success: false, message: '缺少记录 id' }

  try {
    const doc = await db.collection('reports').doc(id).get()
    const r = doc.data
    if (!r) return { success: false, message: '记录不存在或已删除' }

    // 权限校验：本人 / 本团队管理员 / 总管理员
    let isAdmin = false
    let isOwner = false
    let teamsEnabled = false
    let names = {}
    let owner = ''
    try {
      const cfg = await db.collection('config').doc('admin').get()
      const d = cfg.data || {}
      const admins = d.openids || []
      owner = d.owner || admins[0] || ''
      names = d.names || {}
      isAdmin = admins.includes(OPENID)
      isOwner = owner === OPENID
      teamsEnabled = d.teamsEnabled === true
    } catch (e) {}

    const isTeamAdmin = isAdmin && (!teamsEnabled || r.teamOpenid === OPENID)
    if (r.openid !== OPENID && !isOwner && !isTeamAdmin) {
      return { success: false, message: '无权修改该记录' }
    }

    // 非管理员时，只有待核对状态才能修改
    if (r.status !== 'pending' && !isOwner && !isTeamAdmin) {
      return { success: false, message: '记录已核对/结算，无法修改' }
    }

    const tracking = Array.isArray(trackingList)
      ? trackingList.map(s => (s || '').trim()).filter(Boolean)
      : []

    const data = {
      name: (name || '').trim(),
      phone: (phone || '').trim(),
      platform: platform || '其他',
      orderNo: (orderNo || '').trim(),
      trackingList: tracking,
      trackingNo: tracking.join(' / '),
      projectId: projectId || '',
      projectName: projectName || '',
      amount: Number(amount) || 0,
      images: images || [],
      remark: (remark || '').trim(),
      updatedAt: db.serverDate()
    }

    // 改项目时同步团队归属，并禁止跨团队修改
    if (projectId) {
      const p = await db.collection('projects').doc(projectId).get().catch(() => ({ data: null }))
      const proj = p && p.data
      if (!proj) return { success: false, message: '所选项目不存在，请刷新后重试' }
      const projOwner = proj.ownerOpenid || owner
      const teamOpenid = r.teamOpenid || (isAdmin ? OPENID : '')
      if (teamsEnabled && teamOpenid && projOwner !== teamOpenid) {
        return { success: false, message: '不能改到其他团队的项目' }
      }
      if (teamsEnabled) {
        data.teamOpenid = projOwner
        data.teamName = names[projOwner] || r.teamName || ''
      }
      data.projectName = proj.name || data.projectName
    }

    await db.collection('reports').doc(id).update({ data })

    return { success: true }
  } catch (err) {
    console.error('updateReport 失败：', err)
    return { success: false, message: '修改失败：' + ((err && err.message) || String(err)) }
  }
}
