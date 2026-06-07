const express = require('express');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const axios = require('axios');
const { execSync, exec } = require('child_process');

// 提升全局事件监听器上限，消除由于高频重试导致的 TLSSocket MaxListenersExceededWarning
require('events').EventEmitter.defaultMaxListeners = 50;

// 加载环境变量
dotenv.config({ override: true });

const Database = require('./storage/database');
const PushService = require('./push/pushService');
const aiAnalyst = require('./classify/aiAnalyst');

const SocialTrending = require('./fetch/socialTrending');
const socialTrending = new SocialTrending();
const scheduler = require('./utils/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(express.json());

// 强制所有 HTML 静态文件使用 UTF-8 编码（防止 Windows 中文乱码）
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
  }
}));

// 全局状态持有
let db;
let pushService;

// 初始化系统组件
async function initializeSystem() {
  console.log('正在初始化后端核心服务...');
  
  // 确保数据目录存在
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = process.env.DB_PATH || path.join(dataDir, 'github_trending.db');
  db = new Database(dbPath);
  await db.init();

  // 初始化定时推送服务配置
  const pushConfig = {
    dbPath,
    emailService: process.env.EMAIL_SERVICE,
    emailPort: parseInt(process.env.EMAIL_PORT) || 587,
    emailUser: process.env.EMAIL_USER,
    emailPass: process.env.EMAIL_PASS,
    emailTo: process.env.EMAIL_TO,
    feishuAppId: process.env.FEISHU_APP_ID,
    feishuAppSecret: process.env.FEISHU_APP_SECRET,
    feishuSpreadsheetId: process.env.FEISHU_SPREADSHEET_ID,
    feishuSheetId: process.env.FEISHU_SHEET_ID,
    topics: (process.env.CATEGORIES || '副业,变现,自媒体,小红书,抖音,微信,效率,办公自动化,去水印,AI工具,人工智能,娱乐,影视,游戏脚本').split(',').map(s => s.trim().toLowerCase())
  };

  pushService = new PushService(pushConfig);
  await pushService.init();
  
  // 启动定时任务 (已根据聚焦变现流程禁用定时推送服务)
  // pushService.startCronJob();

  // 初始化社媒监控调度器，每 6 小时触发一次，并传入 pushService 以保证数据同步更新
  scheduler.init(db, socialTrending, aiAnalyst, pushService, 6);
  
  console.log(`系统就绪。监听端口: ${PORT}`);
}

// ==================== REST API 路由 ====================

