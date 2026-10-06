# i18n Reference Table

Base locale: `zh`
Secondary locale: `en`

| Key | Source | Secondary |
| --- | --- | --- |
| `about.copyright` | © 2025 hooosberg. 保留所有权利。 | © 2025 hooosberg. All rights reserved. |
| `about.descFeatures` | 精确元素选择与 CSS 选择器 • 样式差异追踪（修改前/后）• 自然语言标签注释 • 即时可视反馈与撤销/重做 • 适配 Cursor、Claude Code、Codex、Copilot 等 | Precise element selection with CSS selectors • Style diff tracking (before/after) • Natural language tags • Instant visual feedback with undo/redo • Works with Cursor, Claude Code, Codex, Copilot and more |
| `about.descPrivacy` | 本地优先，完全隐私。所有检查与提示词生成均在你的 Mac 上本地完成。 | Local-first, complete privacy. All inspection and prompt generation happens locally on your Mac. |
| `about.description` | 用可视化的方式告诉 AI 你要改什么。DOMPrompter 让你直接在页面上选中元素、微调 CSS 参数、添加文字注释，自动生成结构化的 AI 提示词。 | Show AI exactly what you want to change. DOMPrompter lets you select elements directly on the page, visually adjust CSS parameters, add text annotations, and auto-generate structured AI prompts. |
| `about.github` | GitHub | GitHub |
| `about.privacy` | 隐私政策 | Privacy Policy |
| `about.support` | 支持中心 | Support |
| `about.terms` | 服务条款 | Terms of Service |
| `about.version` | 版本 {{version}} | Version {{version}} |
| `about.website` | 官网 | Website |
| `app.name` | DOMPrompter | DOMPrompter |
| `app.tagline` | 可视化微调 UI，为 Vibe Coding 生成精准提示词 | Visually tune your UI, generate precise prompts for Vibe Coding |
| `common.collapse` | 收起 | Collapse |
| `common.copied` | 已复制 | Copied |
| `common.copy` | 复制 | Copy |
| `common.expand` | 展开 | Expand |
| `common.tip` | 提示 | Tip |
| `license.benefitDiff` | 样式差异追踪（修改前/后） | Style diff tracking (before/after) |
| `license.benefitExport` | 无限页面提示词导出 | Unlimited page prompt export |
| `license.benefitFuture` | 包含所有未来 Pro 功能 | All future Pro features included |
| `license.benefitTags` | 自然语言标签与注释 | Natural language tags & annotations |
| `license.ctaNote` | 一次付费，无订阅。Pro 功能永久解锁。 | One-time payment. No subscription. Pro features stay unlocked permanently. |
| `license.processing` | 处理中... | Processing... |
| `license.promoDesc` | 充分发挥可视化检查工作流的潜力。导出整页提示词、追踪每次样式变化、使用自然语言注释。 | Get the most out of your visual inspection workflow. Export full-page prompts, track every style change, and annotate with natural language. |
| `license.promoTitle` | 解锁 DOMPrompter Pro | Unlock DOMPrompter Pro |
| `license.proThanks` | 感谢支持 DOMPrompter！所有 Pro 功能已解锁。一次购买即可享有我们未来添加的每项 Pro 功能。 | Thank you for supporting DOMPrompter! All Pro features are unlocked. Your one-time purchase covers every future Pro feature we add. |
| `license.purchase` | 购买 Pro | Purchase Pro |
| `license.restore` | 恢复购买 | Restore Purchase |
| `license.upgradeCta` | 升级到 Pro — $19.99 | Upgrade to Pro — $19.99 |
| `onboarding.aiPrompt` | 复制 AI 适配提示词 | Copy AI setup prompt |
| `onboarding.aiPromptDesc` | 这份提示词只关注网页项目启动、统一地址，并要求 AI 自己完成启动验证。 | This prompt only focuses on starting the web app, unifying the URL, and requiring the assistant to verify it. |
| `onboarding.aiSetupPrompt` | 我正在使用 DOMPrompter 调试一个网页项目。请帮我把项目的启动脚本适配到 DOMPrompter 的默认调试地址，让我不需要再手动复制粘贴地址，直接点击加载即可开始调试。<br><br>请先判断我的项目属于哪种网页项目（React / Vue / Svelte / Next.js / 纯 HTML / 其他前端项目），然后只围绕“网页能在浏览器里启动”这件事修改。优先只改 package.json 里的 scripts，不要改业务逻辑代码。<br><br>目标：<br>- 最终页面可以直接通过 {{defaultUrl}} 打开<br>- DOMPrompter 第 3 步默认地址可以直接加载成功<br>- 你修改完以后要自己运行并验证成功<br><br>请按下面要求处理：<br><br>1. 脚本适配<br>- 确保存在 dev 脚本<br>- 开发服务器必须监听 localhost<br>- 优先统一到 {{defaultUrl}}<br>- 如果是 Vite，可使用 vite --host localhost --port 5173<br>- 如果是 Next.js，可使用 next dev -H localhost -p 5173<br>- 如果是纯 HTML 且没有 package.json，请创建 package.json，并添加 "dev": "npx serve . -l 5173"<br><br>2. 修改限制<br>- 不要修改业务逻辑代码<br>- 保留项目原有其他 scripts<br>- 如果缺少 serve 或其他必需依赖，请直接安装<br>- 只关注网页调试，不需要处理 Electron、桌面端或 remote debugging 端口<br><br>3. 验证步骤必须执行<br>- 运行 npm run dev（或项目对应包管理器命令）<br>- 确认终端输出里有 localhost 地址<br>- 优先确认最终地址就是 {{defaultUrl}}<br>- 确认启动无报错后再停止进程<br><br>4. 最终输出必须包含<br>- 你识别出的网页项目类型<br>- 你修改了哪些 scripts<br>- 最终可直接打开的地址<br>- 你的验证结果<br>- 如果不能固定为 {{defaultUrl}}，明确说明原因，并给出实际可用地址<br><br>请直接开始分析并修改。只有你自己验证启动成功后，才算完成。 | I am using DOMPrompter to debug a web project. Please adapt the project's startup scripts to DOMPrompter's default debugging URL so I can click Load directly without manually copying and pasting a URL.<br><br>First identify what kind of web project this is (React / Vue / Svelte / Next.js / static HTML / other frontend project), then only focus on one goal: make the webpage start in the browser correctly. Prefer changing only package.json scripts and do not modify business logic.<br><br>Goal:<br>- The page should open directly at {{defaultUrl}}<br>- The default URL in step 3 of DOMPrompter should load successfully<br>- After making changes, you must run the project and verify it yourself<br><br>Requirements:<br><br>1. Script adaptation<br>- Ensure a dev script exists<br>- The dev server must listen on localhost<br>- Prefer unifying the final URL to {{defaultUrl}}<br>- For Vite, vite --host localhost --port 5173 is acceptable<br>- For Next.js, next dev -H localhost -p 5173 is acceptable<br>- For pure HTML without package.json, create one and add "dev": "npx serve . -l 5173"<br><br>2. Constraints<br>- Do not modify business logic<br>- Preserve all existing scripts<br>- If serve or any other required dependency is missing, install it<br>- Only focus on web debugging. Do not handle Electron, desktop workflows, or remote debugging ports<br><br>3. Required verification<br>- Run npm run dev (or the equivalent package manager command)<br>- Confirm the terminal prints a localhost URL<br>- Prefer confirming that the final URL is exactly {{defaultUrl}}<br>- Stop the process only after verifying it starts without errors<br><br>4. Final output must include<br>- The detected web project type<br>- The scripts you changed<br>- The final URL that can be opened directly<br>- Your verification result<br>- If {{defaultUrl}} is not possible, explain why and provide the exact working fallback URL<br><br>Start the analysis and make the changes now. The task is only complete after you verify that the web app starts successfully. |
| `onboarding.chooseDesc` | 通过本地开发服务器或直接打开静态 HTML 文件开始调试。 | Use a local dev server or open a static HTML file directly. |
| `onboarding.chooseTitle` | 选择开始方式 | Choose how you want to start |
| `onboarding.copied` | 已复制 | Copied |
| `onboarding.copyCommand` | 复制命令 | Copy Command |
| `onboarding.copyPrompt` | 复制提示词 | Copy Prompt |
| `onboarding.exit` | 退出 | Exit |
| `onboarding.htmlDesc` | 直接打开本地 HTML 文件并开始检查 | Open a local HTML file and inspect it immediately |
| `onboarding.htmlFoot` | 选择文件即可开始 | Select file to start |
| `onboarding.htmlGuide` | 适合单文件页面、静态导出页和本地原型。直接打开文件，或从最近记录继续。 | Best for single-file pages, static exports, and local prototypes. Open a file directly or continue from recent history. |
| `onboarding.htmlGuideBody` | 不需要先跑本地服务，选中一个 HTML 文件后会立即加载到画布里，适合快速检查和局部微调。 | You do not need to start a dev server first. Pick an HTML file and DOMPrompter will load it straight into the canvas for inspection. |
| `onboarding.htmlGuideTitle` | 直接打开本地 HTML | Open Local HTML Directly |
| `onboarding.htmlHistory` | 最近记录 | Recent History |
| `onboarding.htmlHistoryEmpty` | 还没有最近打开的 HTML 文件。 | No HTML files have been opened recently. |
| `onboarding.htmlMode` | HTML 模式 | HTML Mode |
| `onboarding.htmlOpenAction` | 打开 HTML 文件 | Open HTML File |
| `onboarding.htmlRecentAction` | 重新打开 | Reopen |
| `onboarding.htmlTitle` | HTML 模式 | HTML Mode |
| `onboarding.loadButton` | 加载页面 | Load Page |
| `onboarding.loadPage` | 加载页面 | Load your page |
| `onboarding.loadPageDesc` | 如果 AI 已按规范适配完成，这里默认地址可以直接使用；如需改端口，直接修改顶部地址栏即可。 | If the script was adapted correctly, the default address below should work immediately. If not, edit the address in the top bar. |
| `onboarding.loadPreset` | 加载默认地址 | Load Default Address |
| `onboarding.next` | 下一步 | Next |
| `onboarding.philosophy.body` | DOMPrompter 是一个介于 AI 和专业代码之间的可视化辅助工具。它不直接改源码，而是帮助你标记对象、记录参数变化，并生成可交付给 AI 的结构化提示词。 | DOMPrompter is a visual assistant between AI and production code. It does not rewrite source files itself. It helps you mark targets, record parameter changes, and assemble structured prompts that AI can apply correctly. |
| `onboarding.philosophy.eyebrow` | AI 与代码之间 | Between AI And Code |
| `onboarding.philosophy.flow.generate` | 生成 | Generate |
| `onboarding.philosophy.flow.handToAi` | 交给 AI | Hand To AI |
| `onboarding.philosophy.flow.mark` | 标记 | Mark |
| `onboarding.philosophy.flow.tune` | 微调 | Tune |
| `onboarding.philosophy.footerBody` | 页面内 Overlay 负责即时反馈，属性工作台负责持久记录。这让整个调试过程保持轻、快、可信。 | The page overlay is responsible for immediate feedback. The workbench is responsible for durable state. That keeps the workflow light, fast, and trustworthy. |
| `onboarding.philosophy.footerLead` | 精准选择，精确描述变更，再交给 AI 落地。 | Select precisely, describe precisely, then hand it to AI. |
| `onboarding.philosophy.htmlBadge` | 静态页面 | Static Page |
| `onboarding.philosophy.modeHint` | 选择一种开始方式 | Choose how you want to begin |
| `onboarding.philosophy.serverBadge` | 默认推荐 | Recommended |
| `onboarding.philosophy.title` | 把页面微调，变成 AI 能准确执行的说明 | Turn visual tweaks into instructions AI can execute precisely |
| `onboarding.previous` | 上一步 | Previous |
| `onboarding.serverDesc` | 你的项目已经运行在 localhost 上 | Your project already runs on localhost |
| `onboarding.serverFoot` | 3 步引导配置 | 3-step guided setup |
| `onboarding.serverGuide` | 先把网页项目启动到默认调试地址，再在上方地址栏一键加载。 | Start your web project on the default debugging URL, then load it from the address bar above. |
| `onboarding.serverMode` | 服务模式配置流程 | Server Mode |
| `onboarding.serverTitle` | 服务模式 | Server Mode |
| `onboarding.startServer` | 启动开发服务器 | Start your dev server |
| `onboarding.startServerDesc` | 在项目目录中运行 npm run dev，确认终端最终输出的是默认调试地址。 | Run npm run dev in your project directory and confirm the final localhost output matches the default debugging URL. |
| `onboarding.topBarHint` | 不需要再在向导里手动输入地址。顶部地址栏可以继续刷新、切换地址并重新加载。 | You no longer need to type the address inside the wizard. Use the top address bar for refresh, quick edits, and reloads. |
| `panel.ready` | 准备开始检查 | Ready to inspect |
| `panel.readyDesc` | 在页面中悬停并点击元素，右侧工作台会显示对应样式。 | Hover and click an element in the page to bring its styles into the workbench. |
| `paywall.benefitExportDesc` | 导出完整页面 AI 提示词，融合元素选择器、样式差异和标签注释为一体。 | Export full-page AI prompts combining element selectors, style diffs, and annotations into one structured output. |
| `paywall.benefitExportTitle` | 无限页面提示词导出 | Unlimited page prompt export |
| `paywall.benefitFutureDesc` | 一次购买，永久享有每项新增 Pro 功能。无订阅费用。 | One-time purchase covers every Pro feature we add, forever. No subscriptions. |
| `paywall.benefitFutureTitle` | 包含所有未来 Pro 功能 | All future Pro features |
| `paywall.benefitPrecisionDesc` | 每次 CSS 微调自动记录前后对比 — width: 200px → 300px，AI 一目了然。 | Every CSS tweak auto-recorded as before/after — width: 200px → 300px. Crystal clear for AI to execute. |
| `paywall.benefitPrecisionTitle` | 样式差异追踪 | Style diff tracking |
| `paywall.benefitTagsDesc` | 为元素添加意图注释：「按钮颜色太深」「间距太大」。让 AI 理解你的设计思路。 | Annotate elements with intent: "button color too dark", "spacing too wide". AI understands your design thinking. |
| `paywall.benefitTagsTitle` | 自然语言标签 | Natural language tags |
| `paywall.cancel` | 取消 | Cancel |
| `paywall.ctaNote` | 一次付费，无订阅费用。Pro 功能永久解锁。 | One-time payment. No subscription fees. Pro features stay unlocked permanently. |
| `paywall.kicker` | DOMPROMPTER PRO | DOMPROMPTER PRO |
| `paywall.lifetimeBadge` | 终身买断 | Lifetime unlock |
| `paywall.priceValue` | $19.99 | $19.99 |
| `paywall.purchaseCancelled` | 购买已取消。 | Purchase was cancelled. |
| `paywall.purchaseFailed` | 购买失败，请重试。 | Purchase failed. Please try again. |
| `paywall.purchasing` | 正在购买... | Purchasing... |
| `paywall.restoreFailed` | 恢复失败，请重试。 | Restore failed. Please try again. |
| `paywall.restoreNotFound` | 未找到之前的购买记录。 | No previous purchase found. |
| `paywall.restorePurchase` | 恢复购买 | Restore Purchase |
| `paywall.restoring` | 正在恢复... | Restoring... |
| `paywall.subtitle` | 为每个检查的页面导出精确的 AI 提示词。一次购买，无限精准。 | Export precise AI prompts for every page you inspect. One purchase, unlimited precision. |
| `paywall.title` | 解锁全部能力 | Unlock Full Power |
| `paywall.unlockNow` | 升级到 Pro | Upgrade to Pro |
| `properties.fields.alignItems.helperText` | 控制子元素沿交叉轴的对齐方式。 | Control how children align along the cross axis. |
| `properties.fields.alignItems.label` | 交叉轴 | Cross Axis |
| `properties.fields.backgroundColor.helperText` | 直接调整背景综合色彩，快速推敲层级与强调。 | Adjust the background color to explore hierarchy and emphasis. |
| `properties.fields.backgroundColor.label` | 背景色 | Background |
| `properties.fields.border.helperText` | 控制线条粗细、颜色和样式。 | Control thickness, color, and line style for cards, inputs, and buttons. |
| `properties.fields.border.label` | 边框 | Border |
| `properties.fields.border.placeholder` | 1px solid rgba(255,255,255,.12) | 1px solid rgba(255,255,255,.12) |
| `properties.fields.borderRadius.helperText` | 调整卡片、面板和按钮的圆角大小。 | Adjust corner radius for cards, panels, and buttons. |
| `properties.fields.borderRadius.label` | 圆角 | Radius |
| `properties.fields.boxShadow.helperText` | 用阴影塑造层级和立体感。 | Use shadow to create elevation and depth. |
| `properties.fields.boxShadow.label` | 投影 | Shadow |
| `properties.fields.boxShadow.placeholder` | 0 10px 30px rgba(0,0,0,.18) | 0 10px 30px rgba(0,0,0,.18) |
| `properties.fields.color.helperText` | 调整文字颜色以表达层级、品牌色和弱化信息。 | Adjust the text color for hierarchy, branding, and secondary copy. |
| `properties.fields.color.label` | 文字颜色 | Text Color |
| `properties.fields.display.helperText` | 切换容器布局模式。只有在 Flex 或 Grid 下，对齐与 Gap 才真正生效。 | Switch the container's layout mode. Alignment and gap only truly work in Flex or Grid. |
| `properties.fields.display.label` | 显示方式 | Display |
| `properties.fields.fontFamily.helperText` | 切换字体族，快速比较文案气质。 | Swap the font family to compare tone quickly. |
| `properties.fields.fontFamily.label` | 字体 | Font Family |
| `properties.fields.fontFamily.placeholder` | Georgia, serif | Georgia, serif |
| `properties.fields.fontSize.helperText` | 调整标题、副标题和正文的文字尺寸。 | Adjust the text size for titles, subtitles, and body copy. |
| `properties.fields.fontSize.label` | 字号 | Font Size |
| `properties.fields.fontWeight.helperText` | 改变文字轻重感，用于强调或弱化。 | Change the text weight to emphasize or soften copy. |
| `properties.fields.fontWeight.label` | 字重 | Weight |
| `properties.fields.fontWeight.placeholder` | 400 / 600 | 400 / 600 |
| `properties.fields.gap.helperText` | 调整子元素之间的空隙，仅在 Flex 或 Grid 下生效。 | Adjust the spacing between child elements. Only works in Flex or Grid. |
| `properties.fields.gap.label` | 间距 | Gap |
| `properties.fields.gap.placeholder` | 16px | 16px |
| `properties.fields.height.helperText` | 调整容器的最终高度，适合标题区、卡片和媒体框。 | Adjust the final height of the container. Great for title areas, cards, and media frames. |
| `properties.fields.height.label` | 高度 | Height |
| `properties.fields.height.placeholder` | 200px / auto | 200px / auto |
| `properties.fields.imageBorderRadius.helperText` | 让封面图和头像等图片边缘更柔和。 | Soften the image corners for covers and avatars. |
| `properties.fields.imageHeight.helperText` | 调整图片或媒体框的最终高度。 | Adjust the final height of the image or media frame. |
| `properties.fields.imageHeight.placeholder` | 240px / auto | 240px / auto |
| `properties.fields.imageWidth.helperText` | 调整图片或媒体框的最终宽度。 | Adjust the final width of the image or media frame. |
| `properties.fields.imageWidth.placeholder` | 320px / auto | 320px / auto |
| `properties.fields.justifyContent.helperText` | 控制子元素沿主轴的分布方式。 | Control how children are distributed along the main axis. |
| `properties.fields.justifyContent.label` | 主轴对齐 | Main Axis |
| `properties.fields.left.helperText` | 在定位元素上微调左侧偏移。 | Fine-tune the left offset on a positioned element. |
| `properties.fields.left.label` | 左侧偏移 | Left Offset |
| `properties.fields.left.placeholder` | 12px | 12px |
| `properties.fields.lineHeight.helperText` | 调整文本行间距，改善节奏和可读性。 | Adjust vertical spacing between lines for rhythm and readability. |
| `properties.fields.lineHeight.label` | 行高 | Line Height |
| `properties.fields.lineHeight.placeholder` | 1.5 / 24px | 1.5 / 24px |
| `properties.fields.marginBottom.helperText` | 调整与下一个元素之间的垂直间距。 | Adjust the vertical gap to the next element. |
| `properties.fields.marginBottom.placeholder` | 24px | 24px |
| `properties.fields.marginLeft.helperText` | 调整左侧外边距。 | Adjust the external distance on the left side. |
| `properties.fields.marginLeft.placeholder` | 0px | 0px |
| `properties.fields.marginRight.helperText` | 调整右侧外边距。 | Adjust the external distance on the right side. |
| `properties.fields.marginRight.placeholder` | 0px | 0px |
| `properties.fields.marginTop.helperText` | 调整与上一个元素之间的外部距离。 | Adjust the external distance from the element above. |
| `properties.fields.marginTop.placeholder` | 24px | 24px |
| `properties.fields.objectFit.helperText` | 控制图片在容器内是裁切、完整显示还是拉伸。 | Control whether the image covers, fits, or stretches inside the container. |
| `properties.fields.objectFit.label` | 填充方式 | Fit Mode |
| `properties.fields.opacity.helperText` | 适合制作禁用态、叠层和柔化效果。 | Lower opacity for disabled states, overlays, and softened layers. |
| `properties.fields.opacity.label` | 透明度 | Opacity |
| `properties.fields.overflow.helperText` | 控制内容溢出时是显示、隐藏还是允许滚动。 | Control whether overflowing content remains visible, gets hidden, or becomes scrollable. |
| `properties.fields.overflow.label` | 裁切 | Overflow |
| `properties.fields.paddingBottom.helperText` | 调整容器底部的内部留白，让模块更稳。 | Adjust the bottom inner space to make the block feel more grounded. |
| `properties.fields.paddingBottom.placeholder` | 16px | 16px |
| `properties.fields.paddingLeft.helperText` | 调整容器内部左侧的留白距离。 | Adjust the left-side breathing room inside the container. |
| `properties.fields.paddingLeft.placeholder` | 16px | 16px |
| `properties.fields.paddingRight.helperText` | 调整容器内部右侧的留白距离。 | Adjust the right-side breathing room inside the container. |
| `properties.fields.paddingRight.placeholder` | 16px | 16px |
| `properties.fields.paddingTop.helperText` | 调整内容与容器边框之间的上侧留白。 | Adjust the top space between the content and the container border. |
| `properties.fields.paddingTop.placeholder` | 16px | 16px |
| `properties.fields.position.helperText` | 将元素切换到相对、绝对或固定定位。 | Switch the element to relative, absolute, or fixed positioning. |
| `properties.fields.position.label` | 定位模式 | Position Mode |
| `properties.fields.textAlign.helperText` | 改变整块文字的排版方向。 | Change the layout direction of the full text block. |
| `properties.fields.textAlign.label` | 对齐 | Alignment |
| `properties.fields.top.helperText` | 在定位元素上微调顶部偏移。 | Fine-tune the top offset on a positioned element. |
| `properties.fields.top.label` | 顶部偏移 | Top Offset |
| `properties.fields.top.placeholder` | 12px | 12px |
| `properties.fields.transform.helperText` | 通过 translate 等方式做不破坏文档流的细微位移。 | Use translate and related transforms for subtle movement without breaking flow. |
| `properties.fields.transform.label` | 变换 | Transform |
| `properties.fields.transform.placeholder` | translate(10px, 5px) | translate(10px, 5px) |
| `properties.fields.width.helperText` | 调整容器的最终宽度，适合卡片、面板和固定尺寸媒体区。 | Adjust the final width of the container. Useful for cards, panels, and fixed-size media areas. |
| `properties.fields.width.label` | 宽度 | Width |
| `properties.fields.width.placeholder` | 320px / auto | 320px / auto |
| `properties.fields.zIndex.helperText` | 控制元素覆盖层级，适合浮层、弹窗和装饰层。 | Control stacking order for overlays, modals, and decorative layers. |
| `properties.fields.zIndex.label` | 层级 | Z-Index |
| `properties.fields.zIndex.placeholder` | 10 | 10 |
| `properties.options.align.center` | 居中 | Center |
| `properties.options.align.end` | 终点 | End |
| `properties.options.align.spaceBetween` | 两端 | Space Between |
| `properties.options.align.start` | 起点 | Start |
| `properties.options.align.stretch` | 拉伸 | Stretch |
| `properties.options.display.block` | 块 | Block |
| `properties.options.objectFit.contain` | 包含 | Contain |
| `properties.options.objectFit.cover` | 裁切 | Cover |
| `properties.options.objectFit.fill` | 拉伸 | Fill |
| `properties.options.overflow.auto` | 滚动 | Scrollable |
| `properties.options.overflow.hidden` | 隐藏 | Hidden |
| `properties.options.overflow.visible` | 可见 | Visible |
| `properties.options.position.absolute` | 绝对 | Absolute |
| `properties.options.position.fixed` | 固定 | Fixed |
| `properties.options.position.relative` | 相对 | Relative |
| `properties.options.position.static` | 静态 | Static |
| `properties.options.textAlign.center` | 居中 | Center |
| `properties.options.textAlign.left` | 左对齐 | Left |
| `properties.options.textAlign.right` | 右对齐 | Right |
| `properties.sections.background.hint` | 背景色和透明度适合快速推敲层级感。 | Background color and opacity are great for testing hierarchy quickly. |
| `properties.sections.background.title` | 背景 | Background |
| `properties.sections.border.hint` | 边框、圆角和投影共同决定组件气质。 | Borders, corner radius, and shadows define the container's visual feel. |
| `properties.sections.border.title` | 边框与圆角 | Border & Radius |
| `properties.sections.image.hint` | 图片优先调整填充方式、圆角和尺寸。 | For images, start with fit mode, radius, and size. |
| `properties.sections.image.title` | 图片 | Image |
| `properties.sections.layout.hint` | 通过 display、gap 和对齐快速观察结构变化。 | Use display, gap, and alignment to observe structural changes quickly. |
| `properties.sections.layout.title` | 布局 | Layout |
| `properties.sections.margin.hint` | 模块之间的距离通常主要来自 margin。 | The spacing between modules usually comes from margin. |
| `properties.sections.margin.title` | 外边距 | Margin |
| `properties.sections.overflow.hint` | 处理裁切、滚动和媒体容器时常用。 | Useful when handling clipping, scrolling, and media containers. |
| `properties.sections.overflow.title` | 滚动与裁切 | Overflow & Clipping |
| `properties.sections.padding.hint` | 内边距通常是调整容器呼吸感最快的入口。 | Padding is usually the fastest way to tune a container's internal breathing room. |
| `properties.sections.padding.title` | 内边距 | Padding |
| `properties.sections.position.hint` | 优先保持布局稳定，微调时再使用定位和层级。 | Keep layout stable first; use positioning and stacking for precise tweaks. |
| `properties.sections.position.title` | 定位 | Position |
| `properties.sections.size.hint` | 先确定容器本身的宽高，再继续微调内部结构。 | Lock in the container dimensions first, then fine-tune the internal structure. |
| `properties.sections.size.title` | 尺寸 | Size |
| `properties.sections.typography.hint` | 围绕字号、行高、字重和对齐做微调。 | Fine-tune type with font size, line height, weight, and alignment. |
| `properties.sections.typography.title` | 文字 | Typography |
| `properties.sides.allShort` | 全 | All |
| `properties.sides.bottom` | 下 | Bottom |
| `properties.sides.left` | 左 | Left |
| `properties.sides.right` | 右 | Right |
| `properties.sides.top` | 上 | Top |
| `properties.spacing.allSides` | 四边 | all sides |
| `properties.spacing.bottomSide` | 下边 | bottom |
| `properties.spacing.leftSide` | 左边 | left |
| `properties.spacing.rightSide` | 右边 | right |
| `properties.spacing.topSide` | 上边 | top |
| `settings.about` | 关于 | About |
| `settings.accent` | 强调色 | Accent Color |
| `settings.appearance` | 外观 | Appearance |
| `settings.buyPro` | 购买 Pro | Buy Pro |
| `settings.close` | 关闭 | Close |
| `settings.currentPlan` | 当前计划 | Current Plan |
| `settings.free` | 免费版 | Free |
| `settings.glassOpacity` | 毛玻璃透明度 | Glass Opacity |
| `settings.language` | 语言 | Language |
| `settings.license` | 许可证 | License |
| `settings.pro` | 专业版 | Pro |
| `settings.restore` | 恢复购买 | Restore Purchase |
| `settings.shortcuts` | 快捷键 | Shortcuts |
| `settings.theme` | 主题 | Theme |
| `settings.themeAuto` | 跟随系统 | Auto |
| `settings.themeDark` | 深色 | Dark |
| `settings.themeLight` | 浅色 | Light |
| `settings.title` | 设置 | Settings |
| `shortcuts.copyCss` | 复制元素 CSS | Copy Element CSS |
| `shortcuts.copyPrompt` | 复制页面提示词 | Copy Page Prompt |
| `shortcuts.escape` | 关闭 / 取消选择 | Close / Deselect |
| `shortcuts.focusAddress` | 聚焦地址栏 | Focus Address Bar |
| `shortcuts.forceReload` | 强制刷新 | Force Reload |
| `shortcuts.newWindow` | 新建窗口 | New Window |
| `shortcuts.openHtml` | 打开 HTML 文件 | Open HTML File |
| `shortcuts.openSettings` | 打开设置 | Open Settings |
| `shortcuts.reload` | 刷新页面 | Reload Page |
| `shortcuts.selectChild` | 选择子级元素 | Select Child Element |
| `shortcuts.selectParent` | 选择父级元素 | Select Parent Element |
| `shortcuts.toggleToolbar` | 切换工具栏 | Toggle Toolbar |
| `toast.connected` | 页面已连接 | Connected to page |
| `toast.connectionFailed` | 连接失败 | Connection failed |
| `toast.debuggerFailed` | 调试器附加失败 | Debugger attach failed |
| `toast.elementCssCopied` | 元素 CSS 已复制 | Element CSS copied |
| `toast.htmlFailed` | 打开 HTML 文件失败 | Failed to open HTML file |
| `toast.htmlOpened` | 已打开本地 HTML | Opened local HTML |
| `toast.loadFailed` | 页面加载失败 | Page load failed |
| `toast.noPrompt` | 当前还没有可导出的页面级提示词 | No page-level prompt is available yet |
| `toast.pageRefreshed` | 页面已刷新 | Page refreshed |
| `toast.promptCopied` | 页面级提示词已复制 | Page prompt copied |
| `toast.settingsSoon` | 设置面板将在下一阶段接入 | Settings panel will arrive in the next phase |
| `toast.tagRemoved` | 标签已删除 | Tag removed |
| `topbar.addressLabel` | 页面地址 | Page Address |
| `topbar.connected` | 已连接 | Connected |
| `topbar.connecting` | 连接中 | Connecting |
| `topbar.disconnect` | 断开连接 | Disconnect |
| `topbar.disconnected` | 未连接 | Not Connected |
| `topbar.hideToolbar` | 隐藏工具栏 | Hide Toolbar |
| `topbar.load` | 加载 | Load |
| `topbar.refresh` | 刷新 | Refresh |
| `topbar.settings` | 设置 | Settings |
| `topbar.showToolbar` | 显示工具栏 | Show Toolbar |
| `topbar.urlPlaceholder` | 输入 localhost 地址或打开本地 HTML | Enter localhost URL or open local HTML |
| `workbench.active.alignmentTitle` | 对齐 | Alignment |
| `workbench.active.background` | 背景色和透明度都在这里，适合快速调整层级感和视觉强弱。 | Background color and opacity live here for quick hierarchy and emphasis tuning. |
| `workbench.active.border` | 边框、圆角和投影会一起影响组件气质，适合在同一组字段里联动观察。 | Border, radius, and shadow work together to shape the component's feel, so it helps to inspect them together. |
| `workbench.active.gap` | Gap 会在布局小节里显示；只有容器存在真实子项并启用布局模式时，它才会产生你期待的效果。 | Gap appears in the Layout section. It only works as expected when the container has real children and an active layout mode. |
| `workbench.active.gapShortcut` | 当前对象有多个可见子元素，Gap 字段会作为统一间距入口显示在布局小节里。 | This object has multiple visible children, so Gap is exposed as the unified spacing control in the Layout section. |
| `workbench.active.image` | 图片模式会把填充方式、尺寸和圆角放在同一区域，方便一起比对。 | Image mode keeps fit mode, size, and radius in one place so comparisons are easier. |
| `workbench.active.labels` | 这里写的是给 AI 的自然语言目标。先明确对象想达到什么效果，再继续做数值微调。 | Write the natural-language goal you want AI to follow before refining numbers. |
| `workbench.active.layout` | 这里会带你到布局小节，优先看主轴对齐和交叉轴这些真正决定排布的位置。 | Jump to the Layout section and focus on main-axis and cross-axis alignment first. |
| `workbench.active.margin` | 外边距快捷盘适合先做模块间距的大方向调整，再到精确控制区修正单边数值。 | Use quick margin controls to set module spacing directionally before precise single-side edits. |
| `workbench.active.overflow` | 需要控制内容裁切或滚动时，优先看这里的 overflow 相关设置。 | Use this area when you need to control clipping or scrolling behavior. |
| `workbench.active.padding` | 内边距快捷盘会优先出现，适合先把容器内部留白拉到位，再逐边微调。 | Use quick padding controls to establish the container's internal breathing room, then refine side by side. |
| `workbench.active.position` | 定位相关控制放在精确控制区，适合做 top / left / z-index 这类高精度修正。 | Position controls live in the precision section for top, left, and z-index style corrections. |
| `workbench.active.shadow` | 投影与圆角通常要联动观察，这里更适合做稳定的视觉精修。 | Shadow usually needs to be reviewed together with radius for stable visual polish. |
| `workbench.active.size` | 先用宽高快捷卡把外轮廓推到接近目标，再到下方尺寸字段做精细值修正。 | Use the quick width and height cards to get close first, then fine-tune below. |
| `workbench.active.typography` | 文字控制集中在这里，适合连续调整字号、行高、字重和对齐。 | Typography controls are grouped here so you can adjust size, line height, weight, and alignment continuously. |
| `workbench.direction.bottom` | 下 | Bottom |
| `workbench.direction.bottomLeft` | 左下 | Bottom Left |
| `workbench.direction.bottomRight` | 右下 | Bottom Right |
| `workbench.direction.center` | 中 | Center |
| `workbench.direction.left` | 左 | Left |
| `workbench.direction.right` | 右 | Right |
| `workbench.direction.top` | 上 | Top |
| `workbench.direction.topLeft` | 左上 | Top Left |
| `workbench.direction.topRight` | 右上 | Top Right |
| `workbench.editor.altPlaceholder` | image description | image description |
| `workbench.editor.altText` | 替代文本 | Alt Text |
| `workbench.editor.imageUrl` | 图片地址 | Image URL |
| `workbench.editor.textContent` | 文案内容 | Text Content |
| `workbench.editor.textPlaceholder` | 输入新的文案 | Enter new copy |
| `workbench.element.containerName` | 容器名称 | Container |
| `workbench.element.copyTitle` | 点击复制 {{name}} | Click to copy {{name}} |
| `workbench.element.elementName` | 元素名称 | Element |
| `workbench.empty.interactiveDesc` | 当前可自由操作页面，点击上方“可交互”可切回选择模式来选取元素。 | You can freely interact with the page now. Click “Interactive” above again to switch back to element selection. |
| `workbench.empty.interactiveTitle` | 可交互模式 | Interactive Mode |
| `workbench.export.copied` | 已复制页面级修改提示词 | Page prompt copied |
| `workbench.export.copyButton` | 导出修改提示词 | Export Prompt |
| `workbench.export.copyTitle` | 复制当前页面会话内的全部微调摘要和标签 | Copy the complete tuning summary and tags for the current page session |
| `workbench.export.empty` | 还没有收集到页面级修改。继续在画布上调整元素后，DOMPrompter 会自动整理整页提示词。 | No page-level edits have been collected yet. Adjust elements on the canvas and DOMPrompter will assemble a page prompt for you. |
| `workbench.export.kicker` | 页面级提示词 | Page-Level Prompt |
| `workbench.export.sectionHint` | 这里汇总当前页面里所有结构化微调和标签意图，适合直接复制给 Codex 等 AI 编程工具。 | This gathers the structured tweaks and tag intent for the current page so you can paste them directly into Codex or other AI coding tools. |
| `workbench.export.sectionTitle` | 导出提示词 | Export Prompt |
| `workbench.export.summary` | 已收集 {{elementCount}} 个元素 / {{modifiedCount}} 组结构化微调 / {{tagCount}} 组标签 | {{elementCount}} elements collected / {{modifiedCount}} structured tweaks / {{tagCount}} tag groups |
| `workbench.export.title` | 面向 AI 编程工具的最终微调说明 | Final tuning brief for AI coding tools |
| `workbench.field.scrubTitle` | {{label}}，左右拖拽改数值；方向键微调，Shift 加速 | {{label}}. Drag left or right to change the value; use arrow keys to nudge, Shift to accelerate. |
| `workbench.helper.browseDesc` | 当前已关闭元素拾取。你可以直接点击和操作真实页面，让弹窗、菜单和下拉面板自然展开。 | Element picking is currently off. You can click and interact with the real page so menus, popovers, and dropdowns open naturally. |
| `workbench.helper.browseTitle` | 真实交互 | Real Interaction |
| `workbench.helper.contextDesc` | 把鼠标移到任意参数卡片上，画布会高亮对应的 Margin、Padding 或排版区域，帮助你像看建筑图纸一样理解结构。 | Hover any parameter card and the canvas will highlight matching margin, padding, or typography regions so you can read structure like a blueprint. |
| `workbench.helper.contextTitle` | 上下文微调 | Contextual Tuning |
| `workbench.helper.gapUnavailable` | 当前节点不是 Flex 或 Grid 容器，Gap 即使写入样式也不会产生你期待的子元素间距效果。先把显示方式切到 Flex / Grid，或选中真正承载子元素布局的父容器。 | This node is not a Flex or Grid container, so setting gap will not create the spacing effect you expect. Switch Display to Flex or Grid first, or select the actual parent container that owns the child layout. |
| `workbench.helper.innerChild` | 内部子元素 | its child elements |
| `workbench.helper.innerChildWithClass` | {{className}} 内部的子元素 | child elements inside {{className}} |
| `workbench.helper.marginCentered` | 当前节点通过 Flex 居中排版。外层 margin 主要影响它与兄弟节点的距离，不会像内部偏移那样直接推动中间内容。想微调中间文案块，优先改布局对齐，或者选中 {{childTargetName}} 再调 margin。 | This node uses centered Flex layout. Outer margin mostly affects the distance to sibling nodes, not the centered content itself. To tweak the middle copy block, change layout alignment first or select {{childTargetName}} and adjust margin there. |
| `workbench.helper.paddingCentered` | 当前节点是一个 Flex 居中容器。修改 {{field}} 会改变容器内盒尺寸，但子内容仍会保持居中。若你的目标是移动中间内容，优先调整布局对齐，或者继续选中 {{childTargetName}} 去调 margin / padding。 | This node is a centered Flex container. Changing {{field}} alters the inner box size, but the content still stays centered. If you want to move the middle content block, adjust layout alignment first or keep selecting {{childTargetName}} to tweak margin or padding. |
| `workbench.helper.sizeCentered` | 当前节点是一个 Flex 居中容器。调整宽高会改变容器包围盒，但内部内容仍会按主轴 {{justifyContent}}、交叉轴 {{alignItems}} 继续居中。若你想让内容靠上、靠左或贴边，优先修改布局对齐。 | This node is a centered Flex container. Adjusting width or height changes the box, but the content still stays centered with main axis {{justifyContent}} and cross axis {{alignItems}}. If you want the content to sit top, left, or edge-aligned, change layout alignment first. |
| `workbench.insight.flexCentered` | 当前选中的是一个 Flex 居中容器（主轴 {{justifyContent}}，交叉轴 {{alignItems}}）。这类节点改 padding / 宽高时，内容通常仍会保持居中；如果你的目标是移动中间内容位置，优先改布局对齐，或者继续选中内部子元素。 | The current selection is a centered Flex container (main axis {{justifyContent}}, cross axis {{alignItems}}). Padding and size changes often keep the content centered. If you want to move the inner content, adjust layout alignment first or continue selecting a child element. |
| `workbench.insight.grid` | 当前节点是 Grid 容器。优先关注 gap、padding 和宽高；如果某个子块位置不对，通常需要选中子元素本身，而不是只改外层容器。 | This node is a Grid container. Focus on gap, padding, and size first. If one child block is misplaced, you usually need to select that child instead of only editing the outer container. |
| `workbench.insight.layoutTitle` | 布局洞察 | Layout Insight |
| `workbench.insight.parent` | 当前节点是父容器。改它的 padding / width / height 会影响内部结构，但不一定直接改变子内容的相对站位；如果你想微调具体文案块或图片块，继续点选内部子元素会更直接。 | This node is a parent container. Changing its padding, width, or height affects the inner structure, but does not always directly move the child content. If you want to tweak a specific text or image block, select the child element directly. |
| `workbench.labels.delete` | 删除标签 | Delete tag |
| `workbench.labels.description` | 这里写给 AI 的是自然语言目标，不是精确数值。用它描述这个对象想达到的效果、结构意图和实现约束。 | Write the natural-language goal for AI here, not precise numbers. Use it to describe the intended effect, structure, and constraints. |
| `workbench.labels.placeholder` | 输入修改意见… | Enter a change note… |
| `workbench.labels.placeholderConfirm` | 输入修改意见，回车确认… | Enter a change note and press Enter… |
| `workbench.quick.cards.fontSize` | 标题和正文最常用的快速层级控制。 | A fast hierarchy control for headings and body copy. |
| `workbench.quick.cards.gap` | 直接增减容器里子元素之间的空隙。 | Directly increase or decrease the space between child elements in the container. |
| `workbench.quick.cards.height` | 适合快速拉高标题区、卡片或图片区。 | Great for quickly stretching title areas, cards, or image zones. |
| `workbench.quick.cards.objectFit` | 在铺满和完整显示之间快速切换图片裁切方式。 | Quickly switch the image crop behavior between filling and fully fitting the container. |
| `workbench.quick.cards.opacity` | 适合做弱化态、叠层和柔和感。 | Useful for muted states, overlays, and softening. |
| `workbench.quick.cards.radius` | 让卡片、面板和图片边缘更柔和。 | Softens the edges of cards, panels, and images. |
| `workbench.quick.cards.width` | 卡片、面板和图像框最常先调宽度。 | Width is usually the first thing to tune for cards, panels, and image frames. |
| `workbench.quick.decrease` | 减少 | Decrease |
| `workbench.quick.decreased` | 减少 | decreased |
| `workbench.quick.decreaseWithStep` | 减少 {{step}}px | Decrease {{step}}px |
| `workbench.quick.increase` | 增加 | Increase |
| `workbench.quick.increased` | 增加 | increased |
| `workbench.quick.increaseWithStep` | 增加 {{step}}px | Increase {{step}}px |
| `workbench.quick.layout.hint` | 先切换块 / Flex / Grid，再用方向盘把内容推到上、下、左、右或居中。 | Switch between Block, Flex, and Grid first, then use the pad to push content top, bottom, left, right, or center. |
| `workbench.quick.layout.modeDescription` | 显示方式已切到 {{display}}。继续用方向盘可以把内容快速推到上、下、左、右或中心。 | Display has been switched to {{display}}. Keep using the pad to push content to top, bottom, left, right, or center. |
| `workbench.quick.layout.modeTitle` | 布局模式 | Layout Mode |
| `workbench.quick.layout.positionDescription` | 已把容器内容切到 {{slot}}。 | The container content is now positioned at {{slot}}. |
| `workbench.quick.layout.positionTitle` | 内容站位 | Content Position |
| `workbench.quick.layout.title` | 布局快捷卡 | Layout Quick Card |
| `workbench.quick.spacing.adjusted` | {{side}}已{{direction}} {{value}}px。你也可以继续在下方参数区做更精细的单值微调。 | {{side}} has been {{direction}} by {{value}}px. You can continue with fine-grained single-value edits below. |
| `workbench.quick.spacing.currentMargin` | 当前快捷调节：外边距 | Current quick target: Margin |
| `workbench.quick.spacing.currentPadding` | 当前快捷调节：内边距 | Current quick target: Padding |
| `workbench.quick.spacing.hint` | 先选内边距或外边距，再点方向。中心表示四边一起调整。 | Choose padding or margin first, then choose a direction. The center means all sides together. |
| `workbench.quick.spacing.marginActionTitle` | 外边距快捷操作 | Margin Quick Action |
| `workbench.quick.spacing.paddingActionTitle` | 内边距快捷操作 | Padding Quick Action |
| `workbench.quick.spacing.title` | 边距快捷调节 | Spacing Quick Adjust |
| `workbench.quick.step` | 步进 | Step |
| `workbench.recommended.alignCenter.description` | 把主轴和交叉轴都切回居中，快速恢复标准居中态。 | Set both axes back to center to restore the standard centered state quickly. |
| `workbench.recommended.alignCenter.label` | 让内容居中 | Center Content |
| `workbench.recommended.centerText.description` | 把文本对齐方式切到居中，适合标题和短文案块。 | Switch text alignment to center. Great for headings and short text blocks. |
| `workbench.recommended.centerText.label` | 文字居中 | Center Text |
| `workbench.recommended.enableFlex.description` | 先把容器切到 Flex，再继续做对齐和间距微调。 | Switch the container to Flex first, then continue with alignment and spacing adjustments. |
| `workbench.recommended.enableFlex.label` | 启用 Flex | Enable Flex |
| `workbench.recommended.imageContain.description` | 将 object-fit 切到 contain，让图片完整地留在容器里。 | Switch object-fit to contain so the full image remains visible. |
| `workbench.recommended.imageContain.label` | 完整显示 | Show Full Image |
| `workbench.recommended.imageCover.description` | 将 object-fit 切到 cover，让图片优先铺满容器。 | Switch object-fit to cover so the image fills the container first. |
| `workbench.recommended.imageCover.label` | 填满容器 | Fill Container |
| `workbench.recommended.increaseGap.description` | 把容器内子元素之间的 gap 增加 {{quickStep}}px。 | Increase the gap between child elements by {{quickStep}}px. |
| `workbench.recommended.increaseGap.label` | 增加间距 | Increase Gap |
| `workbench.recommended.increasePadding.description` | 四边同时增加 {{quickStep}}px 留白，快速拉开内容呼吸感。 | Add {{quickStep}}px of breathing room on all sides at once. |
| `workbench.recommended.increasePadding.label` | 增加内边距 | Increase Padding |
| `workbench.recommended.spaceBetween.description` | 把主轴分布切到两端，适合标题条、按钮条和工具栏。 | Spread items to both ends of the main axis. Great for title bars, button rows, and toolbars. |
| `workbench.recommended.spaceBetween.label` | 两端排布 | Space Between |
| `workbench.sections.assist` | 辅助信息 | Support Info |
| `workbench.sections.assistHint` | 上下文说明和预览集中放在这里，避免打断主编辑流程。 | Keep context notes and previews here so the main editing flow stays focused. |
| `workbench.sections.cssVariables` | CSS 变量 | CSS Variables |
| `workbench.sections.labels` | 标签意图 | Tag Intent |
| `workbench.sections.labelsHint` | 这里直接写给 AI 你想怎么改这个元素。标签是高优先级意图，不只是备注。 | Write the high-priority instruction for AI here. These tags are intent, not just notes. |
| `workbench.sections.precision` | 精确控制 | Precision Controls |
| `workbench.sections.precisionHint` | 快捷操作把对象推进到目标附近后，在这里做逐项精修。 | After quick actions get close, refine each property here. |
| `workbench.sections.quick` | 快捷操作 | Quick Actions |
| `workbench.sections.quickHint` | 先用语义化动作和方向卡把对象推到接近目标，再到后面的原始参数区做精修。 | Push the element near the target with semantic actions first, then fine-tune raw values below. |
| `workbench.slot.bottom` | 下方 | bottom |
| `workbench.slot.bottomLeft` | 左下角 | bottom left |
| `workbench.slot.bottomRight` | 右下角 | bottom right |
| `workbench.slot.center` | 中心 | center |
| `workbench.slot.left` | 左侧 | left |
| `workbench.slot.right` | 右侧 | right |
| `workbench.slot.top` | 上方 | top |
| `workbench.slot.topLeft` | 左上角 | top left |
| `workbench.slot.topRight` | 右上角 | top right |
| `workbench.snapshot.layout` | 布局快照 | Layout Snapshot |
| `workbench.snapshot.position` | 定位快照 | Position Snapshot |
| `workbench.snapshot.typography` | 排版快照 | Typography Snapshot |
| `workbench.snapshot.visual` | 视觉快照 | Visual Snapshot |
| `workbench.toolbar.interactive` | 可交互 | Interactive |
| `workbench.toolbar.redo` | 前进 | Redo |
| `workbench.toolbar.reset` | 复位 | Reset |
| `workbench.toolbar.select` | 选择元素 | Select Element |
| `workbench.toolbar.selectActive` | 选择中 | Selecting |
| `workbench.toolbar.selectOff` | 关闭元素选择，恢复真实点击 | Disable element picking and restore real clicks |
| `workbench.toolbar.selectOn` | 开启元素选择 | Enable element picking |
| `workbench.toolbar.syncing` | 同步中 | Syncing |
| `workbench.toolbar.undo` | 撤销 | Undo |

