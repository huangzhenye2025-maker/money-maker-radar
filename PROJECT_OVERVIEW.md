# GitHub 热点变现机会监控台 - 项目说明文档 (AI Context)

> **给下一个 AI 助手的提示 (To the Next AI Agent)**：
> 当你开启一个新的对话窗口时，请首先阅读本文档。本文档记录了该项目的核心架构、业务逻辑、已解决的关键技术坑点，以及代码存放位置。这能帮你瞬间恢复上下文，无需翻阅历史聊天记录。

## 1. 项目概览 (Project Overview)
本项目是一个 **“开源工具倒卖变现平台”**。它的核心目标是：
1. 自动抓取 GitHub 每日热点项目（Trending）。
2. 使用大模型（Gemini / DeepSeek）对项目进行商业化价值分析，评估其是否适合在闲鱼/小红书等平台进行“零成本售卖”。
3. **（核心功能）一键打包系统**：自动为小白用户生成“免安装绿色版”套件（包含自动配置环境的批处理脚本）。
4. **（核心功能）物理打包引擎**：在服务器（本地）后台自动下载源码、解压、注入运行环境脚本，一键生成可以直接发给客户赚钱的 ZIP 准备目录。

## 2. 技术栈 (Tech Stack)
- **后端**：Node.js (Express框架)
- **数据库**：SQLite (用于持久化保存热点项目和分析结果)
- **前端**：原生 HTML/CSS/JavaScript (无前端框架，极致轻量，代码主要在 `public/` 目录下)
- **大模型 API**：主节点 Google Gemini (2.5/2.0/1.5-pro)，备用节点 DeepSeek。

## 3. 核心文件结构
```text
监控github/
├── src/
│   ├── app.js               # 后端主程序入口，包含所有 API 路由及物理打包引擎的实现
│   ├── database.js          # SQLite 数据库初始化与操作逻辑
│   ├── classify/
│   │   ├── aiAnalyst.js     # 核心 AI 逻辑层。包含与 Gemini/DeepSeek 的通信，以及极其重要的 Prompt 提示词设定
│   │   └── crawler.js       # GitHub Trending 网页爬虫（使用 Cheerio 解析 DOM）
│   ├── push/
│   │   └── feishuLedgerSender.js # 飞书台账/多维表同步发送模块，基于 lark-cli

├── public/
│   ├── index.html           # 前端主页面
│   ├── styles.css           # 前端样式（包含大量现代感、毛玻璃效果、微动画特效）
│   └── app.js               # 前端交互逻辑（包括与后端的 fetch 请求、界面渲染、UI 状态控制）
├── data/
│   ├── database.sqlite      # 数据库文件
│   └── packages/            # 物理打包引擎的输出目录，所有“绿色免安装版”成品都在这
├── package.json
└── PROJECT_OVERVIEW.md      # 本文件
```

## 4. 关键业务流程与 API
1. **GET `/api/repositories`**：分页拉取存储在 SQLite 中的热点仓库，现已精简移除冗余的评估和收藏筛选条件。
2. **POST `/api/repositories/:id/package-kit`**：触发 `aiAnalyst.js` 生成“打包套件”（包括 `双击启动.bat`, `安装环境.bat`, `使用说明.txt`）。
3. **POST `/api/repositories/:id/build-physical-package`**：**物理组装引擎**。该接口会在 Node.js 后端自动下载该 GitHub 项目的 zip 源码，调用系统命令解压，并将 AI 生成的脚本文件写入目录中，最终输出一个可直接分发的文件夹。
4. **POST `/api/open-folder`**：调用 Windows 系统命令 `explorer` 打开打包好的本地文件夹。
5. **POST `/api/operations/generate-image-prompt`**：**生图提示词获取站**。底层调用 DeepSeek 解析文案核心逻辑，一次性批量输出 6 段自带平台限定比例的高保真提示词分镜矩阵。
6. **POST `/api/feishu/sync-ledger`**：**飞书多维表同步接口**。一键将当前生成的自媒体运营文案推送至飞书多维表台账。后端通过 `feishuLedgerSender` 处理，智能提取标题并进行分类。


## 5. ⚠️ 历史踩坑记录与硬编码限制 (Critical Bug Fixes)
在迭代过程中，我们解决了一系列 Windows 环境和 AI 代码生成的深坑。**未来的 AI 在修改代码或 Prompt 时，绝对不可移除或违背以下规则：**

### 5.1 物理打包时的文件锁定 (EPERM 错误)
- **问题**：如果用户刚才运行过测试 `.bat`，残留的 `cmd` 或 `powershell` 进程会锁死打包输出文件夹，导致下一次 Node.js 执行 `fs.rmSync` 时报 `EPERM, Permission denied`。
- **解决方案**：在 `src/app.js` 中，输出文件夹命名强制附加时间戳（如 `${repoName}-免安装版-${timestamp}`），彻底避开同名文件夹锁定冲突。

### 5.2 PowerShell 的 `Expand-Archive` 解压性能灾难
- **问题**：解压 Node.js 或包含大量小文件的项目时，PowerShell 自带的 `Expand-Archive` 会假死长达十几分钟。
- **解决方案**：在 `aiAnalyst.js` 的 AI Prompt 中，**强制禁止**大模型使用 `Expand-Archive`，**必须**使用 Windows 10+ 自带的极速命令 `tar -xf`。并且要求使用 `tar -C` 之前必须先 `mkdir` 创建目标目录。

### 5.3 Python 便携版 (Embed) 缺失 Pip 模块
- **问题**：Windows Python 便携版被阉割，既没有 `pip` 也不支持 `python -m ensurepip`。AI 生成的安装依赖脚本总是报错 `ModuleNotFoundError: No module named 'pip'`。
- **解决方案**：在 `aiAnalyst.js` 的 Prompt 中硬编码了强制要求。要求必须下载 `get-pip.py`，且必须通过通配符 `for %%f in (*._pth) do echo import site>> "%%f"` 来修改配置解禁 site-packages，然后再执行 `python get-pip.py`。这是能够让环境安装 100% 成功的绝对前提。

### 5.4 命令行 `cd` 相对路径迷失
- **问题**：AI 写 `.bat` 时喜欢用 `cd ..\..`，导致目录层级错乱，找不到 `requirements.txt`。
- **解决方案**：Prompt 强制要求任何路径跳转后，若需回到根目录，必须使用绝对路径锁定方式 `cd /d "%~dp0"`。

### 5.5 飞书 Bitable 接口与 Wiki 节点的 lark-cli 限制
- **问题**：若使用维基文档 (Wiki) 关联的多维表，其 `baseToken` 具有特殊格式（如 `EA55` 开头）。调用官方 CLI 快捷命令 `lark-cli base +record-batch-create` 会触发内部正则限制，提示校验失败。
- **解决方案**：绕过快捷命令，直接调用更底层的通用 API 指令：`lark-cli api POST /open-apis/bitable/v1/apps/{baseToken}/tables/{tableId}/records/batch_create`。
- **命令行 Windows 路径与转义限制**：使用 `--data "@json_file"` 传入大文本 JSON 时，Windows 下绝对路径传参可能会因为反斜杠或特殊字符转义失败。解决方案为：将临时 JSON 写入 `scratch/` 文件夹，运行命令时将 `execSync` 的工作目录 `cwd` 指定为 `scratch/`，以相对路径方式（如 `--data "@filename.json"`) 传参，调用完毕后由 Node.js 异步删除临时文件。


## 6. 启动方式
```bash
npm install
npm run start
# 默认监听 3000 端口，前端页面为 http://localhost:3000
```
