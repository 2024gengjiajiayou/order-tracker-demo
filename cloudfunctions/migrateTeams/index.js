const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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

async function getAdminConfig() {
  const cfg = await db.collection('config').doc('admin').get().catch(() => ({ data: null }))
  const d = (cfg && cfg.data) || {}
  const admins = d.openids || []
  const owner = d.owner || admins[0] || ''
  return {
    admins,
    owner,
    names: d.names || {},
    inviteCodes: d.inviteCodes || {}
  }
}

// 一次性迁移：历史数据默认归属总管理员，并给每个管理员补名称与邀请码
// 仅总管理员可调用，可重复执行（幂等）
exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  const cfg = await getAdminConfig()

  if (!cfg.admins.length) return { success: false, message: '系统尚未初始化' }
  if (OPENID !== cfg.owner) return { success: false, message: '仅总管理员可执行迁移' }

  const names = { ...cfg.names }
  const inviteCodes = { ...cfg.inviteCodes }
  let i = 0
  cfg.admins.forEach(o => {
    i += 1
    if (!names[o]) {
      names[o] = (o === cfg.owner) ? '我的团队' : ('团队' + i)
    }
    if (!inviteCodes[o]) {
      inviteCodes[o] = genCode(inviteCodes)
    }
  })

  await db.collection('config').doc('admin').update({
    data: {
      names,
      inviteCodes,
      teamsEnabled: true
    }
  })

  await db.createCollection('members').catch(() => {})

  const ownerName = names[cfg.owner] || '我的团队'
  const log = []

  // 历史项目：没有 ownerOpenid 的归总管理员
  try {
    const p = await db.collection('projects')
      .where({ ownerOpenid: _.exists(false) })
      .update({ data: { ownerOpenid: cfg.owner, ownerName } })
    log.push(`项目补齐 ${p.stats.updated} 条`)
  } catch (e) {
    log.push('项目集合暂不存在，跳过')
  }

  // 历史记录：没有 teamOpenid 的归总管理员
  let migrated = 0
  while (true) {
    try {
      const r = await db.collection('reports')
        .where({ teamOpenid: _.exists(false) })
        .update({ data: { teamOpenid: cfg.owner, teamName: ownerName } })
      const n = r.stats.updated
      migrated += n
      if (n === 0) break
    } catch (e) {
      break
    }
  }
  log.push(`记录补齐 ${migrated} 条`)

  return {
    success: true,
    owner: cfg.owner,
    names,
    inviteCodes,
    log
  }
}
