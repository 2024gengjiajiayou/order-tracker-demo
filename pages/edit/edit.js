const util = require('../../utils/util.js')

Page({
  data: {
    id: '',
    name: '',
    phone: '',
    platforms: ['淘宝', '京东', '拼多多', '抖音', '微信小店', '其他'],
    platformIndex: 0,
    projects: [],
    projectIndex: 0,
    hasProjects: false,
    orderNo: '',
    trackingList: [''],
    amount: '',
    remark: '',
    images: [],
    loading: true,
    saving: false,
    status: 'pending',
    statusText: '待核对',
    reportProjectId: ''
  },

  onLoad(opt) {
    if (!opt.id) {
      wx.showToast({ title: '缺少记录 id', icon: 'none' })
      return wx.navigateBack()
    }
    this.setData({ id: opt.id })
    this.loadDetail()
  },

  onShow() {
    this.loadProjects()
  },

  // 拉取管理员创建的项目（仅启用中的）
  async loadProjects() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getProjects', data: {} })
      const list = (res.result && res.result.list) || []
      this.setData({ projects: list, hasProjects: list.length > 0 }, () => {
        this.syncProjectIndex()
      })
    } catch (e) {
      console.error('loadProjects 失败：', e)
    }
  },

  // 同步项目下拉选中项
  syncProjectIndex() {
    const idx = this.data.projects.findIndex(p => p._id === this.data.reportProjectId)
    this.setData({ projectIndex: idx >= 0 ? idx : 0 })
  },

  // 加载当前记录详情
  async loadDetail() {
    wx.showLoading({ title: '加载中…' })
    try {
      const res = await wx.cloud.callFunction({ name: 'getReportDetail', data: { id: this.data.id } })
      if (!res.result || !res.result.success) {
        wx.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' })
        return wx.navigateBack()
      }
      const r = res.result.item
      const platformIndex = this.data.platforms.indexOf(r.platform || '其他')
      this.setData({
        name: r.name || '',
        phone: r.phone || '',
        platformIndex: platformIndex >= 0 ? platformIndex : 0,
        orderNo: r.orderNo || '',
        trackingList: (r.trackingList && r.trackingList.length) ? r.trackingList : [''],
        amount: r.amount !== undefined ? String(r.amount) : '',
        remark: r.remark || '',
        images: r.images || [],
        status: r.status || 'pending',
        statusText: util.statusText(r.status),
        reportProjectId: r.projectId || '',
        loading: false
      }, () => {
        this.syncProjectIndex()
      })
    } catch (err) {
      console.error('loadDetail 失败：', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      wx.navigateBack()
    } finally {
      wx.hideLoading()
    }
  },

  onName(e) { this.setData({ name: e.detail.value }) },
  onPhone(e) { this.setData({ phone: e.detail.value }) },
  onPlatform(e) { this.setData({ platformIndex: Number(e.detail.value) }) },
  onProject(e) { this.setData({ projectIndex: Number(e.detail.value) }) },
  onOrderNo(e) { this.setData({ orderNo: e.detail.value }) },
  onAmount(e) { this.setData({ amount: e.detail.value }) },
  onRemark(e) { this.setData({ remark: e.detail.value }) },

  onTrackingInput(e) {
    const idx = e.currentTarget.dataset.idx
    const val = e.detail.value
    if (/[\n,，\s]+/.test(val)) {
      const parts = val.split(/[\n,，\s]+/).map(s => s.trim()).filter(Boolean)
      const list = this.data.trackingList.slice()
      list.splice(idx, 1, ...parts)
      this.setData({ trackingList: list })
      return
    }
    const list = this.data.trackingList.slice()
    list[idx] = val
    this.setData({ trackingList: list })
  },
  addTracking() {
    this.setData({ trackingList: this.data.trackingList.concat('') })
  },
  removeTracking(e) {
    const idx = e.currentTarget.dataset.idx
    let list = this.data.trackingList.slice()
    list.splice(idx, 1)
    if (list.length === 0) list = ['']
    this.setData({ trackingList: list })
  },

  async chooseImage() {
    const remain = 9 - this.data.images.length
    if (remain <= 0) return wx.showToast({ title: '最多 9 张', icon: 'none' })
    if (wx.requirePrivacyAuthorize) {
      try { await wx.requirePrivacyAuthorize() } catch (e) { console.warn('隐私授权未通过', e) }
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = res.tempFiles.map(f => f.tempFilePath)
        this.setData({ images: this.data.images.concat(paths) })
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        console.error('选择图片失败：', msg, err)
        if (msg.indexOf('cancel') >= 0) return  // 用户主动取消，不提示
        let tip = '选择图片失败'
        if (msg.indexOf('scope is not declared') >= 0) {
          tip = '小程序未声明相册权限，需后台完善隐私指引'
        } else if (msg.indexOf('banned') >= 0) {
          tip = '隐私接口被封禁，需后台完善隐私指引'
        } else if (msg.indexOf('deny') >= 0 || msg.indexOf('refuse') >= 0) {
          tip = '未同意隐私协议，请在弹窗中点「同意」'
        } else if (msg) {
          tip = '选择图片失败：' + msg.slice(0, 30)
        }
        wx.showToast({ title: tip, icon: 'none', duration: 3000 })
      }
    })
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.idx
    const images = this.data.images.slice()
    images.splice(idx, 1)
    this.setData({ images })
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({ current: url, urls: this.data.images })
  },

  isCloudPath(p) {
    return typeof p === 'string' && p.startsWith('cloud://')
  },

  async save() {
    const { id, name, phone, amount, platformIndex, platforms, trackingList, hasProjects, projects, projectIndex, images } = this.data
    if (!name.trim()) return wx.showToast({ title: '请填写姓名', icon: 'none' })
    if (!phone.trim()) return wx.showToast({ title: '请填写联系方式', icon: 'none' })
    if (hasProjects && !projects[projectIndex]) return wx.showToast({ title: '请选择项目', icon: 'none' })
    if (!amount || isNaN(Number(amount)) || Number(amount) < 0) {
      return wx.showToast({ title: '请填写正确的金额', icon: 'none' })
    }

    const trackArr = trackingList.map(s => s.trim()).filter(Boolean)
    let projectId = '', projectName = ''
    if (hasProjects && projects[projectIndex]) {
      projectId = projects[projectIndex]._id
      projectName = projects[projectIndex].name
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中…' })

    try {
      // 1) 旧图保留 fileID，新图（临时路径）先上传
      const existingFileIDs = images.filter(p => this.isCloudPath(p))
      const tempPaths = images.filter(p => !this.isCloudPath(p))
      const newFileIDs = []
      for (const p of tempPaths) {
        const m = p.match(/\.(\w+)$/)
        const ext = m ? m[1] : 'png'
        const cloudPath = `reports/${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`
        const up = await wx.cloud.uploadFile({ cloudPath, filePath: p })
        newFileIDs.push(up.fileID)
      }

      // 2) 提交修改
      const res = await wx.cloud.callFunction({
        name: 'updateReport',
        data: {
          id,
          name: name.trim(),
          phone: phone.trim(),
          platform: platforms[platformIndex],
          orderNo: this.data.orderNo.trim(),
          trackingList: trackArr,
          amount: Number(amount),
          images: existingFileIDs.concat(newFileIDs),
          remark: this.data.remark.trim(),
          projectId,
          projectName
        }
      })

      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' })
      }
    } catch (err) {
      console.error('save 异常：', err)
      const msg = (err && err.message) || (err && err.errMsg) || JSON.stringify(err)
      wx.showModal({ title: '保存失败', content: msg.length > 200 ? msg.slice(0, 200) + '…' : msg, showCancel: false })
    } finally {
      wx.hideLoading()
      this.setData({ saving: false })
    }
  }
})
