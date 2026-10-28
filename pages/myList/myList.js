const util = require('../../utils/util.js')
const app = getApp()

Page({
  data: {
    list: [],
    loading: true
  },

  onShow() {
    this.load()
    try {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline'],
        fail: () => {}
      })
    } catch (e) {}
  },

  load() {
    this.setData({ loading: true })
    // 改为走云函数读取本人记录，绕开数据库集合权限限制（与后台一致，稳定可靠）
    wx.cloud.callFunction({ name: 'getMyReports', data: {} })
      .then(res => {
        const raw = (res.result && res.result.list) || []
        const list = raw.map(r => ({
          ...r,
          createdAtText: util.formatTime(r.createdAtTs ? new Date(r.createdAtTs) : r.createdAt),
          statusText: util.statusText(r.status),
          statusClass: util.statusClass(r.status),
          amountText: util.fmtMoney(r.amount)
        }))
        this.setData({ list, loading: false })
      })
      .catch(err => {
        console.error('myList 加载失败：', err)
        const msg = (err && err.message) || (err && err.errMsg) || '加载失败'
        wx.showToast({ title: msg.slice(0, 50), icon: 'none' })
        this.setData({ loading: false, list: [] })
      })
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id })
  },

  onShareAppMessage() {
    const name = app.globalData.appName || '下单统筹助手'
    return {
      title: `${name} · 群购订单上报与对账`,
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    const name = app.globalData.appName || '下单统筹助手'
    return {
      title: `${name} · 群购订单上报与对账`
    }
  }
})
