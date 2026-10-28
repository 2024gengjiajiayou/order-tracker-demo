const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function genCode() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

// 一键运营初始化：
// 1) 确保 reports / projects / config 三个集合存在
// 2) 首次调用者自动成为管理员（写入 config.admin.openids）
// 3) 若没有任何项目，创建一个默认项目
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const log = []

  // 1) reports 集合：先写一个占位文档，再删除，集合即被创建（云函数有管理员权限）
  try {
    const seed = await db.collection('reports').add({ data: { _init: true, createdAt: db.serverDate() } })
    await db.collection('reports').doc(seed._id).remove()
    log.push('reports 集合已就绪')
  } catch (e) {
    log.push('reports 集合检查：' + (e.message || 'ok'))
  }

  // 2) config 集合 + 管理员（仅系统尚无管理员时，首次调用者成为管理员）
  let admins = []
  try {
    const cfg = await db.collection('config').doc('admin').get()
    admins = (cfg.data && cfg.data.openids) || []
  } catch (e) {
    admins = []
  }

  // 安全：系统已存在管理员，禁止任何人再把把自己加为管理员
  if (admins.length > 0) {
    return {
      success: false,
      isAdminNow: admins.includes(OPENID),
      message: '系统已存在管理员，无法重复初始化。如你不是管理员，请联系管理员将你的 openid 加入管理名单。'
    }
  }

  // 首次初始化：将当前调用者设为唯一管理员，同时指定为「总管理员」
  // 同时生成该管理员的团队名称与邀请码，供成员加入
  admins.push(OPENID)
  const teamName = '我的团队'
  const inviteCode = genCode()
  await db.collection('config').doc('admin').set({
    data: {
      openids: admins,
      owner: OPENID,
      names: { [OPENID]: teamName },
      inviteCodes: { [OPENID]: inviteCode },
      teamsEnabled: true
    }
  })
  log.push('已将你设为总管理员')

  // members 集合：成员与团队的绑定关系（_id = openid）
  try {
    await db.createCollection('members')
    log.push('members 集合已就绪')
  } catch (e) {
    log.push('members 集合检查：' + (e.message || 'ok'))
  }

  // 3) projects 集合 + 默认项目
  let projectMsg = ''
  try {
    const pc = await db.collection('projects').count()
    if (pc.total === 0) {
      await db.collection('projects').add({
        data: {
          name: '默认项目',
          enabled: true,
          ownerOpenid: OPENID,
          ownerName: teamName,
          createdAt: db.serverDate()
        }
      })
      projectMsg = '已创建默认项目「默认项目」'
    } else {
      projectMsg = '已存在项目，未重复创建'
    }
  } catch (e) {
    // 集合可能不存在，再尝试新建
    try {
      await db.collection('projects').add({
        data: {
          name: '默认项目',
          enabled: true,
          ownerOpenid: OPENID,
          ownerName: teamName,
          createdAt: db.serverDate()
        }
      })
      projectMsg = '已创建默认项目「默认项目」'
    } catch (e2) {
      projectMsg = '项目创建失败：' + (e2.message || e2)
    }
  }
  log.push(projectMsg)

  return {
    success: true,
    openid: OPENID,
    isAdminNow: true,
    becameAdmin: true,
    log
  }
}
