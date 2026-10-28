// 通用工具函数

function formatTime(input) {
  if (!input) return ''
  // 云数据库返回的是 Date 对象或 ISO 字符串，统一处理
  const d = (input instanceof Date) ? input : new Date(input)
  if (isNaN(d.getTime())) return ''
  const pad = n => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function statusText(s) {
  return { pending: '待核对', verified: '已核对', settled: '已结算' }[s] || '待核对'
}

function statusClass(s) {
  return { pending: 'tag-pending', verified: 'tag-verified', settled: 'tag-settled' }[s] || 'tag-pending'
}

function fmtMoney(n) {
  const num = Number(n) || 0
  return num.toFixed(2)
}

// 把记录里的快递单号统一成数组（兼容旧数据：旧字段是字符串 trackingNo）
function normalizeTracking(r) {
  if (!r) return []
  if (Array.isArray(r.trackingList) && r.trackingList.length) {
    return r.trackingList.map(s => (s || '').trim()).filter(Boolean)
  }
  if (r.trackingNo) {
    return String(r.trackingNo).split(/[\/,\n，\s]+/).map(s => s.trim()).filter(Boolean)
  }
  return []
}

// 把多个快递单号连接成字符串（用于导出）
function joinTracking(r, sep) {
  return normalizeTracking(r).join(sep || ' / ')
}

module.exports = { formatTime, statusText, statusClass, fmtMoney, normalizeTracking, joinTracking }
