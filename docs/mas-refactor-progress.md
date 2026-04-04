# DOMPrompter MAS 改造进度

> 最后更新：2026-04-03
> 工作模式：TDD / 基础优先 / 每阶段停靠

## 当前阶段

- Phase 4：MAS 打包验证与签名材料收口

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
- [ ] 验证 `build:mas` 与真实 MAS 签名环境

## Red / Green / Refactor 日志

- Red 2026-04-03：`pnpm install` 在沙箱内因 registry/network 限制失败，已提权重跑。
- Green 2026-04-03：workspace 依赖安装完成，Vitest 基座与 MAS gate 已落地。
- Red 2026-04-03：`npm run mas:check` 初始报 68 个 blocker。
- Green 2026-04-03：Phase 1/2 清理后 builtin-only 合同测试通过，core / app external 面已显著收敛。
- Red 2026-04-03：`npm run dev` 暴露三处真实阻塞。
  `vite` 入口与本地依赖状态不一致。
  Vite 监听 `::1` / `127.0.0.1` 在当前环境需显式修正 host。
  Electron dev 启动时错误依赖 `@visual-inspector/core/dist/index.js`。
- Green 2026-04-03：已通过以下调整修复开发链路。
  删除 `.npmrc` 中 pnpm 专用配置重复项，消除 `npm` 警告来源。
  Vite 固定监听 `127.0.0.1:15173`。
  Electron dev/build 改为直接解析 workspace 内 `@visual-inspector/core` 源码，不再要求预编译 core。
  根目录新增 `test:watch`、`test:app`、`test:core`、对应 watch 命令。
- Red 2026-04-03：新增 “点击 Settings 按钮应打开设置面板” 测试后失败，旧实现只弹 toast。
- Green 2026-04-03：Renderer 已接入 `i18n`、`Settings`、`PaywallDialog`、`LicenseManager`、语言/主题/玻璃度持久化读取与保存。
- Green 2026-04-03：主进程已补齐 `settings:get`、`settings:set`、`menu:changeLanguage`、基础菜单 accelerator 事件、单实例锁、license IPC。
- Green 2026-04-03：`npm run mas:check` 当前为 PASS，evidence 已刷新。
- Green 2026-04-03：主进程已重构为每窗口独立 session，菜单会随 `language` 设置切换中/英文，Dock 菜单已接入。
- Red 2026-04-03：首轮 `npm run build:mas` 失败，发现两个纯配置问题。
  `packages/app/package.json` 缺少 `author`，electron-builder 直接告警。
  `packages/app/package.json` 使用了不受 electron-builder 支持的 `build.masReview` 字段。
- Green 2026-04-03：已将审核元数据迁移到顶层 `masReview`，并补齐 app 包 `author`；`npm run mas:check` 已同步增强，能更早发现这类问题。
- Red 2026-04-03：第二轮 `npm run build:mas` 已通过 TS/Vite/electron-builder schema，但停在 MAS 签名阶段。
  产物存在于 `packages/app/dist/mas-arm64/DOMPrompter.app`，尚未生成最终 `.pkg`。
  `/usr/bin/codesign --verify --deep --strict` 对 app 与 helper/framework 全部报 `invalid signature`.
  `/usr/bin/codesign -d --entitlements :-` 提示 `invalid entitlements blob`.
  bundle 中未发现 `embedded.provisionprofile`，electron-builder 日志也显示 `provisioningProfile=none`。
  构建日志还提示未配置 app icon，当前退回默认 Electron 图标。

## 验证记录

- `npm run dev`
  - 结果：通过
  - 说明：已实际启动到 `http://127.0.0.1:15173/`，Electron 不再因 core dist 缺失崩溃
- `npm run test`
  - 结果：通过
  - 说明：core 13 tests + app 11 tests 全部通过
- `npm run typecheck`
  - 结果：通过
- `npm run mas:check`
  - 结果：通过
  - 说明：evidence 已写入 `reports/mas/evidence-checklist.md`
- `npm run build:mas`
  - 结果：失败
  - 说明：已通过编译与 electron-builder 配置校验，当前阻塞为 MAS 签名阶段的无效签名 / 无效 entitlements blob / 缺少 provisioning profile；未生成最终 `.pkg`

## 阻塞项

- 真实 MAS provisioning profile 尚未接入，当前签名日志显示 `provisioningProfile=none`。
- 当前中间产物 `packages/app/dist/mas-arm64/DOMPrompter.app` 为 invalid signature，需继续排查签名材料与 entitlements 链。
- app icon 仍未配置，builder 当前回退到默认 Electron 图标。
- StoreKit 真实购买链路仍依赖 MAS 环境，本地继续使用 `dev-stub`。

## 下一阶段

- 优先确认可用的 MAS provisioning profile 与签名身份，再继续排查 `invalid entitlements blob` 的签名链问题。
- 补应用图标资源，避免继续使用默认 Electron 图标。
