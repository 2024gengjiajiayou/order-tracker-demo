const app = getApp()

Page({
  data: {
    name: '',
    phone: '',
    platforms: ['淘宝', '京东', '拼多多', '抖音', '微信小店', '其他'],
    platformIndex: 0,
    projects: [],
    projectIndex: 0,
    hasProjects: false,
    teamName: '',
    needJoin: false,
    joinCode: '',
    joining: false,
    orderNo: '',
    trackingList: [''],
    amount: '',
    remark: '',
    images: [],          // 本地临时路径
    submitting: false
  },

  onLoad() {
    // 记住上次填过的姓名/联系方式，减少重复输入
    const info = wx.getStorageSync('memberInfo')
    if (info) {
      this.setData({ name: info.name || '', phone: info.phone || '' })
    }
    this.loadProjects()
  },

  onShow() {
    // 每次切回上报页都刷新团队与项目列表，管理员新增项目后成员无需重启小程序
    this.refresh()
    try {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline'],
        fail: () => {}
      })
    } catch (e) {}
  },

  async refresh() {
    await this.loadTeam()
    if (!this.data.needJoin) await this.loadProjects()
  },

  // 读取当前用户所属团队（没有团队时需要先输入邀请码加入）
  async loadTeam() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getMyTeam', data: {} })
      const r = res.result || {}
      this.setData({
        teamName: r.teamName || '',
        needJoin: r.needJoin === true
      })
      if (r.needJoin) {
        this.setData({ projects: [], hasProjects: false })
      }
    } catch (e) {
      console.error('loadTeam 失败：', e)
    }
  },

  onJoinCode(e) {
    this.setData({ joinCode: e.detail.value })
  },

  async joinTeam() {
    const code = (this.data.joinCode || '').trim()
    if (!code) return wx.showToast({ title: '请输入邀请码', icon: 'none' })
    this.setData({ joining: true })
    wx.showLoading({ title: '加入中…' })
    try {
      const res = await wx.cloud.callFunction({ name: 'joinTeam', data: { code } })
      if (res.result && res.result.success) {
        wx.showToast({ title: '已加入 ' + (res.result.teamName || '团队'), icon: 'none' })
        this.setData({ joinCode: '', joining: false })
        await this.refresh()
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '加入失败', icon: 'none' })
      }
    } catch (e) {
      console.error('joinTeam 失败：', e)
      wx.showToast({ title: '加入出错，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ joining: false })
    }
  },

  // 拉取本团队、启用中的项目
  async loadProjects() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getProjects', data: {} })
      const r = res.result || {}
      const list = r.list || []
      this.setData({
        projects: list,
        hasProjects: list.length > 0,
        projectIndex: 0,
        teamName: r.teamName || this.data.teamName,
        needJoin: r.needJoin === true
      })
    } catch (e) {
      console.error('loadProjects 失败：', e)
      wx.showToast({ title: '项目列表加载失败', icon: 'none' })
    }
  },

  onName(e) { this.setData({ name: e.detail.value }) },
  onPhone(e) { this.setData({ phone: e.detail.value }) },
  onPlatform(e) { this.setData({ platformIndex: Number(e.detail.value) }) },
  onProject(e) { this.setData({ projectIndex: Number(e.detail.value) }) },
  onOrderNo(e) { this.setData({ orderNo: e.detail.value }) },
  onAmount(e) { this.setData({ amount: e.detail.value }) },
  onRemark(e) { this.setData({ remark: e.detail.value }) },

  // 快递单号：逐项输入；一次粘贴多个（换行/逗号/空格）自动拆成多行
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
    // 真机（体验版/正式版）调用相册/摄像头前需先通过用户隐私授权
    if (wx.requirePrivacyAuthorize) {
      try { await wx.requirePrivacyAuthorize() } catch (e) { console.warn('隐私授权未通过', e) }
    }
    wx.chooseMedia({
      count: 9,
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

  async submit() {
    const { name, phone, amount, images, platformIndex, platforms, trackingList, hasProjects, projects, projectIndex, needJoin } = this.data
    if (needJoin) return wx.showToast({ title: '请先输入邀请码加入团队', icon: 'none' })
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

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中…' })

    try {
      // 1) 先上传截图到云存储
      const fileIDs = []
      for (const p of images) {
        const m = p.match(/\.(\w+)$/)
        const ext = m ? m[1] : 'png'
        const cloudPath = `reports/${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`
        const up = await wx.cloud.uploadFile({ cloudPath, filePath: p })
        fileIDs.push(up.fileID)
      }

      // 2) 再保存记录
      const res = await wx.cloud.callFunction({
        name: 'submitReport',
        data: {
          name: name.trim(),
          phone: phone.trim(),
          platform: platforms[platformIndex],
          orderNo: this.data.orderNo.trim(),
          trackingList: trackArr,
          amount: Number(amount),
          images: fileIDs,
          remark: this.data.remark.trim(),
          projectId,
          projectName
        }
      })

      if (res.result && res.result.success) {
        wx.setStorageSync('memberInfo', { name: name.trim(), phone: phone.trim() })
        wx.showToast({ title: '上报成功', icon: 'success' })
        this.setData({ orderNo: '', trackingList: [''], amount: '', remark: '', images: [] })
        setTimeout(() => wx.switchTab({ url: '/pages/myList/myList' }), 800)
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '提交失败', icon: 'none' })
      }
    } catch (err) {
      console.error('submit 异常：', err)
      const msg = (err && err.message) || (err && err.errMsg) || JSON.stringify(err)
      wx.showModal({
        title: '提交失败',
        content: msg.length > 200 ? msg.slice(0, 200) + '…' : msg,
        showCancel: false
      })
    } finally {
      wx.hideLoading()
      this.setData({ submitting: false })
    }
  },

  onShareAppMessage() {
    const name = app.globalData.appName || '下单统筹助手'
    return {
      title: `${name} · 来上报你的订单`,
      path: '/pages/submit/submit'
    }
  },

  onShareTimeline() {
    const name = app.globalData.appName || '下单统筹助手'
    return {
      title: `${name} · 群购订单上报与对账`
    }
  }
})
