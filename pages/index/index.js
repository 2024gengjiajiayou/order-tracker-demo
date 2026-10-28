const app = getApp()

Page({
  data: {
    openid: '',
    banners: []
  },
  onShow() {
    const openid = app.globalData.openid || wx.getStorageSync('openid') || ''
    this.setData({ openid })
    this.loadBanners()
    this.enableShareMenu()
  },

  // 显式打开「转发」和「分享到朋友圈」入口（低版本基础库会静默失败，不影响使用）
  enableShareMenu() {
    try {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline'],
        fail: () => {}
      })
    } catch (e) {}
  },

  async loadBanners() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getBanners', data: {} })
      if (res.result && res.result.success) {
        this.setData({ banners: res.result.banners || [] })
      }
    } catch (e) {
      console.error('loadBanners 失败：', e)
    }
  },

  onBannerTap(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item.link) return
    // 小程序页面路径直接跳转；外部链接复制到剪贴板
    if (item.link.startsWith('/pages/')) {
      wx.navigateTo({ url: item.link })
    } else if (item.link.startsWith('http')) {
      wx.setClipboardData({
        data: item.link,
        success: () => wx.showToast({ title: '链接已复制', icon: 'none' }),
        fail: () => wx.showToast({ title: '复制失败，可长按页面文字复制', icon: 'none' })
      })
    }
  },

  copyOpenid() {
    if (!this.data.openid) return
    wx.setClipboardData({
      data: this.data.openid,
      fail: (err) => {
        console.error('复制失败：', err)
        wx.showToast({ title: '复制失败，可长按文字手动复制', icon: 'none', duration: 2800 })
      }
    })
  },

  // 转发给好友 / 群
  onShareAppMessage() {
    const name = app.globalData.appName || '下单统筹助手'
    return {
      title: `${name} · 群购订单上报与对账`,
      path: '/pages/index/index'
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    const name = app.globalData.appName || '下单统筹助手'
    return {
      title: `${name} · 群购订单上报与对账`
    }
  }
})
