// ============================================================
// 部署配置统一放在根目录 config.js：换客户 / 换云环境只改那里。
// 首次部署请把 config.example.js 复制为 config.js 并填入环境 ID。
// ============================================================
const config = require('./config.js')

App({
  globalData: {
    openid: '',
    envId: config.ENV_ID,
    appName: config.APP_NAME
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库不支持云开发，请使用 2.2.3 以上基础库')
      return
    }
    try {
      wx.cloud.init({
        env: config.ENV_ID,
        traceUser: true
      })
    } catch (e) {
      console.error('云开发初始化失败，请检查 config.js 的 ENV_ID：', e)
      return
    }
    this.refreshOpenid()
  },

  // 获取当前用户的微信 openid（群主配置管理员时需要用到）
  refreshOpenid() {
    wx.cloud.callFunction({ name: 'getOpenid' })
      .then(res => {
        this.globalData.openid = res.result.openid
        wx.setStorageSync('openid', res.result.openid)
      })
      .catch(err => console.error('获取 openid 失败：', err))
  }
})
