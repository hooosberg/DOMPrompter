# DOMPrompter MAS 构建与上传指南

> 最后更新：2026-04-06（Build 17 成功启动）

## 踩坑总结（必读）

本项目经过 17 次构建迭代才成功在 TestFlight 上启动。以下是关键教训：

### 1. 证书与 Provisioning Profile 必须匹配

**这是最关键的一点。** Provisioning Profile 中嵌入了一个具体的签名证书，app 必须用**同一个证书**签名，否则：
- Transporter 报 `Invalid Code Signing (409)` 上传失败
- 即使上传成功，TestFlight 安装后也会闪退

| 情况 | 结果 |
|------|------|
| Profile 包含 `3rd Party Mac Developer Application`，app 用 `Apple Distribution` 签名 | Transporter 验证失败 |
| Profile 包含 `Apple Distribution`，app 用 `Apple Distribution` 签名 | 成功 |

**当前使用的证书组合：**
- 应用签名：`Apple Distribution: hu Huambo (STWPBZG6S7)`
- PKG 签名：`3rd Party Mac Developer Installer: hu Huambo (STWPBZG6S7)` (SHA1: `C5EE5BE0EC389E19AC9A5C33EC4FAF00FE9BE8FE`)
- Provisioning Profile：包含 `Apple Distribution` 证书

### 2. 不要用自定义 repair 脚本重签

早期使用 `repair-mas-build.mjs` 手动重签 Electron Framework 导致签名结构被破坏，app 启动时 Chromium 内部 CHECK() 断言失败（EXC_BREAKPOINT/SIGTRAP）。

**正确做法：完全依赖 electron-builder 原生签名。**

### 3. 不要在 build 输出目录保留 .app

macOS Launch Services 会注册 build 目录中的 `.app`，TestFlight 安装后可能启动这个未经沙盒配置的副本而非正确安装的版本，导致闪退。

### 4. Electron 版本

Electron 28.3.3（Chromium 120）验证可用。MAS 沙盒下只需 `app.disableHardwareAcceleration()`，无需额外 Chromium flags。

### 5. Entitlements 精简

子进程 entitlements 只需 `app-sandbox` + `inherit`，**不要**添加 `allow-jit`、`allow-unsigned-executable-memory`、`disable-library-validation` 等额外权限。

### 6. 钥匙串中避免同类型重复证书

如果钥匙串中存在多个同类型证书（如两个 `3rd Party Mac Developer Installer`），electron-builder 无法自动选择，会报错。用 `pkg.identity` 指定 SHA1 或删除旧证书。

---

## 前置条件

### 1. Apple Developer 证书

在 Keychain Access 中确认已安装：

| 证书类型 | 用途 | 检查命令 |
|----------|------|----------|
| `Apple Distribution: hu Huambo (STWPBZG6S7)` | 签名 .app | `security find-identity -v -p codesigning \| grep "Apple Distribution"` |
| `3rd Party Mac Developer Installer: hu Huambo (STWPBZG6S7)` | 签名 .pkg | `security find-identity -v \| grep "Installer"` |

**注意：** 同类型证书只保留一个。如果有多个 Installer 证书，在钥匙串中删除旧的。

### 2. Provisioning Profile

