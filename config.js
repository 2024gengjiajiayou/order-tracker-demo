// ============================================================
// 部署配置（换客户 / 换云环境时只改这个文件）
//   ENV_ID   —— 云开发环境 ID，形如 cloud1-xxxxxxxxxxxx
//   APP_NAME —— 小程序名称，用于转发标题等动态文案
// 注意：小程序 AppID 不在运行时配置里，需改 project.config.json 的 appid；
//       导航栏标题需改 app.json 的 navigationBarTitleText。
// ============================================================
module.exports = {
  // 改成你自己的云开发环境 ID（开发者工具 → 云开发 → 设置 → 环境 ID）
  ENV_ID: 'your-cloud-env-id',
  APP_NAME: '下单统筹助手'
}
