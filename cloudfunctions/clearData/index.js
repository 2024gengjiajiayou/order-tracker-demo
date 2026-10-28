const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 管理员清空数据
// scope: 'reports' 清空上报记录（默认）; 'all' 同时清空项目与成员绑定
// 团队隔离：普通管理员只能清空本团队数据；总管理员可清空全部或指定团队
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { scope = 'reports', teamOpenid } = event || {}

  const cfg = await db.collection('config').doc('admin').get().catch(() => ({ data: null }))
  const d = (cfg && cfg.data) || {}
  const admins = d.openids || []
  const owner = d.owner || admins[0] || ''
  if (!admins.includes(OPENID)) {
    return { success: false, message: '无权限，仅管理员可清空数据' }
  }

  const isOwner = owner === OPENID
  const teamsEnabled = d.teamsEnabled === true
  const filterTeam = !teamsEnabled
    ? ''
    : (isOwner
        ? ((teamOpenid && teamOpenid !== 'all') ? teamOpenid : '')
        : OPENID)

  const results = []
  try {
    if (scope === 'reports' || scope === 'all') {
      const where = filterTeam ? { teamOpenid: filterTeam } : {}
      const count = await clearCollection('reports', where)
      results.push(`已清空 ${count} 条上报记录`)
    }
    if (scope === 'all') {
      const pWhere = filterTeam ? { ownerOpenid: filterTeam } : {}
      const pCount = await clearCollection('projects', pWhere).catch(() => 0)
      results.push(`已清空 ${pCount} 个项目`)

      const mWhere = filterTeam ? { teamOpenid: filterTeam } : {}
      const mCount = await clearCollection('members', mWhere).catch(() => 0)
      results.push(`已清空 ${mCount} 条成员绑定`)
    }
    return { success: true, message: results.join('；') }
  } catch (err) {
    console.error('clearData 失败：', err)
    return { success: false, message: '清空失败：' + ((err && err.message) || String(err)) }
  }
}

// 分批清空集合（每批 50 条，防止单次请求过大）
async function clearCollection(colName, where) {
  let total = 0
  while (true) {
    let q = db.collection(colName)
    if (where && Object.keys(where).length) q = q.where(where)
    const res = await q.limit(50).get()
    if (!res.data.length) break
    const ids = res.data.map(r => r._id)
    await db.collection(colName).where({ _id: _.in(ids) }).remove()
    total += ids.length
    if (ids.length < 50) break
  }
  return total
}
