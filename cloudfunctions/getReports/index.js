const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MAX_FETCH = 1000 // 单次最多拉取条数（云函数读取上限，小团队足够）

// 读取 config 集合中的管理员/团队配置
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
    teamsEnabled: d.teamsEnabled === true
  }
}

// 分页拉取全部符合筛选条件的记录
async function fetchAll(query) {
  let all = []
  let skip = 0
  while (all.length < MAX_FETCH) {
    const res = await db.collection('reports')
      .where(query)
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(100)
      .get()
    all = all.concat(res.data)
    if (res.data.length < 100) break
    skip += 100
  }
  return all
}

// 把截图 cloud fileID 批量换成可访问的临时链接
async function withTempUrls(list) {
  const fileIDs = []
  list.forEach(r => (r.images || []).forEach(f => fileIDs.push(f)))
  const map = {}
  if (fileIDs.length) {
    const tmp = await cloud.getTempFileURL({ fileList: fileIDs })
    tmp.fileList.forEach(f => { map[f.fileID] = f.tempFileURL })
  }
  list.forEach(r => {
    r.imageUrls = (r.images || []).map(f => map[f] || f)
  })
  return list
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { admins, owner, names, inviteCodes, teamsEnabled } = await getAdminConfig()
  if (!admins.includes(OPENID)) {
    return { success: false, isAdmin: false, openid: OPENID, noAdmin: admins.length === 0, message: '无权限' }
  }

  const isOwner = owner === OPENID
  const { status, keyword, projectId, teamOpenid } = event

  const query = {}
  if (status && status !== 'all') query.status = status
  if (projectId && projectId !== 'all') query.projectId = projectId
  if (keyword && keyword.trim()) {
    query.name = db.RegExp({ regexp: keyword.trim(), options: 'i' })
  }

  // 团队隔离：团队功能未启用时保持旧的“全员可见”；
  // 启用后普通管理员强制只看自己团队，总管理员可看全部或指定团队
  if (teamsEnabled) {
    if (!isOwner) {
      query.teamOpenid = OPENID
    } else if (teamOpenid && teamOpenid !== 'all') {
      query.teamOpenid = teamOpenid
    }
  }

  const list = await fetchAll(query)
  await withTempUrls(list)

  // 汇总统计（基于过滤后的数据，天然按团队分开）
  let totalAmount = 0
  const personMap = {}
  const projectMap = {}
  list.forEach(r => {
    const amt = Number(r.amount) || 0
    totalAmount += amt
    if (!personMap[r.name]) personMap[r.name] = { name: r.name, amount: 0, count: 0 }
    personMap[r.name].amount += amt
    personMap[r.name].count += 1

    const pName = r.projectName || '未指定项目'
    if (!projectMap[pName]) projectMap[pName] = { name: pName, amount: 0, count: 0 }
    projectMap[pName].amount += amt
    projectMap[pName].count += 1
  })
  const persons = Object.values(personMap).sort((a, b) => b.amount - a.amount)
  const projectStats = Object.values(projectMap).sort((a, b) => b.amount - a.amount)

  const teams = (isOwner && teamsEnabled)
    ? admins.map(o => ({
        openid: o,
        name: names[o] || '未命名团队',
        inviteCode: inviteCodes[o] || '',
        isOwner: o === owner
      }))
    : []

  // 邀请码只对总管理员全量可见；普通管理员只看自己的；未启用团队功能时不下发
  const visibleCodes = !teamsEnabled
    ? {}
    : (isOwner ? inviteCodes : { [OPENID]: inviteCodes[OPENID] || '' })

  return {
    success: true,
    isAdmin: true,
    list,
    total: list.length,
    totalAmount,
    totalCount: list.length,
    persons,
    projectStats,
    admins: isOwner ? admins : [OPENID],
    owner: isOwner ? owner : '',
    isOwner,
    names: isOwner ? names : { [OPENID]: names[OPENID] || '我的团队' },
    inviteCodes: visibleCodes,
    teams,
    teamsEnabled,
    teamOpenid: (teamsEnabled && !isOwner) ? OPENID : '',
    teamName: (teamsEnabled && !isOwner) ? (names[OPENID] || '我的团队') : '',
    myInviteCode: teamsEnabled ? (inviteCodes[OPENID] || '') : ''
  }
}
