# Release Workflow — DOMPrompter Community Edition

本文说明如何从源码构建 DMG / Windows 安装包并发布到 GitHub Releases。

---

## 目录结构

```
visual-inspector/
├── local/
│   ├── mas/        分支 mas    — Mac App Store 正式版（付费）
│   ├── dmg/        分支 dmg    — macOS DMG 社区版（免费）
│   └── windows/    分支 windows — Windows NSIS 社区版（免费）
├── github/
│   └── releases/   暂存目录（.gitignore 排除），放置待上传的构建物
└── RELEASING.md    本文件
```

> **社区版与正式版的区别**
> - 社区版去除了 App Store 内购流程，所有功能无需付费解锁
> - 导出提示词不含结构化 JSON；每次会话最多追踪 **1 个元素**、添加 **1 个标签**
> - 超出限制时会提示前往 App Store 下载正式版

---

## 前置要求

| 工具 | 说明 |
|------|------|
| Node.js ≥ 18 | JavaScript 运行时 |
| pnpm 10.x | 包管理器（`npm i -g pnpm`） |
| Python 3 + Pillow | 仅生成图标时需要（`pip install pillow`） |
| Xcode Command Line Tools | macOS 图标生成 + 代码签名（`xcode-select --install`） |
| GitHub CLI (`gh`) | 发布到 GitHub Releases |

---

## 一、准备图标（首次或更换图标时）

图标源文件为 `packages/app/public/icon.png`（需 1024×1024 px）。

```bash
# 进入目标工作树（dmg 或 windows，两者共用相同图标）
cd local/dmg/packages/app

# 生成 macOS .icns
mkdir -p build/icon.iconset
for size in 16 32 64 128 256 512; do
  sips -z $size $size public/icon.png --out build/icon.iconset/icon_${size}x${size}.png
  sips -z $((size*2)) $((size*2)) public/icon.png --out build/icon.iconset/icon_${size}x${size}@2x.png
done
iconutil -c icns build/icon.iconset -o build/icon.icns
rm -rf build/icon.iconset

# 生成 Windows .ico（需要 Python + Pillow）
python3 - <<'EOF'
from PIL import Image
src = "public/icon.png"
out = "build/icon.ico"
img = Image.open(src).convert("RGBA")
sizes = [256, 128, 64, 48, 32, 16]
resized = [img.resize((s, s), Image.LANCZOS) for s in sizes]
resized[0].save(out, format="ICO", append_images=resized[1:])
print(f"icon.ico written ({len(open(out,'rb').read())//1024}KB)")
EOF

# 同步图标到 windows 工作树
cp build/icon.icns ../../windows/packages/app/build/
cp build/icon.ico  ../../windows/packages/app/build/
```

生成的图标需提交到 git（已在各分支 `.gitignore` 添加例外规则）：

```bash
cd local/dmg && git add -f packages/app/build/icon.icns packages/app/build/icon.ico
cd local/windows && git add -f packages/app/build/icon.icns packages/app/build/icon.ico
```

---

## 二、构建 DMG（macOS）

```bash
cd local/dmg

# 安装依赖（首次或 lock 文件更新后）
pnpm install

# 构建
cd packages/app
pnpm run build:dmg
```

产物位于：`local/dmg/packages/app/dist/DOMPrompter-0.1.0-arm64.dmg`

---

## 三、构建 Windows 安装包

> ⚠️ 在 Apple Silicon Mac 上构建的是 arm64 Windows 包（适用于 Windows on ARM）。
> 如需 x64 包，需在 x64 Windows / Linux 机器或 CI 上构建。

```bash
cd local/windows

pnpm install

cd packages/app
pnpm run build:win
```

产物位于：`local/windows/packages/app/dist/DOMPrompter Setup 0.1.0.exe`

---

## 四、整理构建物到暂存目录

```bash
VERSION="v0.1.0"
STAGING="github/releases/$VERSION"
mkdir -p "$STAGING"

cp "local/dmg/packages/app/dist/DOMPrompter-0.1.0-arm64.dmg"   "$STAGING/"
cp "local/windows/packages/app/dist/DOMPrompter Setup 0.1.0.exe" "$STAGING/"
```

`github/releases/` 目录已在 `github/.gitignore` 中排除，不会被提交到 git。

---

## 五、发布到 GitHub Releases

审核构建物后，使用 GitHub CLI 创建 Release 并上传：

```bash
VERSION="v0.1.0"
STAGING="github/releases/$VERSION"

# 在主仓库根目录执行
gh release create "$VERSION" \
  "$STAGING/DOMPrompter-0.1.0-arm64.dmg" \
  "$STAGING/DOMPrompter Setup 0.1.0.exe" \
  --title "DOMPrompter $VERSION — Community Edition" \
  --notes "## DOMPrompter Community Edition $VERSION

### 下载

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | DOMPrompter-0.1.0-arm64.dmg |
| Windows (ARM64) | DOMPrompter Setup 0.1.0.exe |

### 说明

社区版免费开源，欢迎使用与分享。

**功能限制（相比 App Store 正式版）：**
- 每次会话最多追踪 1 个元素
- 最多添加 1 个标签
- 导出提示词不含结构化 JSON

**升级正式版**（无限制）：前往 Mac App Store 搜索 DOMPrompter。"
```

---

## 版本号更新

修改以下两处保持同步：

1. `local/dmg/packages/app/package.json` → `"version"`
2. `local/windows/packages/app/package.json` → `"version"`
3. `local/dmg/packages/app/src/components/Settings.tsx` 中 `version: '0.1.0'` 硬编码值

---

## 常见问题

**Q: 构建时提示 "default Electron icon"**  
A: 确认 `packages/app/build/icon.icns`（macOS）和 `build/icon.ico`（Windows）存在。

**Q: Windows 包签名被跳过**  
A: 社区版不做代码签名，属正常现象。用户安装时 Windows 会弹 SmartScreen 警告，点"仍要运行"即可。

**Q: 如何构建 x64 Windows 包**  
A: 在 `package.json` 的 `win.target` 中将 `nsis` 改为 `{ target: "nsis", arch: ["x64"] }`，在 x64 环境运行 `pnpm run build:win`。
