# local — worktree 根目录

本目录是 git worktree 的组织根目录，不存放具体开发文件。

## 子目录 / 工作树

| 目录 | 分支 | 说明 |
|------|------|------|
| `dmg/` | `dmg` | DMG 分发版本（免费版） |
| `mas/` | `mas` | Mac App Store 分发版本（付费版） |
| `windows/` | `windows` | Windows 分发版本（免费版） |

三个分支均从 `local` 分支分裂而来。dmg 和 windows 为免费开源版本。
