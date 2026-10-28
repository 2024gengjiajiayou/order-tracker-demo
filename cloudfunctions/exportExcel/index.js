const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MAX_FETCH = 1000

async function getAdminConfig() {
  const cfg = await db.collection('config').doc('admin').get().catch(() => ({ data: null }))
  const d = (cfg && cfg.data) || {}
  const admins = d.openids || []
  const owner = d.owner || admins[0] || ''
  return { admins, owner, names: d.names || {}, teamsEnabled: d.teamsEnabled === true }
}

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

function statusText(s) {
  return { pending: '待核对', verified: '已核对', settled: '已结算' }[s] || '待核对'
}

function fmt(d) {
  if (!d) return ''
  const x = (d instanceof Date) ? d : new Date(d)
  if (isNaN(x.getTime())) return ''
  const p = n => (n < 10 ? '0' + n : '' + n)
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`
}

// 多个快递单号连接成字符串
function normTracking(r) {
  if (Array.isArray(r.trackingList) && r.trackingList.length) {
    return r.trackingList.map(s => (s || '').trim()).filter(Boolean).join(' / ')
  }
  return r.trackingNo || ''
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { admins, owner, names, teamsEnabled } = await getAdminConfig()
  if (!admins.includes(OPENID)) {
    return { success: false, message: '无权限' }
  }

  const isOwner = owner === OPENID
  const { teamOpenid } = event || {}

  // 与 getReports 相同的团队隔离规则（未启用团队功能时不隔离）
  const query = {}
  if (teamsEnabled) {
    if (!isOwner) {
      query.teamOpenid = OPENID
    } else if (teamOpenid && teamOpenid !== 'all') {
      query.teamOpenid = teamOpenid
    }
  }

  const list = await fetchAll(query)

  const header = ['姓名', '团队', '联系方式', '平台', '所属项目', '订单号', '快递单号', '金额(元)', '状态', '上报时间', '备注']
  const rows = list.map(r => [
    r.name,
    r.teamName || names[r.teamOpenid] || '',
    r.phone,
    r.platform,
    r.projectName || '',
    r.orderNo,
    normTracking(r),
    Number(r.amount) || 0,
    statusText(r.status),
    fmt(r.createdAt),
    r.remark
  ])

  // 末尾追加汇总行
  const total = rows.reduce((s, r) => s + (Number(r[7]) || 0), 0)
  rows.push([])
  rows.push(['汇总', '', '', '', '', '', '', total, `共 ${list.length} 条`, '', ''])

  const buffer = xlsx.build([{ name: '下单上报记录', data: [header].concat(rows) }])

  const fileName = `reports_${Date.now()}.xlsx`
  try {
    const up = await cloud.uploadFile({
      cloudPath: `export/${fileName}`,
      fileContent: buffer
    })
    return { success: true, fileID: up.fileID }
  } catch (err) {
    console.error('exportExcel 失败：', err)
    return { success: false, message: '生成失败' }
  }
}
