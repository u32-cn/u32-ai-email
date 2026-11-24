# u32-ai-email

**AI-friendly email CLI** — 给 AI 用的邮件收发命令行工具。

```bash
npx u32-ai-email <command>
```

> **⚠️ AI Agent 前置检查（必做）**：在执行任何会收发邮件的任务（尤其是长任务）**之前**，必须先验证邮箱可用性，避免长任务跑完才发现没配置或配置错误导致邮件发不出：
>
> ```bash
> npx u32-ai-email config list   # 是否已有账户配置？
> npx u32-ai-email config test   # SMTP 连接认证是否成功？
> ```
>
> 任一步失败 → **立即停止任务**，先让用户完成邮箱配置（`config add ...` + 邮箱后台开启 SMTP/IMAP 服务并获取授权码），再继续执行。

- 多账户配置（默认账户名 `default`），存于 `~/.u32-ai-email/config.json`
- SMTP 发件（纯文本 / HTML / 附件 / 抄送密送）
- IMAP 收件（list / read / search / fetch，全程只读）
- 所有输出为 JSON，exit code 语义化（0 成功 / 2 失败），方便 AI 解析

## 给 AI 的提示词

把下面这段发给 AI，让它调用本工具发邮件。把 `<xxx@qq.com>` 换成实际收件人；这是一段给 AI 的提示词，不是可直接在终端执行的命令。

```text
请使用 npx u32-ai-email 发邮件至 <xxx@qq.com>
```

## 安装与配置

无需安装，直接 `npx`。首次使用先添加账户：

```bash
npx u32-ai-email config add default --host smtp.88.com --user you@88.com --pass <SMTP授权码> --from-name "AI 助手"
npx u32-ai-email config test          # 验证 SMTP 连接
```

邮箱后台需开启 SMTP/IMAP 服务并获取授权码。IMAP 服务器由 SMTP host 自动推导（`smtp.` → `imap.`，端口 993 SSL）；不同时可加 `--imap-host/--imap-port/--imap-user/--imap-pass` 覆盖。

## 命令

### config — 账户管理

```bash
config add <name> --host H --user U --pass P [--port 465] [--secure true] [--from-name N] [--imap-* ...]
config list                # 列出账户（pass 打码）
config remove <name>       # 删除账户
config default <name>      # 设默认账户
config test [name]         # SMTP 连接验证
```

### send — 发送邮件

```bash
npx u32-ai-email send --to a@b.com,c@d.com --subject "周报" \
  --html-file report.html --attach report.pdf --account work
```

- 正文三选一：`--body`（纯文本）/ `--html`（HTML 字符串）/ `--html-file`（HTML 文件）
- 其余：`--attach`（逗号分隔）、`--cc`、`--bcc`、`--from-name`、`--account`

### 收件（IMAP，只读，不会标记已读/删除/移动）

```bash
npx u32-ai-email list --limit 5                      # 最近邮件（uid/date/from/subject/unread）
npx u32-ai-email read --uid 1234                     # 读单封（正文 + 附件清单）
npx u32-ai-email read --uid 1234 --raw-html          # 输出 HTML 正文
npx u32-ai-email search --from github.com --limit 10 # 搜索（--from/--subject/--since/--before 至少一项）
npx u32-ai-email fetch --uid 1234 --out ./att        # 下载附件
```

收件命令均可带 `--folder INBOX`、`--account NAME`。

## 输出约定

- 所有命令输出 JSON（stderr 传错误）
- exit code：`0` 成功，`1` 用法错误，`2` 网络/认证/发送失败
- 连接与认证超时各 30 秒

## 安全

- 授权码明文存于 `~/.u32-ai-email/config.json`（用户目录，权限随 OS），`config list` 输出打码
- 禁止把授权码写进代码、日志或任何共享文件

## License

MIT
