# 下单统筹助手

一个跑在**微信云开发**上的团队订单上报与对账小程序。

成员用邀请码加入团队，按项目提交订单（支持一次粘贴多个快递单号自动拆分、上传截图）；管理员在后台看本团队的汇总金额与单量、改状态、导出 Excel；总管理员可以管理多个团队。

**English** — A WeChat mini-program template for team purchase-order reporting and reconciliation, built on WeChat CloudBase (serverless). Members join a team with an invite code and submit orders; admins get team-scoped statistics, status tracking and Excel export. Native mini-program front end + 21 Node.js cloud functions, no build step.

---

## 一、它解决什么问题

一群人分散在各个平台下单，负责人需要把订单收拢起来对账。用群聊或在线表格会遇到：

- 信息散在聊天记录里，事后无法按人、按项目统计；
- 一个订单拆成多个快递，单号混在一句话里，对账要人工拆；
- 截图和订单信息分离，核对时两头翻；
- 多个管理员各带一队人，汇总却混在一起，分不清归属。

本项目的做法：成员按项目报单，管理员看汇总；**每个管理员就是一个独立团队**，数据互不可见。

---

## 二、功能

| 角色 | 能做什么 |
| --- | --- |
| **成员** | 用 6 位邀请码加入团队 · 选本团队项目提交订单 · 一次粘贴多个单号自动拆分 · 上传截图 · 查看「我的记录」· 待核对状态下修改 |
| **管理员** | 只看本团队数据 · 按状态筛选 · 按姓名搜索 · 标记「待核对 / 已核对 / 已结算」· 删除单条记录 · 导出 Excel · 维护本团队项目 · 改团队名 · 清空本团队数据 |
| **总管理员** | 添加 / 移除管理员（每人即一个团队）· 切换查看任意团队 · 改任意团队名称 · 配置首页轮播广告位 |

其他：

- 首页、上报页、我的记录页支持**转发**与**分享到朋友圈**；
- 首次进入自动初始化：建集合、设首个管理员为总管理员、建默认项目、生成邀请码；
- 全部权限判断在云函数里完成，不信任客户端传入的身份字段。

---

## 三、页面

| 页面 | 路径 | 说明 |
| --- | --- | --- |
| 首页 | `pages/index` | 轮播广告、功能入口、身份标识 |
| 上报 | `pages/submit` | 加入团队、选项目、填单号与金额、传截图 |
| 我的记录 | `pages/myList` | 自己提交的记录与状态 |
| 记录详情 | `pages/detail` | 单条记录完整信息 |
| 编辑 | `pages/edit` | 待核对状态下修改 |
| 管理后台 | `pages/admin` | 汇总、筛选、项目管理、团队管理、导出 |

---

## 四、技术栈

- **前端**：原生微信小程序，无框架、无 npm 依赖、无构建步骤
- **后端**：微信云开发云函数（Node.js），共 21 个，统一依赖 `wx-server-sdk`
- **数据库**：云开发文档型数据库（`reports` / `projects` / `members` / `config`）
- **存储**：云开发云存储（订单截图、导出的 Excel）
- **导出**：`node-xlsx` 在云函数里生成表格，上传云存储后返回临时链接

---

## 五、目录结构

```
.
├── app.js                  # wx.cloud.init + 全局配置
├── app.json                # 页面与 tabBar
├── app.wxss                # 全局样式
├── config.js               # 部署配置：ENV_ID / APP_NAME
├── project.config.json     # AppID、云函数根目录
├── sitemap.json
├── pages/
│   ├── index/              # 首页
│   ├── submit/             # 上报
│   ├── myList/             # 我的记录
│   ├── detail/             # 详情
│   ├── edit/               # 编辑
│   └── admin/              # 管理后台
├── utils/
│   └── util.js             # 时间 / 金额格式化、状态映射
├── cloudfunctions/         # 21 个云函数，每个含 index.js + package.json
├── 客户部署手册.md          # 从零部署的完整步骤
└── 部署说明.md              # 手工建集合等补充说明
```

