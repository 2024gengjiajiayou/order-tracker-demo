const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    isAdmin: false,
    openid: '',
    list: [],
    persons: [],
    projectStats: [],
    projects: [],
    totalAmount: 0,
    totalCount: 0,
    filterStatus: 'all',
    projectFilter: 'all',
    keyword: '',
    newProjectName: '',
    newAdminOpenid: '',
    newAdminName: '',
    loading: true,
    exporting: false,
    initing: false,
    canInit: false,
    admins: [],
    adminList: [],
    teams: [],
    teamsEnabled: false,
    teamFilter: 'all',
    teamName: '',
    myInviteCode: '',
    owner: '',
    isOwner: false,
    banners: [],
    bannerImage: '',
    bannerLink: '',
    bannerTitle: '',
    loadError: ''
  },

  // 一键运营初始化：建集合、设管理员、建默认项目
  async init() {
    this.setData({ initing: true })
    wx.showLoading({ title: '初始化中…' })
    try {
      const res = await wx.cloud.callFunction({ name: 'initData', data: {} })
      if (res.result && res.result.success) {
        wx.showToast({ title: '初始化完成', icon: 'success' })
        this.load()
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '初始化失败', icon: 'none' })
      }
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '初始化出错，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ initing: false })
    }
  },

  onShow() {
    const openid = app.globalData.openid || wx.getStorageSync('openid') || ''
    this.setData({ openid })
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const [repRes, projRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'getReports',
          data: {
            status: this.data.filterStatus,
            keyword: this.data.keyword,
            projectId: this.data.projectFilter === 'all' ? '' : this.data.projectFilter,
            teamOpenid: this.data.teamFilter
          }
        }),
        wx.cloud.callFunction({ name: 'getProjects', data: { includeDisabled: true } })
      ])

      if (!repRes.result || !repRes.result.isAdmin) {
        // 非管理员：区分“系统尚未初始化（可一键初始化）”与“已有管理员但无权限”
        const canInit = !!(repRes.result && repRes.result.noAdmin)
        this.setData({
          isAdmin: false,
          loading: false,
          canInit,
          loadError: (repRes.result && repRes.result.message) || ''
        })
        if (!canInit) {
          wx.showToast({ title: '仅管理员可进入管理后台', icon: 'none' })
          wx.switchTab({ url: '/pages/index/index' })
        }
        return
      }

      const list = (repRes.result.list || []).map(r => ({
        ...r,
        createdAtText: util.formatTime(r.createdAt),
        statusText: util.statusText(r.status),
        statusClass: util.statusClass(r.status),
        amountText: util.fmtMoney(r.amount),
        trackingListDisp: util.normalizeTracking(r)
      }))

      const projects = (projRes.result && projRes.result.list) || []
      const names = repRes.result.names || {}
      const codes = repRes.result.inviteCodes || {}
      const owner = repRes.result.owner || ''
      const teams = repRes.result.teams || []
      const myTeam = teams.find(t => t.openid === this.data.openid)
      const adminList = (repRes.result.admins || []).map(o => ({
        openid: o,
        name: names[o] || '未命名团队',
        inviteCode: codes[o] || '',
        isOwner: o === owner
      }))

      this.setData({
        isAdmin: true,
        list,
        persons: repRes.result.persons || [],
        projectStats: repRes.result.projectStats || [],
        projects,
        totalAmount: repRes.result.totalAmount || 0,
        totalCount: repRes.result.totalCount || 0,
        admins: repRes.result.admins || [],
        adminList,
        teams: repRes.result.teams || [],
        teamsEnabled: repRes.result.teamsEnabled === true,
        teamName: repRes.result.teamName || (myTeam ? myTeam.name : ''),
        myInviteCode: repRes.result.myInviteCode || (myTeam ? myTeam.inviteCode : ''),
        owner,
        isOwner: repRes.result.isOwner === true || (
          !!owner && owner === this.data.openid
        ),
        loading: false
      }, () => {
        if (this.data.isOwner) this.loadBanners()
      })
    } catch (e) {
      console.error('admin load 失败：', e)
      const raw = (e && (e.errMsg || e.message)) || String(e)
      const msg = /Cloud API isn't enabled|wx\.cloud\.init/i.test(raw)
        ? '云开发未初始化：请检查 app.js 里的 wx.cloud.init 与 config.js 的 ENV_ID'
        : raw
      this.setData({ loading: false, loadError: msg })
      wx.showToast({ title: '加载失败：' + msg.slice(0, 20), icon: 'none' })
    }
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value })
  },

  setFilter(e) {
    this.setData({ filterStatus: e.currentTarget.dataset.s })
    this.load()
  },

  onProjectFilter(e) {
    this.setData({ projectFilter: e.currentTarget.dataset.p })
    this.load()
  },

  onTeamFilter(e) {
    this.setData({ teamFilter: e.currentTarget.dataset.t, projectFilter: 'all' })
    this.load()
  },

  // 修改团队名称：不传 id 时改自己；总管理员传 data-id 可改任意团队
  renameTeam(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const teamOpenid = ds.id || ''
    const currentName = ds.name || this.data.teamName || ''
    wx.showModal({
      title: '修改团队名称',
      editable: true,
      placeholderText: '输入新的团队名称',
      content: currentName,
      success: async (r) => {
        if (!r.confirm) return
        const name = String(r.content || '').trim()
        if (!name) return wx.showToast({ title: '名称不能为空', icon: 'none' })
        wx.showLoading({ title: '保存中…' })
        try {
          const res = await wx.cloud.callFunction({ name: 'renameTeam', data: { name, teamOpenid } })
          wx.hideLoading()
          if (res.result && res.result.success) {
            wx.showToast({ title: '已修改', icon: 'success' })
            this.load()
          } else {
            wx.showToast({ title: (res.result && res.result.message) || '修改失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '修改出错', icon: 'none' })
        }
      }
    })
  },

  migrateTeams() {
    wx.showModal({
      title: '迁移历史数据',
      content: '将为历史项目和记录补齐团队归属（默认归到你名下），并为每个管理员生成邀请码。可重复执行，不会删除数据。',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '迁移中…' })
        try {
          const res = await wx.cloud.callFunction({ name: 'migrateTeams', data: {} })
          wx.hideLoading()
          if (res.result && res.result.success) {
            wx.showModal({
              title: '迁移完成',
              content: (res.result.log || []).join('\n') || '已完成',
              showCancel: false
            })
            this.load()
          } else {
            wx.showToast({ title: (res.result && res.result.message) || '迁移失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '迁移出错', icon: 'none' })
        }
      }
    })
  },

  copyInvite(e) {
    const code = e.currentTarget.dataset.code
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'none' }),
      fail: () => wx.showToast({ title: '复制失败，可长按邀请码复制', icon: 'none' })
    })
  },

  search() {
    this.load()
  },

  // ---- 项目管理（仅管理员） ----
  onNewProjectInput(e) {
    this.setData({ newProjectName: e.detail.value })
  },

  async addProject() {
    const name = this.data.newProjectName.trim()
    if (!name) return wx.showToast({ title: '请输入项目名称', icon: 'none' })
    wx.showLoading({ title: '添加中…' })
    try {
      const res = await wx.cloud.callFunction({ name: 'manageProject', data: { action: 'add', name } })
      if (res.result && res.result.success) {
        wx.showToast({ title: '已添加', icon: 'success' })
        this.setData({ newProjectName: '' })
        this.load()
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '添加失败', icon: 'none' })
      }
    } catch (err) {
      wx.showToast({ title: '添加出错', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async toggleProject(e) {
    const { id, enabled } = e.currentTarget.dataset
    try {
      await wx.cloud.callFunction({ name: 'manageProject', data: { action: 'update', id, enabled: !enabled } })
      this.load()
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  deleteProject(e) {
    const { id } = e.currentTarget.dataset
    wx.showModal({
      title: '删除项目',
      content: '删除后历史报单仍保留该项目名称，但不再出现在成员的选择列表。确定删除？',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await wx.cloud.callFunction({ name: 'manageProject', data: { action: 'delete', id } })
          this.load()
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  async markStatus(e) {
    const { id, s } = e.currentTarget.dataset
    wx.showLoading({ title: '更新中' })
    try {
      await wx.cloud.callFunction({ name: 'updateStatus', data: { id, status: s } })
      wx.showToast({ title: '已更新', icon: 'success' })
      this.load()
    } catch (err) {
      wx.showToast({ title: '更新失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 删除单条记录（本团队管理员 / 总管理员）
  delReport(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除记录',
      content: '删除后不可恢复，关联的截图也会一并清理。确定删除这条上报记录？',
      confirmColor: '#e53e3e',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '删除中…' })
        try {
          const res = await wx.cloud.callFunction({ name: 'deleteReport', data: { id } })
          wx.hideLoading()
          if (res.result && res.result.success) {
            wx.showToast({ title: '已删除', icon: 'success' })
            this.load()
          } else {
            wx.showToast({ title: (res.result && res.result.message) || '删除失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '删除出错', icon: 'none' })
        }
      }
    })
  },

  copyTrack(e) {
    const no = e.currentTarget.dataset.no
    if (!no) return
    wx.setClipboardData({
      data: no,
      fail: () => wx.showToast({ title: '复制失败，可长按单号复制', icon: 'none', duration: 2400 })
    })
  },

  preview(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find(i => i._id === id)
    if (item && item.imageUrls && item.imageUrls.length) {
      wx.previewImage({ current: e.currentTarget.dataset.url, urls: item.imageUrls })
    }
  },

  async exportExcel() {
    this.setData({ exporting: true })
    wx.showLoading({ title: '生成中…' })
    try {
      const res = await wx.cloud.callFunction({ name: 'exportExcel', data: {} })
      if (res.result && res.result.success) {
        const dl = await wx.cloud.downloadFile({ fileID: res.result.fileID })
        await wx.openDocument({ filePath: dl.tempFilePath, showMenu: true })
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '导出失败', icon: 'none' })
      }
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '导出出错', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ exporting: false })
    }
  },

  onNewAdminInput(e) {
    this.setData({ newAdminOpenid: e.detail.value })
  },

  onNewAdminName(e) {
    this.setData({ newAdminName: e.detail.value })
  },

  async addAdmin() {
    if (!this.data.isOwner) {
      return wx.showToast({ title: '仅总管理员可添加管理员', icon: 'none' })
    }
    const openid = this.data.newAdminOpenid.trim()
    if (!openid) return wx.showToast({ title: '请输入 openid', icon: 'none' })
    wx.showLoading({ title: '添加中…' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'addAdmin',
        data: { openid, name: this.data.newAdminName.trim() }
      })
      if (res.result && res.result.success) {
        this.setData({ newAdminOpenid: '', newAdminName: '' })
        this.load()
        wx.showModal({
          title: '已添加团队',
          content: `团队「${res.result.name}」\n邀请码：${res.result.inviteCode}\n\n把邀请码发给成员，成员在上报页输入后即可加入。`,
          showCancel: false,
          confirmText: '知道了'
        })
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '添加失败', icon: 'none' })
      }
    } catch (err) {
      wx.showToast({ title: '添加出错', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  removeAdmin(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const isSelf = id === this.data.openid
    wx.showModal({
      title: '移除管理员',
      content: isSelf
        ? '确定移除自己的管理员身份？移除后将立即失去管理后台权限。'
        : '确定移除该管理员？移除后对方将无法进入管理后台（系统至少保留一名管理员）。',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '处理中…' })
        try {
          const res = await wx.cloud.callFunction({ name: 'removeAdmin', data: { openid: id } })
          if (res.result && res.result.success) {
            wx.hideLoading()
            wx.showToast({ title: '已移除', icon: 'success' })
            if (isSelf) {
              wx.switchTab({ url: '/pages/index/index' })
              return
            }
            this.load()
          } else {
            wx.hideLoading()
            wx.showToast({ title: (res.result && res.result.message) || '移除失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '移除出错', icon: 'none' })
        }
      }
    })
  },

  clearData() {
    const isOwner = this.data.isOwner
    const teamLabel = this.data.teamFilter === 'all' ? '全部团队' : '当前团队'
    wx.showModal({
      title: isOwner ? '清空数据' : '清空本团队数据',
      content: isOwner
        ? `确定清空${teamLabel}的所有上报记录？此操作不可恢复。项目和管理员配置不会删除。`
        : '确定清空本团队的所有上报记录？此操作不可恢复，不会影响其他团队。',
      confirmColor: '#e53e3e',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '清空中…' })
        try {
          const res = await wx.cloud.callFunction({
            name: 'clearData',
            data: { scope: 'reports', teamOpenid: this.data.teamFilter }
          })
          if (res.result && res.result.success) {
            wx.showToast({ title: '已清空', icon: 'success' })
            this.load()
          } else {
            wx.showToast({ title: (res.result && res.result.message) || '清空失败', icon: 'none' })
          }
        } catch (err) {
          wx.showToast({ title: '清空出错', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  // ---- 广告位管理（仅管理员） ----
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

  onBannerImage(e) { this.setData({ bannerImage: e.detail.value }) },
  onBannerLink(e) { this.setData({ bannerLink: e.detail.value }) },
  onBannerTitle(e) { this.setData({ bannerTitle: e.detail.value }) },

  addBanner() {
    const image = this.data.bannerImage.trim()
    if (!image) return wx.showToast({ title: '请输入图片链接', icon: 'none' })
    const banners = this.data.banners.concat({
      image,
      link: this.data.bannerLink.trim(),
      title: this.data.bannerTitle.trim()
    })
    this.setData({ banners, bannerImage: '', bannerLink: '', bannerTitle: '' })
  },

  removeBanner(e) {
    const idx = e.currentTarget.dataset.idx
    const banners = this.data.banners.slice()
    banners.splice(idx, 1)
    this.setData({ banners })
  },

  async saveBanners() {
    wx.showLoading({ title: '保存中…' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'saveBanners',
        data: { banners: this.data.banners }
      })
      if (res.result && res.result.success) {
        wx.showToast({ title: '已保存', icon: 'success' })
        this.setData({ banners: res.result.banners || this.data.banners })
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' })
      }
    } catch (err) {
      wx.showToast({ title: '保存出错', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  copyOpenid() {
    if (!this.data.openid) return
    wx.setClipboardData({
      data: this.data.openid,
      fail: () => wx.showToast({ title: '复制失败，可长按文字手动复制', icon: 'none', duration: 2800 })
    })
  }
})
