const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 管理员维护项目：add / update(改名或启停) / delete
// 团队隔离：普通管理员只能管理自己团队的项目，总管理员可管理全部
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()

  // 管理员校验
  const cfg = await db.collection('config').doc('admin').get().catch(() => ({ data: null }))
  const d = (cfg && cfg.data) || {}
  const admins = d.openids || []
  const owner = d.owner || admins[0] || ''
  const names = d.names || {}
  if (!admins.includes(OPENID)) {
    return { success: false, message: '无权限' }
  }
  const isOwner = owner === OPENID
  const teamsEnabled = d.teamsEnabled === true

  const { action, id, name, enabled } = event
  try {
    // 首次使用时自动创建 projects 集合（已存在则忽略错误）
    await db.createCollection('projects').catch(() => {})

    if (action === 'add') {
      if (!name || !name.trim()) return { success: false, message: '请填写项目名称' }
      const res = await db.collection('projects').add({
        data: {
          name: name.trim(),
          enabled: true,
          ownerOpenid: OPENID,
          ownerName: names[OPENID] || '我的团队',
          createdAt: db.serverDate()
        }
      })
      return { success: true, id: res._id }
    }

    if (action === 'update' || action === 'delete') {
      if (!id) return { success: false, message: '参数错误' }

      // 团队隔离校验：启用团队功能后，非 owner 只能操作本团队项目
      if (teamsEnabled && !isOwner) {
        const p = await db.collection('projects').doc(id).get().catch(() => ({ data: null }))
        const proj = p && p.data
        if (!proj) return { success: false, message: '项目不存在' }
        if (proj.ownerOpenid !== OPENID) {
          return { success: false, message: '无权操作其他团队的项目' }
        }
      }

      if (action === 'update') {
        const data = {}
        if (name !== undefined && name !== null) data.name = String(name).trim()
        if (enabled !== undefined && enabled !== null) data.enabled = !!enabled
        await db.collection('projects').doc(id).update({ data })
        return { success: true }
      }

      await db.collection('projects').doc(id).remove()
      return { success: true }
    }

    return { success: false, message: '未知操作' }
  } catch (err) {
    console.error('manageProject 失败：', err)
    return { success: false, message: '操作失败' }
  }
}