---

## 六、快速开始

### 1. 准备

- 注册小程序，拿到 **AppID**（mp.weixin.qq.com → 开发管理 → 开发设置）
- 在微信开发者工具里开通**云开发**，记下环境 ID（形如 `cloud1-xxxxxxxxxxxx`）

### 2. 导入并改三处配置

用微信开发者工具「导入项目」选中本目录，然后修改：

| 文件 | 改什么 |
| --- | --- |
| `project.config.json` | `appid` 改成你的 AppID |
| `config.js` | `ENV_ID` 改成你的云环境 ID |
| `app.json` | `window.navigationBarTitleText` 改成你要的名字 |

### 3. 部署云函数

开发者工具里右键 `cloudfunctions` 目录 →「上传并部署：云端安装依赖」。

也可以命令行一次性部署：

```bash
cli cloud functions deploy --env <你的环境ID> \
  --names addAdmin clearData deleteReport exportExcel getBanners getMyReports getMyTeam \
  getOpenid getProjects getReportDetail getReports initData joinTeam manageProject \
  migrateTeams removeAdmin renameTeam saveBanners submitReport updateReport updateStatus \
  --project . -r
```

> 缺任何一个云函数都会导致对应功能报错，务必全部部署。

### 4. 初始化

编译预览，用**负责人本人的微信**打开 → 管理后台 →「一键初始化」。

会创建 `reports` / `projects` / `members` / `config` 四个集合，把当前用户设为管理员兼总管理员，建一个默认项目，并生成团队邀请码。

### 5. 真机测试前必做

mp 后台 → 设置 → 基本设置 → 服务内容声明 → **用户隐私保护指引**，勾选：

- 相册（选图）
- 摄像头
- 剪贴板（复制）

不配置的话，真机上上传截图、复制单号会被平台静默禁用，表现是「点了没反应」。

更详细的图文步骤见 [客户部署手册.md](./客户部署手册.md)。

---

## 七、数据模型

| 集合 | 关键字段 |
| --- | --- |
| `reports` | `openid`、姓名、联系方式、`platform`、`orderNo`、`trackingList[]`、`projectId/Name`、`teamOpenid`、`teamName`、`amount`、`images[]`、`status`、`createdAt` |
| `projects` | `name`、`enabled`、`ownerOpenid`（所属团队）、`ownerName`、`createdAt` |
| `members` | `_id` = 用户 openid、`teamOpenid`、`joinedAt` |
| `config` | `_id = admin`：`openids[]`、`owner`、`names{}`、`inviteCodes{}`、`teamsEnabled`；`_id = settings`：`banners[]` |

`status` 取值：`pending`（待核对）/ `verified`（已核对）/ `settled`（已结算）。

---

## 八、权限模型

| 操作 | 成员 | 管理员 | 总管理员 |
| --- | :-: | :-: | :-: |
| 提交上报 | ✓ | ✓ | ✓ |
| 查看 / 修改自己的记录（仅待核对可改） | ✓ | ✓ | ✓ |
| 邀请码加入团队 | ✓ | | |
| 本团队记录查看、改状态、删单条、导出、管项目、改名、清数据 | | ✓ | ✓ |
| 查看其他团队数据 / 切换团队 | | | ✓ |
| 添加 / 移除管理员、配置首页广告位 | | | ✓ |
| 被移除 | ✓ | ✓ | 不可移除 |

管理员名单不能删空，否则系统回到「无管理员」状态，任何人都能通过「一键初始化」提权。

---

## 九、云函数清单