从 [Apple Developer - Profiles](https://developer.apple.com/account/resources/profiles/list) 创建：

1. 类型：**Mac App Store Connect**（Distribution）
2. App ID：**com.domprompter.app**
3. **证书选择 `Apple Distribution`**（不是 3rd Party Mac Developer Application）
4. 下载后放置到 `packages/app/build/embedded.provisionprofile`

验证 profile 中的证书：
```bash
security cms -D -i packages/app/build/embedded.provisionprofile > /tmp/p.plist
python3 -c 'import plistlib,subprocess;p=plistlib.load(open("/tmp/p.plist","rb"));[print(subprocess.run(["openssl","x509","-inform","DER","-noout","-subject"],input=c,capture_output=True).stdout.decode().strip()) for c in p["DeveloperCertificates"]]'
```

应输出：`CN=Apple Distribution: hu Huambo (STWPBZG6S7)`

### 3. App Store Connect

- Bundle ID：`com.domprompter.app`
- 平台：**macOS**（不是 iOS）
- 内购产品 ID：`com.domprompter.app.pro.lifetime`

---

## 版本号管理

| 字段 | Info.plist | 何时递增 |
|------|-----------|----------|
| `version` | CFBundleShortVersionString | 发布新版本 |
| `build.buildVersion` | CFBundleVersion | 每次上传 |

```json
{
  "version": "0.1.0",
  "build": { "buildVersion": "17" }
}
```

---

## 构建流程

### 一键构建

```bash
cd packages/app
pnpm build:mas
```

执行步骤：`tsc` → `vite build` → `electron-builder --mac mas`

electron-builder 自动完成：打包 → 签名 .app → 嵌入 profile → 生成并签名 .pkg

### 构建产物

```
release/mas-arm64/
├── DOMPrompter.app                    # 签名后的 .app
└── DOMPrompter-{version}-arm64.pkg    # 签名后的 .pkg（上传用）
```

### 构建前清理（如果上次构建残留）

签名后的 .app 有系统保护标志，需要 sudo 删除：
```bash
sudo rm -rf release/mas-arm64
```

---

## 构建验证

```bash
# 验证 app 签名证书（应为 Apple Distribution）
codesign -d -vvv release/mas-arm64/DOMPrompter.app 2>&1 | grep "Authority="

# 验证签名完整性
codesign --verify --deep --strict release/mas-arm64/DOMPrompter.app

# 验证 pkg 签名（应为 3rd Party Mac Developer Installer）
pkgutil --check-signature release/mas-arm64/DOMPrompter-0.1.0-arm64.pkg

# 验证 Info.plist
plutil -p release/mas-arm64/DOMPrompter.app/Contents/Info.plist | grep -E "CFBundleVersion|LSRequiresNative"
```

---

## 上传到 App Store Connect

1. 打开 **Transporter.app**
2. 拖入 `release/mas-arm64/DOMPrompter-{version}-arm64.pkg`
3. 点击「交付」
4. 等待 App Store Connect 处理（约 5-15 分钟）
5. 在 TestFlight 中测试

**上传前**：确保 build 目录中的 `.app` 不会干扰 TestFlight。如果遇到启动问题，删除 `release/mas-arm64/DOMPrompter.app`，只保留 `.pkg`。

---

## package.json 关键配置

```json
{
  "build": {
    "mac": {
      "identity": "hu Huambo (STWPBZG6S7)",
      "provisioningProfile": "build/embedded.provisionprofile"
    },
    "mas": {
      "type": "distribution",
      "identity": "hu Huambo (STWPBZG6S7)",
      "entitlements": "build/entitlements.mas.plist",
      "entitlementsInherit": "build/entitlements.mas.inherit.plist",
      "provisioningProfile": "build/embedded.provisionprofile",
      "hardenedRuntime": false,
      "gatekeeperAssess": false
    },
    "pkg": {
      "identity": "C5EE5BE0EC389E19AC9A5C33EC4FAF00FE9BE8FE"
    }
  }
}
```

**`pkg.identity` 用 SHA1 指定**：当钥匙串中有多个同名 Installer 证书时必须。查找 SHA1：
```bash
security find-identity -v | grep "Installer"
```

---

## Entitlements 配置

### 主应用 (`entitlements.mas.plist`)

```xml
<key>com.apple.application-identifier</key>
<string>STWPBZG6S7.com.domprompter.app</string>
<key>com.apple.developer.team-identifier</key>
<string>STWPBZG6S7</string>
<key>com.apple.security.app-sandbox</key>
<true/>
<key>com.apple.security.network.client</key>
<true/>
<key>com.apple.security.files.user-selected.read-only</key>
<true/>
```

### 子进程 (`entitlements.mas.inherit.plist`)

**只需两项，不要添加额外权限：**
```xml
<key>com.apple.security.app-sandbox</key>
<true/>
<key>com.apple.security.inherit</key>
<true/>
```

---

## main.ts MAS 配置

Electron 28 在 MAS 沙盒下只需一行：

```typescript
if (process.mas) {
  app.disableHardwareAcceleration()
}
```

不需要 `disable-features`、`disable-async-dns`、`no-proxy-server` 等 Chromium flags。

---

## 关键文件索引

| 文件 | 用途 |
|------|------|
| `packages/app/package.json` | 版本号、electron-builder 配置 |
| `packages/app/build/entitlements.mas.plist` | 主应用 entitlements |
| `packages/app/build/entitlements.mas.inherit.plist` | 子进程 entitlements（精简版） |
| `packages/app/build/embedded.provisionprofile` | MAS Distribution profile（含 Apple Distribution 证书）|
| `packages/app/electron/main.ts` | `process.mas` 条件处理 |
| `packages/app/electron/licenseService.ts` | StoreKit IAP 实现 |

---

## 常见错误与解决

### Transporter: "Invalid Code Signing" (409)

**原因**：app 签名证书与 provisioning profile 中的证书不匹配。

**解决**：
1. 确认 profile 中嵌入的证书类型（用上面的 python 命令检查）
2. 确保 `identity` 配置匹配同一个证书
3. 如果 profile 包含 `3rd Party Mac Developer Application` 但 electron-builder 选了 `Apple Distribution`，需要重新创建 profile 选择 `Apple Distribution` 证书

### TestFlight 闪退 (EXC_BREAKPOINT/SIGTRAP)

**排查顺序**：
1. **证书匹配**：签名证书必须与 profile 中的证书一致
2. **签名方式**：必须用 electron-builder 原生签名，不要用自定义脚本重签
3. **子进程 entitlements**：只保留 `app-sandbox` + `inherit`
4. **Launch Services 冲突**：删除 build 目录中的 `.app`，确保 TestFlight 启动正确的安装版本
5. **Electron 版本**：Electron 28.3.3 验证可用

### electron-builder: "Cannot find valid 3rd Party Mac Developer Installer"

**原因**：钥匙串中有多个同名 Installer 证书。

**解决**：
- 在钥匙串中删除旧的 Installer 证书，只保留一个
- 或在 `pkg.identity` 中指定 SHA1

### 构建时 "permission denied" / "ENOTEMPTY"

```bash
sudo rm -rf release/mas-arm64
```

### 构建后清理 build 目录的 .app

TestFlight 测试前删除 build 目录的 .app，避免 Launch Services 冲突：
```bash
rm -rf release/mas-arm64/DOMPrompter.app
```