// 1. 获取仓库列表（支持高级检索与筛选）
app.get('/api/repositories', async (req, res) => {
  try {
    const { category, language, minStars, minScore, hasReport, isStarred, query, xhsCategory, sortBy, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const repos = await db.queryRepositories({
      category,
      language,
      minStars,
      minScore,
      hasReport,
      isStarred,
      query,
      xhsCategory,
      sortBy,
      limit: parseInt(limit),
      offset
    });

    res.json({ success: true, data: repos });
  } catch (error) {
    console.error('获取仓库列表失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. 触发指定仓库的 AI 商业化分析
// 2.5. 生成一键打包套件
app.post('/api/repositories/:id/package-kit', async (req, res) => {
  try {
    const { id } = req.params;
    const allRepos = await db.getAllRepositories(500);
    const repo = allRepos.find(r => r.id === parseInt(id));

    if (!repo) {
      return res.status(404).json({ success: false, message: '未找到指定的仓库数据' });
    }

    console.log(`【打包助手】开始为 ${repo.name} 生成打包套件...`);
    const kit = await aiAnalyst.generatePackageKit(repo);

    res.json({
      success: true,
      data: kit
    });
  } catch (error) {
    console.error('打包套件生成失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4.36 搜索小红书真实爆款赛道数据
app.post('/api/xhs/search', async (req, res) => {
  try {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).json({ success: false, message: '缺少搜索关键词' });
    }
    const redfoxXhs = require('./fetch/redfoxXhs');
    const xhsData = await redfoxXhs.fetchXhsHotNotes(keyword);
    res.json({ success: true, data: xhsData });
  } catch (error) {
    console.error('小红书爆款搜寻失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4.37 公众号爆款搜索
app.post('/api/wechat/search', async (req, res) => {
  try {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).json({ success: false, message: '缺少关键词' });
    }
    const redfoxWechat = require('./fetch/redfoxWechat');
    const wxData = await redfoxWechat.searchHotArticle(keyword);
    res.json({ success: true, data: wxData });
  } catch (error) {
    console.error('公众号爆款搜寻失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4.38 公众号 10w+ 榜单获取
app.post('/api/wechat/hot', async (req, res) => {
  try {
    const { category } = req.body;
    const redfoxWechat = require('./fetch/redfoxWechat');
    const wxData = await redfoxWechat.getWxDataByCategoryAndTime(category || '总排名');
    res.json({ success: true, data: wxData });
  } catch (error) {
    console.error('公众号10w+榜单获取失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4.35 根据文案智能提取图片提示词
app.post('/api/operations/generate-image-prompt', async (req, res) => {
  try {
    const { copy } = req.body;
    if (!copy) {
      return res.status(400).json({ success: false, message: '缺少文案内容' });
    }
    const aiAnalyst = require('./classify/aiAnalyst');
    const imagePrompt = await aiAnalyst.generateImagePromptFromCopy(copy);
    res.json({ success: true, imagePrompt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4.4 调用 Gemini 生成图片 (Nano Banana)
app.post('/api/operations/generate-image', async (req, res) => {
  try {
    const { prompt, platform } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, message: '缺少 prompt 参数' });
    }
    console.log(`【AI 绘图】正在调用 Nano Banana... prompt: ${prompt.substring(0, 50)}`);
    const imageUrl = await aiAnalyst.generateImage(prompt, platform);
    res.json({ success: true, imageUrl });
  } catch (error) {
    console.error('AI 图片生成失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4.5 获取项目的原始 README (用于自媒体运营中心的两步工作流比对)
app.get('/api/repositories/:id/readme', async (req, res) => {
  try {
    const { id } = req.params;
    const allRepos = await db.getAllRepositories(500);
    const repo = allRepos.find(r => r.id === parseInt(id));

    if (!repo) {
      return res.status(404).json({ success: false, message: '未找到指定的仓库数据' });
    }

    let repoName = repo.name ? repo.name.replace(/\s+/g, '') : '';
    if (repo.url && repo.url.includes('github.com/')) {
      const parts = repo.url.split('github.com/');
      repoName = parts[parts.length - 1].replace(/\/$/, '');
    }

    console.log(`【自媒体工作流】拉取 ${repoName} 的原始 README...`);
    const readme = await aiAnalyst.fetchReadme(repoName);
    
    if (!readme || readme === '无详细 README') {
      return res.status(404).json({ success: false, message: '抱歉，未能抓取到该项目的 README 内容。可能是项目没有 README，或受到网络连通性限制。' });
    }

    res.json({ success: true, data: readme });
  } catch (error) {
    console.error('拉取 README 失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2.6. 生成实物安装包
app.post('/api/repositories/:id/build-physical-package', async (req, res) => {
  try {
    const { id } = req.params;
    const { packageKit } = req.body;
    
    if (!packageKit) {
      return res.status(400).json({ success: false, message: '缺少打包套件数据' });
    }

    const allRepos = await db.getAllRepositories(500);
    const repo = allRepos.find(r => r.id === parseInt(id));

    if (!repo) {
      return res.status(404).json({ success: false, message: '未找到指定的仓库数据' });
    }

    console.log(`【实物打包】开始为 ${repo.name} 构建物理文件夹...`);
    
    // 解析 owner/repo 以获取源码下载链接
    let ownerRepo = repo.name ? repo.name.replace(/\s+/g, '') : '';
    if (repo.url && repo.url.includes('github.com/')) {
      const parts = repo.url.split('github.com/');
      ownerRepo = parts[parts.length - 1].replace(/\/$/, '');
    }
    ownerRepo = ownerRepo.replace(/\s+/g, '');
    
    // 我们假设下载默认分支(main)的压缩包，如果失败可能是master分支
    const useProxy = process.env.USE_CN_PROXY !== 'false';
    const proxyPrefix = useProxy ? 'https://ghproxy.net/' : '';
    const downloadUrl = `${proxyPrefix}https://github.com/${ownerRepo}/archive/refs/heads/main.zip`;
    
    // 创建包目录，附带时间戳彻底避开Windows进程占用造成的EPERM问题
    const timestamp = new Date().getTime().toString().slice(-5);
    const packageDirName = `${repo.name.split('/').pop().trim()}-免安装版-${timestamp}`;
    // 使用应用根目录下的 data/packages
    const packagesBaseDir = path.join(__dirname, '../data/packages');
    const targetDir = path.join(packagesBaseDir, packageDirName);
    const targetAppDir = path.join(targetDir, 'app');
    
    // 清理或创建基础目录
    if (!fs.existsSync(packagesBaseDir)) {
      fs.mkdirSync(packagesBaseDir, { recursive: true });
    }
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(targetAppDir, { recursive: true });

    const zipPath = path.join(packagesBaseDir, `${repo.name.replace(/\//g, '_')}.zip`);

    // 1. 下载源码
    console.log(`【实物打包】准备下载源码...`);
    const branches = ['main', 'master'];
    let downloadSuccess = false;
    let lastError = null;
    
    // 生成备用的镜像 URL 列表
    const getDownloadUrls = (branch) => {
      const urls = [];
      if (useProxy) {
        urls.push(`https://mirror.ghproxy.com/https://github.com/${ownerRepo}/archive/refs/heads/${branch}.zip`);
        urls.push(`https://ghproxy.net/https://github.com/${ownerRepo}/archive/refs/heads/${branch}.zip`);
        urls.push(`https://gh-proxy.com/https://github.com/${ownerRepo}/archive/refs/heads/${branch}.zip`);
      }
      urls.push(`https://github.com/${ownerRepo}/archive/refs/heads/${branch}.zip`);
      return urls;
    };

    for (const branch of branches) {
      if (downloadSuccess) break;
      const urls = getDownloadUrls(branch);
      
      for (const url of urls) {
        if (downloadSuccess) break;
        console.log(`【实物打包】尝试下载分支 ${branch}: ${url}`);
        try {
          const response = await axios({
            url: url,
            method: 'GET',
            responseType: 'stream',
            timeout: 30000 // 30秒超时
          });
          
          if (response.status === 200) {
            const writer = fs.createWriteStream(zipPath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
              writer.on('finish', resolve);
              writer.on('error', reject);
            });
            
            // 验证文件是否真的下载成功且不为空
            const stats = fs.statSync(zipPath);
            if (stats.size > 1024) { // 至少大于 1KB，避免只下了一个错误页面
              downloadSuccess = true;
              console.log(`【实物打包】源码下载成功！文件大小: ${stats.size} bytes`);
              break;
            } else {
              console.warn(`【实物打包】下载的文件太小(${stats.size} bytes)，可能无效，尝试下一个节点...`);
            }
          }
        } catch (err) {
          lastError = err;
          // 不要打印完整的堆栈，只打印 message 保持日志清晰
          console.warn(`【实物打包】节点下载失败 (${err.message})，尝试下一个...`);
        }
      }
    }

    if (!downloadSuccess) {
      throw new Error(`源码下载彻底失败，所有节点和分支均已尝试。最后一个错误: ${lastError ? lastError.message : '未知'}`);
    }

    // 2. 解压源码到 app 文件夹
    console.log(`【实物打包】正在解压...`);
    try {
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force"`);
      // 解压出来通常带一层 owner-repo-main 文件夹，为了统一放在 app 里，我们需要移动
      const extractedItems = fs.readdirSync(targetDir);
      const rootFolder = extractedItems.find(item => item !== 'app');
      
      if (rootFolder && fs.statSync(path.join(targetDir, rootFolder)).isDirectory()) {
        const rootFolderPath = path.join(targetDir, rootFolder);
        const subItems = fs.readdirSync(rootFolderPath);
        for (const item of subItems) {
          fs.renameSync(path.join(rootFolderPath, item), path.join(targetAppDir, item));
        }
        fs.rmdirSync(rootFolderPath);
      }
    } catch (e) {
      console.error('解压失败:', e);
      throw new Error('源码解压失败: ' + e.message);
    } finally {
      // 删除压缩包
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    }

    // 3. 写入外层脚本
    console.log(`【实物打包】写入配置脚本...`);
    if (packageKit.startupBat) {
      const batContent = '\ufeff' + packageKit.startupBat.replace(/\r?\n/g, '\r\n');
      fs.writeFileSync(path.join(targetDir, '双击启动.bat'), batContent, 'utf8');
    }
    if (packageKit.envSetupBat) {
      const batContent = '\ufeff' + packageKit.envSetupBat.replace(/\r?\n/g, '\r\n');
      fs.writeFileSync(path.join(targetDir, '安装环境.bat'), batContent, 'utf8');
    }
    if (packageKit.userGuide) {
      const txtContent = packageKit.userGuide.replace(/\r?\n/g, '\r\n');
      fs.writeFileSync(path.join(targetDir, '使用说明.txt'), txtContent, 'utf8');
    }

    console.log(`【实物打包】打包成功，存至: ${targetDir}`);
    
    res.json({
      success: true,
      data: {
        absolutePath: path.resolve(targetDir)
      }
    });
  } catch (error) {
    console.error('物理打包失败:', error);
    res.status(500).json({ success: false, message: error.message || '物理打包过程发生异常' });
  }
});

// 2.7. 在电脑中打开文件夹
app.post('/api/open-folder', (req, res) => {
  try {
    const { targetPath } = req.body;
    if (!targetPath) {
      return res.status(400).json({ success: false, message: '无效的路径' });
    }
    
    console.log(`【打开文件夹】${targetPath}`);
    // Windows 环境下打开文件夹
    exec(`start "" "${targetPath}"`, (error) => {
      if (error) {
        console.error('打开文件夹失败:', error);
        return res.status(500).json({ success: false, message: '打开文件夹失败' });
      }
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. 收藏 / 取消收藏仓库
app.post('/api/repositories/:id/star', async (req, res) => {
  try {
    const { id } = req.params;
    const { isStarred } = req.body; // boolean

    await db.toggleStarred(parseInt(id), isStarred);
    res.json({ success: true, isStarred });
  } catch (error) {
    console.error('修改收藏状态失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3.5. 一键生成副业引流文案 (小红书、自媒体周报、短视频脚本)
app.post('/api/repositories/:id/generate-copy', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body; // 'xiaohongshu' | 'newsletter' | 'video'

    // 获取该仓库
    const allRepos = await db.getAllRepositories(500);
    const repo = allRepos.find(r => r.id === parseInt(id));

    if (!repo) {
      return res.status(404).json({ success: false, message: '未找到指定的仓库数据' });
    }

    console.log(`【文案生成】正在为仓库 ${repo.name} 组装平台 [${type}] 的自媒体文案...`);
    const copy = await aiAnalyst.generateSocialCopy(repo, type || 'xiaohongshu');

    res.json({ success: true, copy });
  } catch (error) {
    console.error('文案生成路由错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3.6. 自媒体矩阵运营文案生成接口 (单项目支持：语气、受众和引流定制)
app.post('/api/operations/generate', async (req, res) => {
  try {
    const { id, platform, customPrompt, cta } = req.body;

    if (!id || !platform) {
      return res.status(400).json({ success: false, message: '仓库ID及发布平台为必填参数' });
    }

    // 获取该仓库
    const allRepos = await db.getAllRepositories(1000);
    const repo = allRepos.find(r => r.id === parseInt(id));

    if (!repo) {
      return res.status(404).json({ success: false, message: '未找到指定的仓库数据' });
    }

    console.log(`【自定义运营文案】正在为项目 ${repo.name} 生成 [${platform}] 格式文案... 个性化: ${customPrompt || '无'}`);
    const wechatName = process.env.WECHAT_ACCOUNT_NAME || 'GitHub 搞钱雷达';
    const result = await aiAnalyst.generateCustomOperationsCopy(repo, platform, { customPrompt, cta, wechatName });

    if (result && typeof result === 'object') {
      res.json({
        success: true,
        copy: result.copy,
        copyXhs: result.copyXhs,
        copyWechat: result.copyWechat
      });
    } else {
      res.json({ success: true, copy: result });
    }
  } catch (error) {
    console.error('单项目自媒体文案生成错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 飞书文案台账同步接口
const feishuLedgerSender = require('./push/feishuLedgerSender');
app.post('/api/feishu/sync-ledger', async (req, res) => {
  try {
    const { projectName, platform, copyText } = req.body;
    if (!projectName || !platform || !copyText) {
      return res.status(400).json({ success: false, message: '缺少必要参数 (projectName, platform, copyText)' });
    }
    
    await feishuLedgerSender.sendToLedger({ projectName, platform, copyText });
    res.json({ success: true, message: '同步飞书台账成功' });
  } catch (error) {
    console.error('同步飞书台账接口错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
// 3.7. 微信公众号多项目聚合技术周报生成接口
app.post('/api/operations/weekly', async (req, res) => {
  try {
    const { ids, customPrompt, cta } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: '请选择至少一个项目以生成周报合集' });
    }

    // 获取所有的匹配仓库
    const allRepos = await db.getAllRepositories(1000);
    const parsedIds = ids.map(id => parseInt(id));
    const matchedRepos = allRepos.filter(r => parsedIds.includes(r.id));

    if (matchedRepos.length === 0) {
      return res.status(404).json({ success: false, message: '未找到选中的任何仓库数据' });
    }

    console.log(`【聚合运营周报】正在为 ${matchedRepos.length} 个项目生成微信周报合集... `);
    const copy = await aiAnalyst.generateCustomOperationsCopy(matchedRepos, 'weekly_digest', { customPrompt, cta });

    res.json({ success: true, copy });
  } catch (error) {
    console.error('聚合运营周报生成错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 备份与恢复系统 API ====================

// 1. 获取所有备份包列表
);




// 5. 获取仪表盘概览统计数据
app.get('/api/stats', async (req, res) => {
  try {
    const allRepos = await db.getAllRepositories(1000);
    const totalCount = allRepos.length;
    
    const analyzedRepos = allRepos.filter(r => r.commercial_score >= 0);
    const analyzedCount = analyzedRepos.length;

    const highPotentialCount = allRepos.filter(r => r.commercial_score >= 75).length;
    const starredCount = allRepos.filter(r => r.is_starred === 1).length;

    const categoryStats = await db.getCategoryStats();

    res.json({
      success: true,
      data: {
        totalCount,
        analyzedCount,
        highPotentialCount,
        starredCount,
        categoryStats
      }
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5.5. 飞书一键创建并绑定多维表格 (支持飞书 CLI 一键免密钥生成)
app.post('/api/feishu/auto-create', async (req, res) => {
  try {
    console.log('【飞书集成】通过飞书 CLI 一键生成多维表格并绑定...');
    const initFeishuBitable = require('./utils/initFeishuBitable');
    await initFeishuBitable();

    // 读取最新生成的环境变量
    const spreadsheetToken = process.env.FEISHU_SPREADSHEET_ID;
    const sheetId = process.env.FEISHU_SHEET_ID;

    // 动态重载 pushService
    if (pushService) {
      pushService.feishuSheetSender.config = {
        appId: process.env.FEISHU_APP_ID || '',
        appSecret: process.env.FEISHU_APP_SECRET || '',
        spreadsheetId: spreadsheetToken,
        sheetId: sheetId
      };
    }

    res.json({
      success: true,
      spreadsheetId: spreadsheetToken,
      sheetId: sheetId,
      message: '一键自动在您的飞书账号下通过 CLI 创建多维表格并成功配置绑定！'
    });

  } catch (error) {
    console.error('一键创建飞书多维表格失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. 获取当前服务器设置（敏感数据打码处理）
app.get('/api/settings', (req, res) => {
  res.json({
    success: true,
    data: {
      port: PORT,
      githubToken: process.env.GITHUB_TOKEN ? '••••••••••••••••' : '',
      geminiApiKey: '',
      deepseekApiKey: process.env.DEEPSEEK_API_KEY ? '••••••••••••••••' : '',
      volcApiKey: process.env.VOLC_API_KEY ? '••••••••••••••••' : '',
      wechatAccountName: process.env.WECHAT_ACCOUNT_NAME || 'GitHub 搞錢雷达'
    }
  });
});

// 7. 保存服务器设置，写入 .env 并在内存中动态生效
app.post('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    const envPath = path.join(__dirname, '../.env');
    
    // 读取现有的 .env 文件以保留未修改的敏感配置值
    let currentEnvContent = '';
    if (fs.existsSync(envPath)) {
      currentEnvContent = fs.readFileSync(envPath, 'utf8');
    }

    const parseEnv = (content) => {
      const config = {};
      content.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim();
          if (key && !key.startsWith('#')) {
            config[key] = val;
          }
        }
      });
      return config;
    };

    const currentConfig = parseEnv(currentEnvContent);

    // 整合更新的配置（对于传入 "••••••••••••••••" 的加密值，代表用户没有修改，保持原状）
    const updateKey = (key, newValue) => {
      if (newValue === '••••••••••••••••' || newValue === '') {
        return currentConfig[key] || '';
      }
      return newValue;
    };

    // 只覆盖更新这四个设置，其他的设置保持 currentConfig 里的内容不变
    const newConfig = {
      ...currentConfig,
      PORT: PORT,
      GITHUB_TOKEN: updateKey('GITHUB_TOKEN', settings.githubToken),
      DEEPSEEK_API_KEY: updateKey('DEEPSEEK_API_KEY', settings.deepseekApiKey),
      VOLC_API_KEY: updateKey('VOLC_API_KEY', settings.volcApiKey),
      WECHAT_ACCOUNT_NAME: settings.wechatAccountName || 'GitHub 搞錢雷达'
    };

    // 重新组合写入 .env 文件
    let newEnvContent = `# 由系统控制台保存更新于 ${new Date().toISOString()}\n`;
    for (const [k, v] of Object.entries(newConfig)) {
      newEnvContent += `${k}=${v}\n`;
      // 动态更新当前 Node 运行环境下的进程变量
      process.env[k] = v;
    }

    fs.writeFileSync(envPath, newEnvContent, 'utf8');

    // 内存实例实时热重载
    if (newConfig.DEEPSEEK_API_KEY) {
      aiAnalyst.updateDeepseekApiKey(newConfig.DEEPSEEK_API_KEY);
    }
    if (newConfig.VOLC_API_KEY) {
      aiAnalyst.updateVolcApiKey(newConfig.VOLC_API_KEY);
    }

    res.json({ success: true, message: '配置项保存并生效成功' });
  } catch (error) {
    console.error('配置保存失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 7.5. 手动批量翻译未翻译的描述
app.post('/api/repositories/translate-pending', async (req, res) => {
  try {
    const allRepos = await db.getAllRepositories(1000);
    const untranslated = allRepos.filter(r => r.description && !r.description_zh);
    
    if (untranslated.length === 0) {
      return res.json({ success: true, message: '所有项目已完成中文翻译，无需额外操作。', count: 0 });
    }

    console.log(`【手动翻译】开始对 ${untranslated.length} 个未翻译的项目进行翻译...`);
    const translated = await aiAnalyst.translateDescriptions(untranslated);
    
    let successCount = 0;
    for (const repo of translated) {
      if (repo.description_zh) {
        await db.updateDescriptionZh(repo.id, repo.description_zh);
        successCount++;
      }
    }

    res.json({ 
      success: true, 
      message: `成功翻译并更新了 ${successCount} 个项目的中文简介！`, 
      count: successCount 
    });
  } catch (error) {
    console.error('手动批量翻译执行失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 8. 手动触发即时抓取
app.post('/api/fetch-now', async (req, res) => {
  try {
    if (!pushService) {
      return res.status(500).json({ success: false, message: '推送服务尚未启动' });
    }
    console.log('【手动请求】立即执行数据抓取...');
    // 异步执行，不阻塞请求
    pushService.fetchAndStoreData()
      .then(() => console.log('【手动抓取完成】'))
      .catch(err => console.error('手动抓取失败:', err));

    res.json({ success: true, message: '数据抓取任务已在后台排程执行，约 1-2 分钟内完成同步，请稍后刷新列表' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 8.1 获取当前是否正在抓取
app.get('/api/fetch-status', (req, res) => {
  if (!pushService) {
    return res.json({ isFetching: false });
  }
  res.json({ isFetching: pushService.isFetching === true });
});

// 9. 手动触发即时推送
app.post('/api/push-now', async (req, res) => {
  try {
    if (!pushService) {
      return res.status(500).json({ success: false, message: '推送服务尚未启动' });
    }
    console.log('【手动请求】立即执行日报推送任务...');
    // 异步执行
    pushService.performPush()
      .then(() => console.log('【手动推送执行完成】'))
      .catch(err => console.error('手动推送失败:', err));

    res.json({ success: true, message: '变现日报推送任务已在后台运行，符合高商业价值的项目将发送到您的邮箱/飞书，请注意查收。' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 10. 获取社媒话题与最新趋势分析报告
app.get('/api/social/trends', async (req, res) => {
  try {
    const trends = await db.getSocialTrends(100);
    const latestAnalysis = await db.getLatestSocialAnalysis();
    const schedulerStatus = scheduler.getStatus();
    res.json({
      success: true,
      data: {
        trends,
        report: latestAnalysis ? latestAnalysis.report : '# 暂无社媒热度报告\n\n请点击上方 **"立即抓取并进行 AI 比对"** 按钮以触发首次数据拉取与商业洞察分析。',
        scores: latestAnalysis ? (latestAnalysis.structured || []) : [],
        schedulerStatus
      }
    });
  } catch (error) {
    console.error('获取社媒监控数据失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 10.1 获取调度器状态
app.get('/api/social/scheduler-status', (req, res) => {
  res.json({ success: true, data: scheduler.getStatus() });
});

// 10.2 获取历史分析报告列表
app.get('/api/social/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await db.getSocialAnalysisHistory(limit);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 10.3 获取指定历史报告详情
app.get('/api/social/history/:id', async (req, res) => {
  try {
    const report = await db.getSocialAnalysisById(parseInt(req.params.id));
    if (!report) return res.status(404).json({ success: false, message: '未找到该历史报告' });
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 11. 手动触发即时社媒抓取与比对
app.post('/api/social/fetch-now', async (req, res) => {
  try {
    console.log('【社媒热点监控】手动触发即时社媒话题抓取...');
    const result = await scheduler.runOnce();

    if (result.skipped) {
      return res.json({ success: false, message: '上次抓取任务仍在运行中，请稍候再试' });
    }

    // 返回最新状态
    const updatedTrends = await db.getSocialTrends(100);
    const latestAnalysis = await db.getLatestSocialAnalysis();
    res.json({
      success: true,
      data: {
        trends: updatedTrends,
        report: latestAnalysis ? latestAnalysis.report : '',
        scores: latestAnalysis ? (latestAnalysis.structured || []) : [],
        schedulerStatus: scheduler.getStatus()
      }
    });
  } catch (error) {
    console.error('即时社媒抓取与比对分析执行失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 降级支持：如果前端单页路由需要支持 SPA history 路由
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 启动服务
initializeSystem().then(() => {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 GitHub 热点变现机会监控台已成功启动！`);
    console.log(`👉 访问地址：http://localhost:${PORT}`);
    console.log(`===============================================`);
  });
}).catch(err => {
  console.error('服务启动失败:', err);
});

// 退出优雅处理
process.on('SIGINT', () => {
  console.log('正在关闭服务...');
  if (pushService) pushService.stop();
  if (db) db.close();
  process.exit(0);
});
