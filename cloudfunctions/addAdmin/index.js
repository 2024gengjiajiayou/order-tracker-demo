const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function genCode(existing) {
  const used = new Set(Object.values(existing || {}).map(c => String(c).toUpperCase()))
  for (let i = 0; i < 50; i++) {
    let code = ''
    for (let k = 0; k < 6; k++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    }
    if (!used.has(code)) return code
  }
  return 'T' + Date.now().toString(36).toUpperCase().slice(-5)
}

// 添加管理员（= 新建一个团队）
// 权限规则：只有「总管理员 owner」能添加管理员
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { openid: targetOpenid, name } = event || {}

  if (!targetOpenid || !targetOpenid.trim()) {
    return { success: false, message: '请输入要添加的管理员 openid' }
  }
  const target = targetOpenid.trim()

  // 读取管理员配置
  let admins = []
  let owner = ''
  let names = {}
  let inviteCodes = {}
  try {
    const cfg = await db.collection('config').doc('admin').get()
    const d = cfg.data || {}
    admins = d.openids || []
    owner = d.owner || admins[0] || ''
    names = d.names || {}
    inviteCodes = d.inviteCodes || {}
  } catch (e) {
    return { success: false, message: '系统尚未初始化，无法添加管理员' }
  }

  if (!admins.includes(OPENID)) {
    return { success: false, message: '无权限，仅管理员可操作' }
  }
  if (OPENID !== owner) {
    return { success: false, message: '仅总管理员可添加管理员' }
  }
  if (admins.includes(target)) {
    return { success: false, message: '该用户已经是管理员' }
  }

  const teamName = (name && String(name).trim()) || ('团队' + (admins.length + 1))
  const inviteCode = genCode(inviteCodes)
  const nextAdmins = admins.concat(target)
  const nextNames = { ...names, [target]: teamName }
  const nextCodes = { ...inviteCodes, [target]: inviteCode }

  try {
    await db.collection('config').doc('admin').update({
      data: {
        openids: nextAdmins,
        // 顺带自愈：老数据没有 owner 字段时补上
        owner: owner || OPENID,
        names: nextNames,
        inviteCodes: nextCodes
      }
    })
    return { success: true, openid: target, name: teamName, inviteCode }
  } catch (err) {
    console.error('addAdmin 失败：', err)
    return { success: false, message: '添加失败：' + ((err && err.message) || String(err)) }
  }
}
