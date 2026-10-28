const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function getAdminConfig() {
  const cfg = await db.collection('config').doc('admin').get().catch(() => ({ data: null }))
  const d = (cfg && cfg.data) || {}
  const admins = d.openids || []
  const owner = d.owner || admins[0] || ''
  return { admins, owner, names: d.names || {}, teamsEnabled: d.teamsEnabled === true }
}

async function getMember(openid) {
  try {
    const res = await db.collection('members').doc(openid).get()
    return res.data || null
  } catch (e) {
    return null
  }
}

// 保存一条下单上报记录
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()

  const {
    name, phone, platform, orderNo,
    trackingList, amount, images, remark,
    projectId, projectName
  } = event

  // 基础校验：姓名、联系方式、金额为必填
  if (!name || !name.trim()) return { success: false, message: '请填写姓名' }
  if (!phone || !phone.trim()) return { success: false, message: '请填写联系方式' }
  if (amount === undefined || amount === null || amount === '' || isNaN(Number(amount))) {
    return { success: false, message: '请填写正确的下单金额' }
  }

  // 团队归属：管理员代表自己的团队；成员必须有加入的团队
  // 团队功能未启用时（老版本兼容）沿用旧逻辑，不强制团队
  const cfg = await getAdminConfig()
  const isAdmin = cfg.admins.includes(OPENID)
  let teamOpenid = ''
  let teamName = ''
  if (cfg.teamsEnabled) {
    if (isAdmin) {
      teamOpenid = OPENID
      teamName = cfg.names[OPENID] || '我的团队'
    } else {
      const m = await getMember(OPENID)
      if (!m || !m.teamOpenid) {
        return { success: false, message: '请先加入团队后再上报' }
      }
      teamOpenid = m.teamOpenid
      teamName = cfg.names[teamOpenid] || '未命名团队'
    }
  }

  // 所选项目必须属于本人团队，服务端校验防止跨团队上报
  let projName = projectName || ''
  if (projectId) {
    const p = await db.collection('projects').doc(projectId).get().catch(() => ({ data: null }))
    const proj = p && p.data
    if (!proj) return { success: false, message: '所选项目不存在，请刷新后重试' }
    if (cfg.teamsEnabled) {
      const projOwner = proj.ownerOpenid || cfg.owner
      if (projOwner !== teamOpenid) {
        return { success: false, message: '不能上报到其他团队的项目' }
      }
      teamName = cfg.names[projOwner] || teamName
    }
    projName = proj.name || projName
  }

  // 快递单号：支持多个，清洗为空项
  const tracking = Array.isArray(trackingList)
    ? trackingList.map(s => (s || '').trim()).filter(Boolean)
    : []

  // 组织要写入的数据
  const record = {
    openid: OPENID,
    name: name.trim(),
    phone: phone.trim(),
    platform: platform || '其他',
    orderNo: (orderNo || '').trim(),
    trackingList: tracking,
    trackingNo: tracking.join(' / '),
    projectId: projectId || '',
    projectName: projName,
    teamOpenid,
    teamName,
    amount: Number(amount),
    images: images || [],
    remark: (remark || '').trim(),
    status: 'pending',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }

  try {
    const res = await db.collection('reports').add({ data: record })
    return { success: true, id: res._id }
  } catch (err) {
    console.error('submitReport 首次写入失败：', err)
    const errMsg = (err && err.message) || String(err)
    // 集合尚未创建时，自动创建集合并重试一次（自修复，避免“集合未创建”导致上报失败）
    if (/collection|集合|not exist|不存在|cannot be found/i.test(errMsg)) {
      try {
        await db.createCollection('reports')
        const res = await db.collection('reports').add({ data: record })
        return { success: true, id: res._id }
      } catch (e2) {
        console.error('submitReport 自动建集合仍失败：', e2)
        return {
          success: false,
          message: '数据库 reports 集合不存在且自动创建失败：请打开「云开发控制台」→「数据库」→ 新建集合 reports。'
        }
      }
    }
    return { success: false, message: '保存失败：' + errMsg }
  }
}