| 云函数 | 权限 | 说明 |
| --- | --- | --- |
| `getOpenid` | 公开 | 返回调用者 openid |
| `getProjects` | 公开 | 按团队返回启用中的项目 |
| `getBanners` | 公开 | 读首页轮播配置 |
| `getMyTeam` | 登录 | 返回当前用户所属团队 |
| `joinTeam` | 登录 | 校验 6 位邀请码并绑定团队 |
| `submitReport` | 登录 | 提交记录，集合不存在时自动创建 |
| `getMyReports` | 本人 | 服务端按 openid 过滤 |
| `getReportDetail` | 本人 / 本团队管理员 | 取单条记录 |
| `updateReport` | 本人（仅待核对）/ 本团队管理员 | 修改已上报内容 |
| `getReports` | 管理员 | 团队隔离的记录 + 汇总统计 |
| `updateStatus` | 管理员 | 改状态，限本团队 |
| `deleteReport` | 本团队管理员 / 总管理员 | 删除单条，连带清理截图 |
| `exportExcel` | 管理员 | 生成 Excel 并返回下载链接 |
| `manageProject` | 管理员 | 项目增 / 改名 / 启停 / 删 |
| `renameTeam` | 管理员 | 改团队名并同步历史冗余字段 |
| `saveBanners` | 总管理员 | 写首页轮播配置 |
| `clearData` | 管理员 | 分批清空，普通管理员只清本团队 |
| `initData` | 仅系统无管理员时 | 建集合、设首个管理员、生成邀请码 |
| `addAdmin` | 总管理员 | 添加管理员（新建团队） |
| `removeAdmin` | 总管理员 | 移除管理员，总管理员不可移除 |
| `migrateTeams` | 总管理员 | 一次性迁移历史数据到团队模型 |

---

## 十、团队隔离是怎么生效的

1. `config/admin.openids` 存管理员列表，**每个管理员就是一个团队**，团队身份即其 openid；
2. 成员输入邀请码后，`joinTeam` 写入 `members`（`_id` = 成员 openid，`teamOpenid` = 团队管理员 openid）；
3. 提交记录时，`submitReport` 按所选项目反查归属团队，写入 `teamOpenid` / `teamName`；
4. 管理员查询时，`getReports` 用 `teamOpenid` 过滤；总管理员可传 `team` 参数切换；
5. `teamsEnabled` 是兼容开关：未开启时走旧的全员共享逻辑，只有 `initData` 和 `migrateTeams` 能置为 `true`。

> 升级既有部署时顺序很重要：**先发布新版前端，再点「一键启用团队功能」**。反过来的话，旧版用户会暂时上报失败。

---

## 十一、常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 后台显示「暂无权限」，但明明是管理员 | 检查 `config.js` 的 `ENV_ID` 是否正确、`app.js` 里是否用了 `config.ENV_ID` |
| 点转发没反应 | 页面必须定义 `onShareAppMessage`；本项目已在首页/上报/我的记录实现 |
| 真机上传截图、复制没反应 | 未配置《用户隐私保护指引》，见「快速开始 · 第 5 步」 |
| 上报报「集合不存在」 | 首次部署未建集合；`submitReport` 会自动建并重试，也可手动在控制台建 |
| 新云函数部署报「Creating 状态」 | 云端异步建函数，等 25–30 秒重试 |
| 命令行上传报 `code: 10 需要重新登录` | 开发者工具登录态失效，`cli quit` 后重连 |

---

## 十二、已知限制

- 单次查询上限 1000 条（`MAX_FETCH`），超大团队需改分页或按时间范围查询；
- 数据量大时，`where` + `orderBy` 需要建索引；
- 团队改名要同步历史记录，记录很多时分批执行，耗时较长；
- 成员绑定团队后不能自行换队（需管理员处理 `members`）。

---

## 十三、授权与商用

本仓库以模板形式公开，供学习、评估与二次开发参考。

如需用于商业项目、对外销售或交付给客户，请先取得作者授权。

---

## 十四、变更记录

- **2026-10**：团队隔离（管理员 = 团队、邀请码加入）、团队改名、删除单条记录、管理设置与广告位收归总管理员、修复云开发初始化与转发。
