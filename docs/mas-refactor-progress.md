# DOMPrompter MAS 改造进度

> 最后更新：2026-04-05
> 工作模式：TDD / 基础优先 / 每阶段停靠

## 当前阶段

- Phase 5：App Store Connect 上传与审核提交

## 阶段清单

- [x] 安装 workspace 依赖
- [x] 采集首轮红灯基线
- [x] 补齐根脚本、app/core 测试脚本、Vitest 基座
- [x] 创建 MAS gate 与 evidence checklist
- [x] 新增 builtin-only 合同失败测试
- [x] 删除 external / project-session / CDPClient / discovery 代码路径
- [x] 重新执行测试、类型检查、MAS gate
- [x] 修复 `npm run dev` 启动链路
- [x] 补齐根目录 `test:watch` / `test:app` / `test:core` / watch 脚本
- [x] 接入 renderer i18n、Settings、Paywall、LicenseManager
- [x] 接入主进程 `settings:get/set`、`menu:changeLanguage`、license handlers、基础菜单与单实例
- [x] 补齐菜单本地化、更多快捷键行为、Dock 菜单与多窗口细化
- [x] 验证 `build:mas` 与真实 MAS 签名环境
- [x] 修复 provisioning profile 嵌入（repair-mas-build.mjs 添加 embedProvisioningProfile 步骤）
- [x] 修复 entitlements 中缺失 application-identifier 和 team-identifier
- [x] 分离版本号与构建号（version vs buildVersion）
- [x] 成功上传 pkg 到 App Store Connect
- [ ] TestFlight 测试验证
- [ ] 在 App Store Connect 配置内购产品 `com.domprompter.app.pro.lifetime`
- [ ] 填写 App Store 商品页元数据（截图、描述、关键词）
- [ ] 提交审核

## Red / Green / Refactor 日志

- Red 2026-04-03：`pnpm install` 在沙箱内因 registry/network 限制失败，已提权重跑。
- Green 2026-04-03：workspace 依赖安装完成，Vitest 基座与 MAS gate 已落地。
- Red 2026-04-03：`npm run mas:check` 初始报 68 个 blocker。
- Green 2026-04-03：Phase 1/2 清理后 builtin-only 合同测试通过，core / app external 面已显著收敛。
- Red 2026-04-03：`npm run dev` 暴露三处真实阻塞。
- Green 2026-04-03：已通过以下调整修复开发链路。
- Green 2026-04-03：Renderer 已接入 `i18n`、`Settings`、`PaywallDialog`、`LicenseManager`。
- Green 2026-04-03：主进程已重构为每窗口独立 session，菜单会随 `language` 设置切换。
- Red 2026-04-03：首轮 `npm run build:mas` 失败，签名材料缺失。
- Red 2026-04-05：Transporter 上传报 "missing a provisioning profile"。
  - 原因：`mas.identity: null` 导致 electron-builder 跳过 profile 嵌入，repair 脚本未补偿。
  - 修复：repair-mas-build.mjs 新增 `embedProvisioningProfile()` 步骤。
- Red 2026-04-05：Transporter 上传报 "missing an application identifier"。
  - 原因：entitlements.mas.plist 未声明 `com.apple.application-identifier`。
  - 修复：在 entitlements.mas.plist 添加 `com.apple.application-identifier` 和 `com.apple.developer.team-identifier`。
- Red 2026-04-05：Transporter 上传报 "bundle version must be higher than 0.1.0"。
  - 原因：version 和 buildVersion 未分离，都是 0.1.0。
  - 修复：package.json 新增 `build.buildVersion` 字段，version 保持为营销版本号，buildVersion 独立递增。
- Green 2026-04-05：构建 `0.1.0 (3)` 上传成功，签名验证、provisioning profile、application-identifier 全部通过。

## 验证记录

- `npm run dev` — 通过
- `npm run test` — 通过（core 13 tests + app 11 tests）
- `npm run typecheck` — 通过
- `npm run mas:check` — 通过（Blocking issues: 0）
- `npm run build:mas` — 通过
  - codesign --verify --deep --strict: valid on disk
  - embedded.provisionprofile: 已嵌入
  - application-identifier: 已写入签名
  - pkgutil --check-signature: signed by 3rd Party Mac Developer Installer
- Transporter 上传 — 通过（版本 0.1.0 构建号 3）

## 已解决的阻塞项

- ~~真实 MAS provisioning profile 尚未接入~~ → 已嵌入 `DOMPrompter MAS Distribution` profile
- ~~当前中间产物为 invalid signature~~ → 两阶段签名修复完成
- ~~app icon 仍未配置~~ → 已配置 `public/icon.png`
- ~~entitlements 缺少 application-identifier~~ → 已添加到 entitlements.mas.plist
- ~~版本号与构建号未分离~~ → 使用 build.buildVersion 独立管理

## 下一步

- 在 App Store Connect 完成内购产品配置
- TestFlight 内测验证 IAP 购买流程
- 准备商品页截图和描述文案
- 提交 App Store 审核
