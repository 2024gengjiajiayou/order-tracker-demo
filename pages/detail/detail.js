const util = require('../../utils/util.js')

Page({
  data: {
    item: null,
    imageUrls: []
  },

  onLoad(opt) {
    const id = opt.id
    if (!id) return
    wx.showLoading({ title: '加载中…' })
    // 改为走云函数读取，绕开数据库集合权限限制
    wx.cloud.callFunction({ name: 'getReportDetail', data: { id } })
      .then(res => {
        if (res.result && res.result.success) {
          const r = res.result.item
          const item = {
            ...r,
            createdAtText: util.formatTime(r.createdAtTs ? new Date(r.createdAtTs) : r.createdAt),
            statusText: util.statusText(r.status),
            statusClass: util.statusClass(r.status),
            amountText: util.fmtMoney(r.amount),
            trackingListDisp: util.normalizeTracking(r),
            projectName: r.projectName || ''
          }
          this.setData({ item, imageUrls: res.result.imageUrls || [] })
        } else {
          wx.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' })
        }
      })
      .catch(err => {
        console.error('detail 加载失败：', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
      .then(() => wx.hideLoading())
  },

  preview(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({ current: url, urls: this.data.imageUrls })
  },

  goEdit() {
    if (!this.data.item) return
    wx.navigateTo({ url: '/pages/edit/edit?id=' + this.data.item._id })
  },

  copyTrack(e) {
    const no = e.currentTarget.dataset.no
    if (!no) return
    wx.setClipboardData({
      data: no,
      fail: (err) => {
        console.error('复制失败：', err)
        wx.showToast({ title: '复制失败，可长按单号复制', icon: 'none', duration: 2400 })
      }
    })
  }
})
