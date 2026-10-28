const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 按 id 读取单条记录（服务端查询，不受集合权限限制）
// 权限：本人可看自己的记录，管理员可看全部
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { id } = event || {}

  if (!id) return { success: false, message: '缺少记录 id' }

  try {
    const res = await db.collection('reports').doc(id).get()
    const r = res.data
    if (!r) return { success: false, message: '记录不存在或已删除' }

    // 判断是否管理员 / 总管理员 / 该记录所属团队的管理员
    let isAdmin = false
    let isOwner = false
    let teamsEnabled = false
    try {
      const cfg = await db.collection('config').doc('admin').get()
      const d = cfg.data || {}
      const admins = d.openids || []
      isAdmin = admins.includes(OPENID)
      isOwner = (d.owner || admins[0] || '') === OPENID
      teamsEnabled = d.teamsEnabled === true
    } catch (e) {
      isAdmin = false
      isOwner = false
    }
    // 未启用团队功能时，沿用旧规则：任何管理员可看全部
    const isTeamAdmin = isAdmin && (!teamsEnabled || r.teamOpenid === OPENID)

    // 非本人、非本团队管理员、非总管理员，拒绝查看
    if (r.openid !== OPENID && !isOwner && !isTeamAdmin) {
      return { success: false, message: '无权查看该记录' }
    }

    // 截图 fileID 换成可预览的临时链接
    let imageUrls = []
    if (r.images && r.images.length) {
      const tmp = await cloud.getTempFileURL({ fileList: r.images })
      imageUrls = tmp.fileList.map(f => f.tempFileURL)
    }

    return {
      success: true,
      item: {
        ...r,
        createdAtTs: (r.createdAt && typeof r.createdAt.getTime === 'function')
          ? r.createdAt.getTime()
          : (r.createdAt ? new Date(r.createdAt).getTime() : 0)
      },
      imageUrls
    }
  } catch (err) {
    console.error('getReportDetail 失败：', err)
    return { success: false, message: '加载失败：' + ((err && err.message) || String(err)) }
  }
}
