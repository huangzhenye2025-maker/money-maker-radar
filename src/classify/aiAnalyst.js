const axios = require('axios');
const configManager = require('../config/configManager');

const VOLC_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const VOLC_VISION_MODEL = 'ep-20260605231240-tfmk9';
const VOLC_IMAGE_MODEL = 'ep-m-20260325163225-zpqr9';

class AIAnalyst {
  constructor() {
    // Legacy: was Gemini, no longer used
    this.deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
    this.volcApiKey = process.env.VOLC_API_KEY || '';
  }

  // 动态更新 API Key
  updateApiKey(newKey) {
    this.apiKey = newKey;
  }

  updateDeepseekApiKey(newKey) {
    this.deepseekApiKey = newKey;
  }

  updateVolcApiKey(newKey) {
    this.volcApiKey = newKey;
  }

  // ==================== 火山引擎 API ====================

  // 火山引擎视觉理解（多模态）—— 支持传入图片 URL 数组
  async generateVolcVisionContent(textPrompt, imageUrls = []) {
    const apiKey = this.volcApiKey || process.env.VOLC_API_KEY;
    if (!apiKey) throw new Error('VOLC_API_KEY 未配置');

    const content = [];
    content.push({ type: 'text', text: textPrompt });
    for (const url of imageUrls) {
      if (!url) continue;
      content.push({ type: 'image_url', image_url: { url } });
    }

    console.log(`【火山视觉】正在发送多模态请求，含 ${imageUrls.filter(Boolean).length} 张图片...`);
    const response = await axios.post(`${VOLC_BASE_URL}/chat/completions`, {
      model: VOLC_VISION_MODEL,
      messages: [{ role: 'user', content }],
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    if (response.data?.choices?.[0]?.message?.content) {
      return response.data.choices[0].message.content;
    }
    throw new Error('火山引擎视觉接口返回数据结构异常');
  }

  // 火山引擎文生图
  async generateVolcImage(prompt, platform) {
    const apiKey = this.volcApiKey || process.env.VOLC_API_KEY;
    if (!apiKey) throw new Error('VOLC_API_KEY 未配置');

    const size = platform === 'xiaohongshu' ? '768x1024' : '1024x576';
    console.log(`【火山文生图】正在生成 ${size} 图片...`);

    const response = await axios.post(`${VOLC_BASE_URL}/images/generations`, {
      model: VOLC_IMAGE_MODEL,
      prompt,
      size,
      n: 1
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 90000
    });

    const imageData = response.data?.data?.[0];
    if (imageData?.url) return imageData.url;
    if (imageData?.b64_json) return `data:image/png;base64,${imageData.b64_json}`;
    throw new Error('火山引擎文生图接口返回数据异常');
  }


  // 净化警告与错误信息，避免展示技术堆栈和内部 API 错误给用户
  cleanErrorMessage(errMessage) {
    if (!errMessage) return '';
    const lowerWarn = errMessage.toLowerCase();
    if (
      lowerWarn.includes('googlegenerativeai') ||
      lowerWarn.includes('deepseek') ||
      lowerWarn.includes('429') ||
      lowerWarn.includes('404') ||
      lowerWarn.includes('400') ||
      lowerWarn.includes('401') ||
      lowerWarn.includes('limit') ||
      lowerWarn.includes('quota') ||
      lowerWarn.includes('api') ||
      lowerWarn.includes('key') ||
      lowerWarn.includes('invalid') ||
      lowerWarn.includes('fetch') ||
      lowerWarn.includes('error') ||
      lowerWarn.includes('fail')
    ) {
      return 'AI 文本服务接口受限或 API Key 不正确，系统已自动启用本地高保真方案';
    }
    return errMessage;
  }

  // DeepSeek 文本生成服务 (OpenAI 兼容端)
  async generateDeepseekContent(prompt, isJson = false) {
    const currentDeepseekKey = this.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
    if (!currentDeepseekKey) {
      throw new Error('DeepSeek API Key 未配置');
    }

    console.log('正在发送请求到 DeepSeek API (deepseek-chat)...');
    
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        { role: 'user', content: prompt }
      ],
      response_format: isJson ? { type: 'json_object' } : undefined,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${currentDeepseekKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000,
      proxy: false // 禁用本地代理，防止梯子环境导致 DeepSeek (国内服务) 请求被切断 (socket hang up)
    });

    if (response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
      let content = response.data.choices[0].message.content;
      // 去除 DeepSeek R1 / Claude 常见的思维过程标签，避免被污染到最终文案和标题提取中
      content = content.replace(/<(thinking|think)>[\s\S]*?<\/\1>\s*/gi, '');
      return content;
    } else {
      throw new Error('DeepSeek 返回的数据结构不正确');
    }
  }

  // 批量翻译项目描述
  async translateDescriptions(repos) {
    try {
      const toTranslate = repos.filter(r => r.description && !r.description_zh);
      if (toTranslate.length === 0) return repos;

      const currentDeepseekKey = this.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
      if (!currentDeepseekKey) {
        console.warn('DeepSeek API Key 未配置，将直接启用免费 Google 翻译服务进行项目描述翻译');
        for (const r of toTranslate) {
          try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(r.description)}`;
            const res = await axios.get(url, { timeout: 3000 });
            if (res.data && res.data[0] && res.data[0][0] && res.data[0][0][0]) {
              r.description_zh = res.data[0][0][0];
            }
          } catch (err) {
            console.warn(`[Google 翻译失败] ${r.name}:`, err.message);
          }
        }
        return repos;
      }

      console.log(`【批量翻译】开始对 ${toTranslate.length} 个项目的英文简介进行中文翻译（DeepSeek）...`);

      const chunkSize = 30;
      for (let i = 0; i < toTranslate.length; i += chunkSize) {
        const chunk = toTranslate.slice(i, i + chunkSize);
        const listToTranslate = chunk.map(r => ({ id: r.url, text: r.description }));

        const prompt = `
你是一位专业的开源技术翻译家和科技博主。请将以下 GitHub 项目的英文描述翻译成通俗、简练、地道的中文。
翻译要求：
1. 避免直译和机器翻译腔，要翻译成技术人熟知、普通人易懂的中文短句（控制在 10-30 字之间）。
2. 保留专有名词（如 Redis, Docker, AI 等）。
3. 必须且只能返回一个 JSON 数组，数组中的每个对象结构如下：
{
  "id": "传入的对应 id，即 url 地址",
  "translation": "翻译后的中文描述"
}

输入待翻译列表：
${JSON.stringify(listToTranslate)}
`;

        try {
          const responseText = await this.generateDeepseekContent(prompt, true);
          const cleanText = responseText.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
          const translations = JSON.parse(cleanText.trim());

          if (Array.isArray(translations)) {
            const translationMap = new Map(translations.map(t => [t.id, t.translation]));
            chunk.forEach(r => {
              if (translationMap.has(r.url)) {
                r.description_zh = translationMap.get(r.url);
              }
            });
          }
        } catch (e) {
          console.warn(`[批量翻译] 第 ${Math.floor(i / chunkSize) + 1} 批翻译失败，将启用免费 Google 翻译兜底:`, e.message);
        }

        // 检查并对未成功翻译的项启用 Google 翻译兜底
        for (const r of chunk) {
          if (!r.description_zh && r.description) {
            try {
              const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(r.description)}`;
              const res = await axios.get(url, { timeout: 3000 });
              if (res.data && res.data[0] && res.data[0][0] && res.data[0][0][0]) {
                r.description_zh = res.data[0][0][0];
              }
            } catch (err) {
              console.warn(`[Google 翻译兜底失败] ${r.name}:`, err.message);
            }
          }
        }
      }
    } catch (err) {
      console.error('描述批量翻译执行失败:', err);
    }

    return repos;
  }

  // 尝试获取仓库的 README 内容以提供更准确的分析 (增加国内镜像防断网)
  async fetchReadme(repoName) {
    let ownerRepo = repoName;
    if (repoName.includes('github.com/')) {
      const parts = repoName.split('github.com/');
      ownerRepo = parts[parts.length - 1].replace(/\/$/, '');
    }

    const branches = ['main', 'master'];
    // 优先尝试各种常见的中文说明书命名规范，最后降级到默认的 README.md
    const filenames = [
      'README_zh-CN.md', 
      'README_zh.md', 
      'README-zh.md', 
      'README.zh-CN.md', 
      'README.zh.md', 
      'README_CN.md',
      'README.md'
    ];
    const useProxy = process.env.USE_CN_PROXY !== 'false';
    const baseUrl = useProxy ? 'https://ghproxy.net/https://raw.githubusercontent.com' : 'https://raw.githubusercontent.com';

    for (const branch of branches) {
      for (const filename of filenames) {
        try {
          const url = `${baseUrl}/${ownerRepo}/${branch}/${filename}`;
          const response = await axios.get(url, { timeout: 5000 });
          if (response.status === 200 && response.data) {
            // 截取前 8000 个字符，避免超出 Prompt 上下文
            return response.data.substring(0, 8000);
          }
        } catch (error) {
          // 遇到 404 等错误，静默忽略，继续尝试下一个可能的文件名
        }
      }
    }
    return '';
  }

  // 核心分析方法
  async analyzeRepository(repo) {
    const dsKey = this.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
    if (!dsKey) {
      console.warn('DeepSeek API Key 未配置，将返回模拟分析报告');
      return this.generateMockReport(repo);
    }

    try {
      // 解析 owner/repo
      let repoName = repo.name ? repo.name.replace(/\s+/g, '') : '';
      if (repo.url && repo.url.includes('github.com/')) {
        const parts = repo.url.split('github.com/');
        repoName = parts[parts.length - 1].replace(/\/$/, '');
      }
      repoName = repoName.replace(/\s+/g, '');

      console.log(`正在获取 ${repoName} 的 README...`);
      const readme = await this.fetchReadme(repoName);
      console.log(`README 获取完成，长度: ${readme.length}`);

      // 初始化 Gemini
      const prompt = `
你是一位资深的自媒体运营教练、开源工具变现专家和小红书爆款策划人。
请对以下 GitHub 开源项目进行全面的变现潜力评估（从"把GitHub硬核项目翻译打包成小白提效工具"视角）。

【项目信息】
项目名称: ${repo.name}
项目描述: ${repo.description}
主要语言: ${repo.language}
项目链接: ${repo.url}
星标数量 (Stars): ${repo.stars}
分叉数量 (Forks): ${repo.forks}

【README 详情】(截取前8000字)
${readme || '无详细 README'}

目标受众是：职场打工人（行政/HR/财务/运营）、自媒体副业淘金者、数码小白（被流氓软件绑架想要纯净工具）。
变现方式是：打包免安装绿色版在闲鱼/小红书出售（9.9元起）、录制教程卖资料包、提供代安装服务（100-300元/次）。

【打分标准特别说明】
1. **加分标准 (商业分 > 85)**：如果该项目是开箱即用的桌面应用（GUI）、浏览器插件、效率自动化脚本、自媒体/设计辅助工具，直接打极高商业分。
2. **弹性打分（针对底层库/代码算法）**：如果检测到是偏技术的底层库（如音视频处理、图片去水印、爬虫框架），**请勿一票否决**。如果它能够通过“AI编程助手（如Cursor/Trae）”用极低成本套一层简单界面（包壳）变成小白可用工具，依然保留中高分（70-85分），并在 summary 中重点输出如何“套壳变现”的路线图。
3. **降分拦截 (商业分 < 40)**：如果该项目是纯粹的开发基础设施（如前端 UI 框架、数据库中间件、网络协议库等），完全不可能被普通大众使用，强制打极低分进行拦截。

你必须严格返回纯 JSON（不含代码块标记），包含以下字段：
{
  "commercialScore": 85,
  "monetizationModels": ["打包免安装版卖闲鱼（9.9元跑量）", "代安装/代配置服务（100-300元/次）"],
  "targetAudience": ["职场打工人（行政/HR/财务）", "自媒体副业博主", "被流氓软件困扰的电脑用户"],
  "painPoints": ["重复性工作耗时费力天天加班", "同类收费软件贵且广告弹窗多"],
  "mvpFeatures": ["一键双击运行无需安装环境", "功能直观傻瓜式操作界面", "完全免费无广告纯净体验"],
  "roadmap": ["第1步：把项目打包成免安装绿色版，制作1分钟傻瓜式上手图文", "第2步：在小红书发免费平替对比测评引导评论区扣要获取工具包", "第3步：公众号沉淀精准粉丝后期接代安装服务"],
  "pricing": [
    { "tier": "免费自取版", "price": "0元", "features": ["自己动手下载安装", "参考图文教程", "社区问答互助"] },
    { "tier": "打包懒人版", "price": "9.9元", "features": ["免安装一键运行包", "1分钟上手教程", "微信答疑群"] },
    { "tier": "代装省心版", "price": "199元", "features": ["远程帮你一键安装好", "手把手教你使用", "1个月售后支持"] }
  ],
  "competitors": ["同类收费软件（价格高且广告多）", "其他操作复杂的免费工具"],
  "differentiators": ["完全免费无广告是流氓收费软件的良心平替", "打包成绿色版后普通人双击即用零门槛"],
  "summary": "该工具完全免费开源无广告，能帮助大量被重复性工作和流氓软件困扰的普通用户提效。建议打包成免安装绿色版，在小红书做免费平替测评内容引流，变现路径清晰且门槛低。",
  "xhsCategory": "视觉反差极大的一键式本地工具",
  "xhsCategoryReason": "该工具能一键帮打工人完成原本要半小时的重复工作，是典型的提效开挂神器。",
  "xhsTitlePackaging": [
    "《拯救打工人！这个免费神器帮我省了2小时加班，无脑下载！》",
    "《救命！终于找到完全免费零广告的效率神器了，同类收费软件哭晕！》",
    "《别再花冤枉钱了！GitHub上这个开源工具完全吊打付费产品！》"
  ],
  "xhsTranslationMapping": [
    { "techTerm": "基于Python开发的本地部署数据处理工具", "humanPack": "完全免费无广告的打工人提效神器" },
    { "techTerm": "开源的文件批量处理命令行工具", "humanPack": "1分钟处理100个文件，再也不用加班了" }
  ],
  "xhsMonetizationDetails": {
    "packagedProduct": "将项目打包成免安装点击即用绿色版，制作1分钟傻瓜图文指南，引导用户评论区扣要，私信引流并收取9.9元打包服务费。",
    "packagedProductCta": "软件已经帮大家打包好免安装版了，附带1分钟上手教程。评论区扣要，私信发你！",
    "deploymentService": "为需要此工具但不懂技术的用户提供一对一远程代安装/代配置服务，单次收取150-299元的服务费。",
    "deploymentServiceCta": "接单代装！10分钟帮你装好这个免费神器，再也不用被流氓软件坑了！"
  }
}

请确保 JSON 格式完全正确，所有属性名称使用英文双引号包裹，不要包含任何注释，语言使用简体中文。
`;

      console.log(`[AI评估] 正在使用 DeepSeek 分析 ${repo.name}...`);
      const dsResponseText = await this.generateDeepseekContent(prompt, true);
      const cleanDsText = dsResponseText.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
      const report = JSON.parse(cleanDsText.trim());
      console.log(`DeepSeek 分析 ${repo.name} 成功，商业评分: ${report.commercialScore}`);
      return report;

    } catch (error) {
      console.error(`AI 分析失败:`, error);
      return this.generateMockReport(repo, `分析失败: ${error.message}`);
    }
  }

  // 获取仓库文件树结构
  async fetchRepoFileTree(ownerRepo) {
    const branches = ['main', 'master'];
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = 'token ' + process.env.GITHUB_TOKEN;
    }

    for (const branch of branches) {
      try {
        const url = `https://api.github.com/repos/${ownerRepo}/git/trees/${branch}?recursive=1`;
        const response = await axios.get(url, { headers, timeout: 10000 });
        if (response.data && response.data.tree) {
          return response.data.tree.map(item => item.path);
        }
      } catch (error) {
        // 忽略单个分支获取失败，尝试下一个
      }
    }
    return [];
  }

  // 检测项目类型与框架
  detectProjectType(fileTree, language, readme) {
    const result = {
      type: 'other',
      typeChinese: '通用工具',
      buildFiles: [],
      hasDockerfile: false,
      framework: null
    };

    const fileSet = new Set(fileTree.map(f => f.toLowerCase()));
    const fileNames = fileTree.map(f => {
      const parts = f.split('/');
      return parts[parts.length - 1].toLowerCase();
    });

    // 检测 Dockerfile
    result.hasDockerfile = fileNames.includes('dockerfile') || fileTree.some(f => f.toLowerCase().includes('dockerfile'));

    // 检测项目类型
    const hasPyRequirements = fileNames.includes('requirements.txt');
    const hasSetupPy = fileNames.includes('setup.py');
    const hasPyproject = fileNames.includes('pyproject.toml');
    const hasPackageJson = fileNames.includes('package.json');
    const hasGoMod = fileNames.includes('go.mod');
    const hasCargoToml = fileNames.includes('cargo.toml');

    if (hasPyRequirements || hasSetupPy || hasPyproject) {
      result.type = 'python';
      result.typeChinese = 'Python 桌面工具';
      if (hasPyRequirements) result.buildFiles.push('requirements.txt');
      if (hasSetupPy) result.buildFiles.push('setup.py');
      if (hasPyproject) result.buildFiles.push('pyproject.toml');
    } else if (hasPackageJson) {
      result.type = 'nodejs';
      result.typeChinese = 'Node.js 应用';
      result.buildFiles.push('package.json');
    } else if (hasGoMod) {
      result.type = 'go';
      result.typeChinese = 'Go 编译型工具';
      result.buildFiles.push('go.mod');
    } else if (hasCargoToml) {
      result.type = 'rust';
      result.typeChinese = 'Rust 编译型工具';
      result.buildFiles.push('Cargo.toml');
    } else if (language) {
      // 根据语言参数降级推断
      const langLower = language.toLowerCase();
      if (langLower === 'python') {
        result.type = 'python';
        result.typeChinese = 'Python 桌面工具';
      } else if (langLower === 'javascript' || langLower === 'typescript') {
        result.type = 'nodejs';
        result.typeChinese = 'Node.js 应用';
      } else if (langLower === 'go') {
        result.type = 'go';
        result.typeChinese = 'Go 编译型工具';
      } else if (langLower === 'rust') {
        result.type = 'rust';
        result.typeChinese = 'Rust 编译型工具';
      }
    }

    // 检测框架
    const readmeLower = (readme || '').toLowerCase();
    const allText = fileTree.join(' ').toLowerCase() + ' ' + readmeLower;

    if (allText.includes('gradio')) {
      result.framework = 'gradio';
      result.typeChinese = 'Python Gradio Web 应用';
    } else if (allText.includes('streamlit')) {
      result.framework = 'streamlit';
      result.typeChinese = 'Python Streamlit Web 应用';
    } else if (allText.includes('flask')) {
      result.framework = 'flask';
      result.typeChinese = 'Python Flask Web 应用';
    } else if (allText.includes('django')) {
      result.framework = 'django';
      result.typeChinese = 'Python Django Web 应用';
    } else if (allText.includes('electron')) {
      result.framework = 'electron';
      result.typeChinese = 'Electron 桌面应用';
    } else if (allText.includes('next.js') || allText.includes('nextjs') || fileNames.includes('next.config.js') || fileNames.includes('next.config.mjs')) {
      result.framework = 'nextjs';
      result.typeChinese = 'Next.js Web 应用';
    } else if (allText.includes('react') && result.type === 'nodejs') {
      result.framework = 'react';
      result.typeChinese = 'React Web 应用';
    } else if (allText.includes('vue') && result.type === 'nodejs') {
      result.framework = 'vue';
      result.typeChinese = 'Vue Web 应用';
    }

    return result;
  }

  // 一键打包套件生成 (核心方法)
  async generatePackageKit(repo) {
    const currentDeepseekKey2 = this.deepseekApiKey || process.env.DEEPSEEK_API_KEY;

    try {
      // 解析 owner/repo
      let ownerRepo = repo.name ? repo.name.replace(/\\s+/g, '') : '';
      if (repo.url && repo.url.includes('github.com/')) {
        const parts = repo.url.split('github.com/');
        ownerRepo = parts[parts.length - 1].replace(/\/$/,  '');
      }
      ownerRepo = ownerRepo.replace(/\\s+/g, '');

      console.log(`【打包助手】正在获取 ${ownerRepo} 的 README 和文件树...`);
      const [readme, fileTree] = await Promise.all([
        this.fetchReadme(ownerRepo),
        this.fetchRepoFileTree(ownerRepo)
      ]);
      console.log(`README 长度: ${readme.length}, 文件树项数: ${fileTree.length}`);

      const projectType = this.detectProjectType(fileTree, repo.language, readme);
      console.log(`【打包助手】检测到项目类型: ${projectType.typeChinese} (${projectType.type})`);

      if (!currentDeepseekKey2) {
        console.warn('DeepSeek API Key 未配置，将返回模拟打包套件');
        return this.generateMockPackageKit(repo, projectType, readme);
      }

      let fileTreeSummary = '无法获取文件树';
      if (fileTree.length > 0) {
        const importantFiles = fileTree.filter(f => {
          const lower = f.toLowerCase();
          return !lower.includes('node_modules/') &&
                 !lower.includes('.git/') &&
                 !lower.includes('__pycache__/') &&
                 !lower.includes('.venv/') &&
                 !lower.includes('vendor/');
        }).slice(0, 100);
        fileTreeSummary = importantFiles.join('\n');
      }

      const prompt = `你是一位资深的软件打包工程师和小白用户体验专家。
请根据以下 GitHub 开源项目的信息，生成一套完整的"免安装绿色版一键打包分发套件"。

核心目标：让完全不懂技术的普通用户（小白）能够双击 .bat 文件就运行起这个项目，无需安装任何开发环境。
你生成的脚本必须能在 Windows 系统上直接运行。

**【极度重要语法规范】**
为了保证在移动硬盘（比如 D盘、E盘）上双击能够正常运行，所有 .bat 脚本的开头**必须**是：
\`\`\`bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
\`\`\`
绝对不能漏掉 /d 参数，否则无法切换盘符！

【项目信息】
项目名称: ${repo.name}
项目描述: ${repo.description}
主要语言: ${repo.language}
项目链接: ${repo.url}
检测到的项目类型: ${projectType.typeChinese}
检测到的构建文件: ${projectType.buildFiles.join(', ') || '无'}
是否有 Dockerfile: ${projectType.hasDockerfile ? '是' : '否'}
检测到的框架: ${projectType.framework || '无'}

【README 详情】(截卙6000字)
${readme ? readme.substring(0, 6000) : '无详细 README。\n[极度重要警告]由于网络原因未能抓取到README，你必须严格根据项目名称、语言和检测到的类型来推测。如果无法确定具体功能，请归类为"通用开发工具"，绝对不要凭空捏造无关的特性！'}

【项目文件结构】
${fileTreeSummary}

你必须严格返回纯 JSON（不含代码块标记），包含以下字段：
{
  "projectType": "python",
  "projectTypeChinese": "Python 桌面工具",
  "packagingDifficulty": "简单|中等|困难",
  "startupBat": "完整的双击启动.bat脚本内容",
  "envSetupBat": "完整的安装环境.bat脚本",
  "userGuide": "面向小白用户的使用说明",
  "packagingTutorial": "面向打包者的详细操作教程",
  "folderStructure": "推荐的最终分发文件夹结构",
  "estimatedPackageSize": "预估打包后的体积",
  "keyNotes": ["重要注意事项"],
  "sellingPoints": ["面向小红书/闲鱼的卖点1"]
}

请确保 JSON 格式完全正确，所有属性名使用英文双引号，不要包含任何注释，语言使用简体中文。`;

      console.log('【打包助手】正在使用 DeepSeek 生成打包套件...');
      const pkgDsResp = await this.generateDeepseekContent(prompt, true);
      const pkgCleanTxt = pkgDsResp.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
      const kit = JSON.parse(pkgCleanTxt.trim());
      console.log(`DeepSeek 打包套件生成成功，难度: ${kit.packagingDifficulty}`);
      return kit;

    } catch (error) {
      console.error(`打包套件生成失败:`, error);
      const projectType = this.detectProjectType([], repo.language, '');
      return this.generateMockPackageKit(repo, projectType, '');
    }
  }
  // 模拟打包套件生成器 (用于 API 密钥未配置或请求失败时的降级方案)
  generateMockPackageKit(repo, projectType, readme) {
    const name = repo.name || 'project';
    const desc = repo.description || '暂无描述';
    const type = projectType.type;
    const typeChinese = projectType.typeChinese;

    let startupBat = '';
    let envSetupBat = '';
    let folderStructure = '';
    let estimatedPackageSize = '';

    if (type === 'python') {
      startupBat = `@echo off
chcp 65001 >nul
title ${name} - 一键启动
cd /d "%~dp0"

echo ============================================
echo   ${name} 一键启动工具
echo ============================================
echo.

REM 检测运行时环境
if not exist "runtime\\python\\python.exe" (
    echo [错误] 未检测到 Python 运行时环境！
    echo 请先运行 "安装环境.bat" 安装必要的运行环境。
    echo.
    pause
    exit /b 1
)

echo [信息] 正在启动项目...
echo.

REM 设置 Python 路径
set PATH=%~dp0runtime\\python;%~dp0runtime\\python\\Scripts;%PATH%

REM 启动应用
if exist "app\\main.py" (
    runtime\\python\\python.exe app\\main.py
) else if exist "app\\app.py" (
    runtime\\python\\python.exe app\\app.py
) else if exist "app\\run.py" (
    runtime\\python\\python.exe app\\run.py
) else (
    echo [错误] 未找到入口文件，请检查 app 文件夹！
)

echo.
echo [信息] 程序已退出。
pause`;

      envSetupBat = `@echo off
chcp 65001 >nul
title ${name} - 环境安装
cd /d "%~dp0"

echo ============================================
echo   ${name} 运行环境自动安装
echo ============================================
echo.

if exist "runtime\\python\\python.exe" (
    echo [信息] Python 运行时环境已存在，跳过安装。
    goto install_deps
)

echo [信息] 正在下载 Python 便携版运行时...
echo.

mkdir runtime\\python 2>nul

REM 下载 Python 嵌入式版本
powershell -Command "Invoke-WebRequest -Uri 'https://registry.npmmirror.com/-/binary/python/3.11.9/python-3.11.9-embed-amd64.zip' -OutFile 'runtime\\python_embed.zip'"

echo [信息] 正在解压 Python 运行时...
tar -xf runtime\\python_embed.zip -C runtime\\python
del /f /q runtime\\python_embed.zip

REM 安装 pip
powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile 'runtime\\get-pip.py'"
runtime\\python\\python.exe runtime\\get-pip.py
del /f /q runtime\\get-pip.py

:install_deps
echo.
echo [信息] 正在安装项目依赖...
if exist "app\\requirements.txt" (
    runtime\\python\\python.exe -m pip install -r app\\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
)

echo.
echo ============================================
echo   环境安装完成！
echo   请双击 "双击启动.bat" 运行项目
echo ============================================
pause`;

      folderStructure = `${name}-绿色免安装版/
├── 双击启动.bat
├── 安装环境.bat
├── 使用说明.txt
├── app/
│   ├── main.py (或 app.py)
│   ├── requirements.txt
│   └── ... (项目源码)
└── runtime/
    └── python/
        ├── python.exe
        └── ... (Python 便携版)`;

      estimatedPackageSize = '约 150-300MB (含 Python 运行时)';

    } else if (type === 'nodejs') {
      startupBat = `@echo off
chcp 65001 >nul
title ${name} - 一键启动
cd /d "%~dp0"

echo ============================================
echo   ${name} 一键启动工具
echo ============================================
echo.

REM 检测运行时环境
if not exist "runtime\\node\\node.exe" (
    echo [错误] 未检测到 Node.js 运行时环境！
    echo 请先运行 "安装环境.bat" 安装必要的运行环境。
    echo.
    pause
    exit /b 1
)

echo [信息] 正在启动项目...
echo.

REM 设置 Node 路径
set PATH=%~dp0runtime\\node;%PATH%

REM 启动应用
cd app
if exist "package.json" (
    ..\\runtime\\node\\node.exe node_modules\\.bin\\next start 2>nul || ..\\runtime\\node\\node.exe index.js 2>nul || ..\\runtime\\node\\node.exe app.js 2>nul || ..\\runtime\\node\\node.exe server.js
)
cd ..

echo.
echo [信息] 程序已退出。
pause`;

      envSetupBat = `@echo off
chcp 65001 >nul
title ${name} - 环境安装
cd /d "%~dp0"

echo ============================================
echo   ${name} 运行环境自动安装
echo ============================================
echo.

if exist "runtime\\node\\node.exe" (
    echo [信息] Node.js 运行时环境已存在，跳过安装。
    goto install_deps
)

echo [信息] 正在下载 Node.js 便携版运行时...
echo.

mkdir runtime 2>nul

REM 下载 Node.js 便携版
powershell -Command "Invoke-WebRequest -Uri 'https://registry.npmmirror.com/-/binary/node/v20.11.0/node-v20.11.0-win-x64.zip' -OutFile 'runtime\\node_portable.zip'"

echo [信息] 正在解压 Node.js 运行时...
mkdir runtime\\temp 2>nul
tar -xf runtime\\node_portable.zip -C runtime\\temp
move runtime\\temp\\node-v20.11.0-win-x64 runtime\\node
rmdir /s /q runtime\\temp
del /f /q runtime\\node_portable.zip

:install_deps
echo.
echo [信息] 正在安装项目依赖...
cd app
if exist "package.json" (
    ..\\runtime\\node\\npm install --registry=https://registry.npmmirror.com
)
cd ..

echo.
echo ============================================
echo   环境安装完成！
echo   请双击 "双击启动.bat" 运行项目
echo ============================================
pause`;

      folderStructure = `${name}-绿色免安装版/
├── 双击启动.bat
├── 安装环境.bat
├── 使用说明.txt
├── app/
│   ├── package.json
│   ├── index.js (或 app.js)
│   └── ... (项目源码)
└── runtime/
    └── node/
        ├── node.exe
        ├── npm
        └── ... (Node.js 便携版)`;

      estimatedPackageSize = '约 100-250MB (含 Node.js 运行时)';

    } else if (type === 'go' || type === 'rust') {
      startupBat = `@echo off
chcp 65001 >nul
title ${name} - 一键启动
cd /d "%~dp0"

echo ============================================
echo   ${name} 一键启动工具
echo ============================================
echo.

REM 编译型项目直接运行二进制文件
if exist "app\\${name}.exe" (
    echo [信息] 正在启动项目...
    app\\${name}.exe
) else if exist "app\\main.exe" (
    echo [信息] 正在启动项目...
    app\\main.exe
) else (
    echo [错误] 未找到可执行文件，请检查 app 文件夹！
    echo 提示：请确保已将编译好的 .exe 文件放入 app 文件夹中。
)

echo.
echo [信息] 程序已退出。
pause`;

      envSetupBat = `@echo off
chcp 65001 >nul
title ${name} - 环境说明
cd /d "%~dp0"

echo ============================================
echo   ${name} 环境说明
echo ============================================
echo.
echo 此项目已编译为可执行文件，无需安装额外的运行环境！
echo.
echo 请直接双击 "双击启动.bat" 运行项目即可。
echo.
echo ============================================
pause`;

      folderStructure = `${name}-绿色免安装版/
├── 双击启动.bat
├── 安装环境.bat (仅说明，无需运行)
├── 使用说明.txt
└── app/
    ├── ${name}.exe (编译后的可执行文件)
    └── ... (配置文件等)`;

      estimatedPackageSize = '约 10-50MB (已编译二进制)';

    } else {
      startupBat = `@echo off
chcp 65001 >nul
title ${name} - 一键启动
cd /d "%~dp0"

echo ============================================
echo   ${name} 一键启动工具
echo ============================================
echo.
echo [信息] 正在启动项目...
echo 请参阅 使用说明.txt 了解详细的运行方式。
echo.

if exist "app\\main.exe" (
    app\\main.exe
) else if exist "app\\start.bat" (
    call app\\start.bat
) else (
    echo [提示] 请查阅使用说明.txt 获取运行方法。
)

echo.
pause`;

      envSetupBat = `@echo off
chcp 65001 >nul
title ${name} - 环境安装
cd /d "%~dp0"

echo ============================================
echo   ${name} 运行环境安装
echo ============================================
echo.
echo 请参阅 使用说明.txt 了解此项目所需的运行环境。
echo.
pause`;

      folderStructure = `${name}-绿色免安装版/
├── 双击启动.bat
├── 安装环境.bat
├── 使用说明.txt
└── app/
    └── ... (项目文件)`;

      estimatedPackageSize = '视项目而定';
    }

    const userGuide = `📖 ${name} 使用说明
============================================

👋 欢迎使用 ${name}！
📝 功能简介：${desc}

🚀 使用步骤（超级简单，只需3步）：

1️⃣ 第一步：安装环境
   双击运行 "安装环境.bat"
   等待自动下载和安装完成（首次需要联网）
   ⏱️ 大约需要 2-5 分钟

2️⃣ 第二步：启动项目
   双击运行 "双击启动.bat"
   看到界面后就可以开始使用了！

3️⃣ 第三步：开始使用
   🎉 尽情享受吧！

⚠️ 注意事项：
- 文件夹路径中请不要包含中文或空格
- 首次运行需要联网下载依赖
- 如遇到防火墙提示，请点击"允许访问"
- 如有问题，请参阅项目主页：${repo.url || ''}

============================================
💡 温馨提示：觉得好用就分享给朋友吧！`;

    const packagingTutorial = `📦 ${name} 打包教程（面向打包者）
============================================

🎯 目标：将 ${name} 从 GitHub 源码打包成免安装绿色版

📋 操作步骤：

第 1 步：下载源码
   - 打开项目主页：${repo.url || 'https://github.com/' + name}
   - 点击绿色的 "Code" 按钮
   - 选择 "Download ZIP" 下载源码压缩包
   - 解压到任意文件夹

第 2 步：准备目录结构
   - 新建一个文件夹，命名为 "${name}-绿色免安装版"
   - 在里面创建 "app" 子文件夹
   - 将解压出来的所有源码文件复制到 "app" 文件夹中

第 3 步：放入启动脚本
   - 将生成的 "双击启动.bat" 放到根目录
   - 将生成的 "安装环境.bat" 放到根目录
   - 将生成的 "使用说明.txt" 放到根目录

第 4 步：测试运行
   - 先双击 "安装环境.bat" 安装运行环境
   - 再双击 "双击启动.bat" 验证项目能否正常运行
   - 确认无误后即可打包分发

第 5 步：打包分发
   - 将整个文件夹压缩为 .zip 文件
   - 上传到网盘（百度网盘/阿里云盘）
   - 在闲鱼/小红书发布售卖

============================================
💰 定价建议：9.9-29.9 元 (打包懒人版)`;

    return {
      projectType: type,
      projectTypeChinese: typeChinese,
      packagingDifficulty: (type === 'go' || type === 'rust') ? '简单' : '中等',
      startupBat,
      envSetupBat,
      userGuide,
      packagingTutorial,
      folderStructure,
      estimatedPackageSize,
      keyNotes: [
        '文件夹路径中不要包含中文或空格，否则可能导致运行出错',
        '首次运行 "安装环境.bat" 需要联网，请确保网络通畅',
        '如遇到 Windows 防火墙或安全提示，请点击"允许"或"仍要运行"',
        '打包分发前请自行测试运行，确保功能正常'
      ],
      sellingPoints: [
        `【${typeChinese}】${desc} - 免安装绿色版，双击即用！`,
        '无需安装任何开发环境，小白也能轻松上手，解压即用',
        '附带详细使用说明和一键启动脚本，1分钟上手'
      ]
    };
  }

  // 智能自媒体推文/文案生成器 (助力副业引流变现)
  async generateSocialCopy(repo, type) {
    const dsKeyForSocialCopy = this.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
    const wechatName = process.env.WECHAT_ACCOUNT_NAME || 'GitHub 搞钱雷达';
    if (!currentKey) {
      return this.generateMockSocialCopy(repo, type, { wechatName });
    }

    let prompt = '';
    try {
      const report = typeof repo.ai_report === 'string' ? JSON.parse(repo.ai_report) : repo.ai_report;
      
      let platformPrompt = '';
      if (type === 'xiaohongshu') {
        platformPrompt = `
你是一位资深自媒体爆款教练、搞钱大师和小红书运营专家。
请根据以下 GitHub 开源项目信息，为小红书平台定制一篇【引流诱饵】图文文案（主打：视觉冲击 + 结果展示）。

项目信息:
- 项目名称: ${repo.name}
- 描述: ${repo.description}
- 主要语言: ${repo.language}
- 商业评分: ${repo.commercial_score || 80}
- 商业评估报告: ${JSON.stringify(report || {})}
- 项目README（截取）: ${readmeContent ? readmeContent.substring(0, 3000) : '无'}

请根据项目的核心功能，智能匹配合适的受众和吸睛风格。

【多样化与定制化要求（极度重要！）】：
1. **千篇一律是死忌！** 每次生成必须采用**完全不同**的切入角度（例如：有时用痛点放大起手，有时用好奇心悬念起手，有时用夸张结果对比起手，有时用个人故事经验起手）。
2. **深度人群分析**：根据项目真实功能，分析它最匹配的具体人群（比如是设计师、自媒体人、学生还是程序员），并在文案中精准击中这类人的焦虑和痛点。
3. **打破僵化结构**：不要每次都用固定的“一二三步”标题！请根据每次的切入角度，自由发挥、创造独特的吸睛小标题（例如：“还在傻傻加班？”、“惊呆了，还能这么玩”、“被老板骂醒后的领悟”等）。

【内容底线要求】：
- 你必须明确、具体地介绍这个工具到底是干什么的！绝对不能通篇都是假大空的营销套话！
- 严禁捏造该项目没有的功能。严禁使用“克隆仓库”、“运行环境”等小白不懂的技术词。用大白话解释。

【工作流程】：
第一步：在 <thinking> 标签内分析：1) 项目真实功能和最契合的人群；2) 本次文案打算采用哪种独特的吸睛结构和切入点；3) 如何将技术转化为大白话亮点；4) 如何设计变现/引流策略。
第二步：输出文案正文。

【严格输出格式（绝对遵守！）】：
1. 绝对不要输出任何寒暄、开场白（如“好的”、“收到指令”、“为你撰写”等废话）！直接开始文案正文。
2. 不要给出多个标题选项！直接精选出 1 个最炸裂的标题，并严格放在全文的第 1 行，使用一级标题格式，例如：
# 你的炸裂标题内容
3. 在标题之后，空一行，然后正常输出文案正文。

【文案必须包含的元素（表现形式可自由发挥）】：
1. **唯一且极具吸引力的标题**（只选1个最炸裂的，放在第一行，必须以 # 开头）
2. **场景化痛点与大白话功能亮点**（强烈的对比感）
3. **针对该人群的变现或使用落地建议**（可以提怎么用它搞钱，或者怎么用它摸鱼/省时间）
4. **【核心引流钩子】**（必须在文案末尾巧妙地融入以下内容，并根据项目拟定一个相关暗号，比如‘自动化’）：
   “因为平台不让放链接，工具的免安装打包版和一键运行教程，我已经完整整理好了。大家可以去微信看我的同名公众号：【${wechatName}】，回复暗号 ‘[此处填写AI拟定的暗号]’ 就能直接获取啦！”
5. **热门引流标签** (6-8个标签，以 # 开头)

请使用简体中文，排版务必**空行透气、段落极短**，多带各种可爱的 Emoji，以极大提升在手机上的阅读顺畅感。
`;
      } else if (type === 'newsletter') {
        platformPrompt = `
生成一篇深度科技商业周报/Newsletter的文章段落。
结构要求：
1. 【专栏标题】：一个体现科技深度与商业敏锐度的标题。
2. 【技术创新点与市场缺口】：深度剖析该项目的技术闪光点，以及它解决了哪些传统昂贵商业软件无法低成本解决的刚需痛点。
3. 【商业化路径与定价构想】：拆解其 OpenCore 或是 Cloud 托管的商业闭环设计，并提供建议性的收费阶梯。
4. 【商业化洞察与前景展望】：给副业/技术创作者提供极具商业判断力的前景分析。
5. 风格要严谨、有深度、客观、专业，结构排版利于网页阅读。
`;
      } else if (type === 'video') {
        platformPrompt = `
生成一个 60 秒的短视频（抖音/视频号/B站/TikTok）口播脚本。
结构要求：
分段展示，每段包含：【画面指示】和【旁白口播】。
1. 【黄金3秒黄金吸睛】：用极度抓人的问句或震惊痛点开头（例如：“你敢信？这个 GitHub 刚刚开源的神仙项目，已经有人在偷偷用它包装赚钱了…”）。
2. 【痛点剖析与项目引出】：通俗展示大众面临的麻烦，然后推出这个“平替神器”。
3. 【算一笔账/变现模式】：为什么全托管或者本地服务能轻松收高溢价订阅费？
4. 【CTA 行动呼吁】：引导关注、收藏，或者引导去获取全套独立开发套壳部署方案。
口语化要极强，抑扬顿挫，富有激情和节奏感。
`;
      }

      prompt = `
你是一位资深的网络爆款文案专家、自媒体运营大V、独立开发导师和商业化教练。
请根据以下 GitHub 项目信息及其已有的商业报告，生成一篇定制的【${type === 'xiaohongshu' ? '小红书种草引流文案' : type === 'newsletter' ? '科技商业Newsletter周报' : '60秒短视频口播脚本'}】。

【项目信息】
项目名称: ${repo.name}
项目描述: ${repo.description}
主要语言: ${repo.language}
商业评分: ${repo.commercial_score || 80}

【已有商业诊断报告数据】
${JSON.stringify(report || {})}

${platformPrompt}
`;

      console.log(`正在为 ${repo.name} 生成 ${type} 自媒体引流文案...`);const response = await this.generateDeepseekContent(prompt, false);
      return response.trim();
    } catch (err) {
      console.error('AI 自媒体文案生成失败:', err);
      return this.generateMockSocialCopy(repo, type, { wechatName, error: err.message });
    }
  }

  // 模拟推文文案生成器 (用于 API 密钥未配置或请求失败时的降级方案)
  generateMockSocialCopy(repo, type, { wechatName = 'GitHub 搞钱雷达', error = '' } = {}) {
    const cleaned = this.cleanErrorMessage(error);
    const errorPrefix = cleaned ? `【⚠️AI生成受阻 - 触发高保真降级系统：${cleaned}】\n\n` : '';
    const lang = repo.language || '未知';
    const desc = repo.description || '暂无项目描述';
    
    if (type === 'xiaohongshu') {
      return `${errorPrefix}✨ 搞钱警报！这个 GitHub 新晋黑马要火了！ 🚀\n\n🔥 发现一个超级神仙的开源项目：【${repo.name}】！它简直是打工人的福音，专门治愈：${desc}！\n\n💡 打工人/副业党提效搞钱的终极思路：\n1️⃣ 【低客单价跑量】：打包成 exe 绿色版，配合傻瓜式图文指南，并在小红书引导评论区“扣1/要”获取免安装包！\n2️⃣ 【高客单价服务】：提供一次性部署与服务器代搭建配置服务，单次收费 ¥199-599。\n\n🪝 【一鱼两吃 · 核心引流钩子】：\n因为平台不让放链接，工具的免安装打包版和一键运行教程，我已经完整整理好了。大家可以去微信看我的同名公众号：【${wechatName}】，回复暗号 ‘一键运行’ 就能直接获取啦！\n\n#搞钱 #打工人神器 #副业 #开源项目 #提效工具 #纯净无广告 #小红书爆款 #信息差`;
    } else if (type === 'newsletter') {
      return `${errorPrefix}📊 科技商业周报：关于开源项目 ${repo.name} 的商业化推演\n\n本周在开源社区飙升的 ${repo.name}（基于 ${lang}）展示了强大的开发生态。其主要解决了“${desc}”这一核心刚需痛点。\n\n【商业路径分析】：\n该项目的商业闭环适合“信息差打包分发”或“代安装服务”。大量职场打工人和自媒体创作者有强烈的提效需求，但完全不懂技术。将开源版本打包成免安装绿色版、录制保姆级使用教程，在闲鱼和小红书分发，可以快速低成本变现。\n\n【副业变现建议】：\n建议先在小红书发布"对比测评：免费开源 VS 收费软件"引流笔记，然后在公众号提供打包版下载和安装教程，持续积累精准粉丝，后期可承接付费代安装、企业培训等高客单价服务。`;
    } else {
      return `${errorPrefix}【60秒口播视频脚本：${repo.name} 开源变现指南】\n\n【画面】：主播表情神秘，手指向屏幕\n【口播】：你敢信？这个 GitHub 刚开源的项目，已经有人在偷偷月入过万了！这就是刚冲上榜首的 ${repo.name}！\n\n【画面】：切入项目网页，展示功能亮点\n【口播】：它究竟是干嘛的？简单来说，它基于 ${lang}，专门解决“${desc}”的头疼麻烦。很多公司离不开它，但自己部署又非常折腾，服务器还容易崩！\n\n【画面】：主播拿着计算器，展示订阅收益\n【口播】：这就是信息差商机！你把它打包成免安装绿色版，在闲鱼挂上去卖 9.9 元，或者帮人远程安装一次收 100 元。一天卖 50 单就是 500 元纯被动收入，关键零成本！\n\n【画面】：引导点赞收藏\n【口播】：点击收藏，主页还有更多纯净提效神器的打包版，赶紧行动起来！`;
    }
  }

  // 核心高级运营文案生成器 (支持定制和引流)
  async generateCustomOperationsCopy(repoOrRepos, type, { tone, audience, customPrompt, cta, wechatName = 'GitHub 搞钱雷达', planetName = '' }) {
    const dsKeyCheck = this.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
    if (!dsKeyCheck) {
      return this.generateMockCustomOperationsCopy(repoOrRepos, type, { tone, audience, customPrompt, cta, wechatName, planetName });
    }

    let xhsPrompt = '';
    let wechatPrompt = '';
    let momentsPrompt = '';
    let prompt = '';
    try {
      // 附加个性化定制要求
      const customPromptText = customPrompt ? `\n\n【用户特殊定制要求】：\n${customPrompt}\n请严格参考并融合上述定制要求进行内容创作。` : '';
      const ctaText = cta ? `\n\n📌 运营引流动作 (CTA)：\n- 目标引流社群：${planetName || '您的知识星球/高端社群'}\n- 入群引导话术：${cta}\n(请将上述引流信息极其自然地融入到文案的结尾部分，不要生硬拼接)` : '';

      // 动态分析指令：让 AI 根据原项目的 README 自动判断受众群体和文案语气
      const toneInjection = `

【🎯 极重要——动态受众与语气分析，必须全程100%贯彻！】
1. **自动受众定位**：请先仔细阅读上述项目 README（截取）和描述。分析该项目最适合什么样的人群？（例如：是面临中年危机的打工人、寻找副业机会的淘金者、还是完全不懂技术的数码小白？）
2. **自动风格适配**：根据你定位出的人群，自动匹配最能击中他们痛点和爽点的文案语气风格。
   - 如果是打工人，多用“不用辞职”、“下班就能做”等字眼，带点烟火气。
   - 如果是副业淘金者，多强调“信息差”、“搞钱”、“零成本变现”。
   - 如果是小白，必须用大白话，绝对不要有专业代码术语，强调“极简”、“傻瓜式”。
   - 也可以使用幽默梗文、硬核分析等其他任何你认为最能抓眼球的风格。

⚠️ 警告：在生成正式文案前，请先在 <thinking> 标签内明确写出你推导出的【目标人群画像】和【选定的文案语气风格】。你的整个文案，从标题到正文到引流词，必须100%匹配你选定的风格和特征。不得流于通用套话。`;

      // 如果是多选周报合集，保持原有逻辑
      if (type === 'weekly_digest') {
        const repos = Array.isArray(repoOrRepos) ? repoOrRepos : [repoOrRepos];
        const reposDataText = repos.map((r, index) => {
          const report = typeof r.ai_report === 'string' ? JSON.parse(r.ai_report) : r.ai_report;
          return `
---
[项目 #${index + 1}]
项目名称: ${r.name}
项目描述: ${r.description}
主要语言: ${r.language} (Stars: ${r.stars}, Forks: ${r.forks})
项目链接: ${r.url}
商业评分: ${r.commercial_score || 80}
AI变现大纲: ${JSON.stringify(report || {})}
`;
        }).join('\n');

        prompt = `
你是一位顶级科技商业分析师与微信公众号运营大V（拥有百万技术粉丝）。
请根据以下捕获的 ${repos.length} 个最新 GitHub 高潜力开源项目，撰写一篇极具爆款潜质的技术商业周报/干货推文。

${reposDataText}

请结合以下要求进行深度创作与精美排版：
${customPromptText}

【微信公众号周报文章结构要求】：
1. **吸睛周报大标题**：设计 3 个符合自媒体传播学、科技与金钱碰撞感的公众号标题供用户选择。
2. **前沿视点 (Editorial Intro)**：撰写一段精彩的行业导言，指出开源大潮中隐藏的新生商业机会。
3. **技术搞钱黑马盘点 (The Stars)**：对这 ${repos.length} 个项目逐一进行深度剖析，必须包含：
   - 它是谁？解决了什么痛点？
   - 独立开发者或创业团队如何利用它切入市场（包装成 SaaS、自托管、汉化部署等变现路径）？
4. **横向商业潜力对比表**：使用 Markdown 绘制一个表格，横向对比这几个项目的：【项目名称】、【核心亮点】、【技术门槛】、【商业化评分】、【推荐变现模式】。
5. **落地避坑指南**：给出副业落地时的关键建议（如域名、合规、计费网关等）。
${ctaText}

请使用简体中文，排版务必优雅考究，标题层级清晰，使用符合微信公众号美学的排版分割线，直接便于粘贴发布。
`;
        console.log('【AI周报/社AI分析】正在使用 DeepSeek...');
        const dsModelResult = await this.generateDeepseekContent(prompt, false);
        if (typeof dsModelResult === 'string' && dsModelResult.includes('PART_1')) {
          return this.parseAnalysisResult(dsModelResult.trim());
        }
        return dsModelResult.trim();
      }

      // 单个项目的“一鱼两吃”生成模式：同时并行生成小红书和公众号推文！
      const repo = Array.isArray(repoOrRepos) ? repoOrRepos[0] : repoOrRepos;
      const report = typeof repo.ai_report === 'string' ? JSON.parse(repo.ai_report) : repo.ai_report;

      let repoName = repo.name ? repo.name.replace(/\s+/g, '') : '';
      if (repo.url && repo.url.includes('github.com/')) {
        const parts = repo.url.split('github.com/');
        repoName = parts[parts.length - 1].replace(/\/$/, '');
      }
      
      // 为了防止用户跳过AI分析直接生成文案导致 AI“无米之炊”产生幻觉，这里强制拉取 README
      let readmeContent = '无详细 README';
      try {
        readmeContent = await this.fetchReadme(repoName);
      } catch (e) {
        console.warn(`拉取 README 失败，将仅使用基本信息: ${e.message}`);
      }

      // 新增：红狐文案技能整合 (提取搜索关键词)
      let searchKeyword = '开源工具'; // 默认保底词
      if (type === 'xiaohongshu' || type === 'wechat' || type === 'all') {
        try {
          console.log(`【红狐技能】正在为项目 ${repo.name} 提取搜索关键词...`);
          const keywordPrompt = `请根据以下 GitHub 项目的信息，提取一个适合作为核心卖点的搜索关键词（例如“AI工具”、“搞钱副业”、“效率神器”、“爬虫教程”等），只需输出一个词，不要有任何标点符号。项目名称：${repo.name}。描述：${repo.description}`;
          try {
            const kwText = await this.generateDeepseekContent(keywordPrompt, false);
            searchKeyword = kwText.trim().replace(/[^\w\u4e00-\u9fa5]/g, '').slice(0, 20) || '开源工具';
          } catch(e) {
             console.warn('提取关键词失败，使用默认词:', e.message);
          }
          console.log(`【红狐技能】提取到搜索关键词：[${searchKeyword}]`);
        } catch (e) {
          console.warn('提取搜索关键词外层捕获错误:', e.message);
        }
      }

      // 并发执行小红书和公众号的红狐数据拉取，极大缩短等待时间
      let xhsHotItemsJson = '[]';
      let wechatHotItemsJson = '[]';
      
      const fetchTasks = [];
      
      if (type === 'xiaohongshu' || type === 'wechat' || type === 'all') {
        fetchTasks.push((async () => {
          try {
            console.log(`【红狐技能】正在调用 API 获取最新 50 条小红书爆款笔记...`);
            const redfoxXhs = require('../fetch/redfoxXhs');
            const hotNotesData = await redfoxXhs.fetchXhsHotNotes(searchKeyword, { maxItems: 50 });
            xhsHotItemsJson = JSON.stringify(hotNotesData.items || []);
            console.log(`【红狐技能】成功获取 ${hotNotesData.items?.length || 0} 条小红书爆款笔记！`);
          } catch (e) {
            console.warn(`【红狐技能】抓取小红书爆款笔记失败: ${e.message}`);
          }
        })());

        fetchTasks.push((async () => {
          try {
            console.log(`【红狐技能】正在调用 API 获取最新 10 条微信公众号爆款文章...`);
            const redfoxWechat = require('../fetch/redfoxWechat');
            const hotWechatData = await redfoxWechat.searchHotArticle(searchKeyword, { maxItems: 10 });
            wechatHotItemsJson = JSON.stringify(hotWechatData.items || []);
            console.log(`【红狐技能】成功获取 ${hotWechatData.items?.length || 0} 条公众号爆款文章！`);
          } catch (e) {
            console.warn(`【红狐技能】抓取微信公众号爆款文章失败: ${e.message}`);
          }
        })());
      }
      
      if (fetchTasks.length > 0) {
        await Promise.all(fetchTasks);
      }

      // 1. 生成小红书“诱饵”文案 (重构为 SKILL.md 红狐爆款模式)
      xhsPrompt = `
你是一位资深自媒体爆款教练、搞钱大师和小红书运营专家。
请根据以下 GitHub 开源项目信息，为小红书平台定制一篇【引流诱饵】图文文案。

【项目基本信息】:
- 项目名称: ${repo.name}
- 描述: ${repo.description}
- 主要语言: ${repo.language}
- 项目README（截取）: ${readmeContent ? readmeContent.substring(0, 3000) : '无'}

【红狐数据支持 - 最新50条相关爆款笔记】:
${xhsHotItemsJson.length > 10 ? xhsHotItemsJson.substring(0, 15000) : '暂无数据，请自行发挥'}

请结合以下参数与风格润色撰写：
${customPromptText}
${toneInjection}

【执行步骤】（必须严格执行）：
Step 1：在 <thinking> 中分析传入的爆款笔记数据。总结高互动标题的共同特征（数字、情绪词等）、热门笔记的内容结构与切入角度、以及高频出现的标签类型。
Step 2：结合上述爆款规律和该开源项目的功能亮点，构思吸睛的小红书文案。严禁通篇营销废话，必须明确大白话介绍工具用途。文末必须包含极具诱惑力的【高端社群引流钩子】："因为平台不让放链接，我把这个神器的完整免安装包、独家图文教程，全都放在我的【${planetName || '高阶搞钱内部知识星球/VIP圈子'}】里了。大家可以去微信找我的同名公众号：【${wechatName}】，回复暗号 ‘[此处填写AI拟定的暗号]’，不仅能获取今天这个工具，还能加入我们的高配圈子，每天获取独家信息差！"
Step 3：严格按照以下格式输出你的文案内容！不要包含任何卡片设计或图片路径。

### 输出格式（必须严格遵守）

\`\`\`
### 推荐标题
1. [标题1]
2. [标题2]
3. [标题3]

### 正文内容
[完整可发布的正文，空行透气，多用Emoji，分点说明]

### 推荐标签
#标签1 #标签2 #标签3 #标签4 #标签5

### 爆款公式来源
**参考的爆款规律**：[简述提炼的爆款公式，如"数字型标题 + 痛点开场 + 分点干货 + 互动收尾"]

**参考的爆款笔记**（如果有传入爆款数据，请列出2-3篇核心参考笔记）：
1. [笔记标题](noteLink) - [@作者名](authorLink) - 互动数据：收藏 X / 分享 X / 评论 X / 点赞 X
2. ...
\`\`\`
${ctaText}
`;


      // 2. 生成微信公众号“干货包”文案 (重构为 SKILL.md 红狐爆款模式)
      wechatPrompt = `
你是一位硬核科技自媒体主笔、资深独立开发导师和开源商业化专家。
请根据以下 GitHub 开源项目信息，撰写一篇微信公众号深度长图文干货。

【项目基本信息】:
- 项目名称: ${repo.name}
- 描述: ${repo.description}
- 主要语言: ${repo.language}
- 项目README（截取）: ${readmeContent ? readmeContent.substring(0, 3000) : '无'}

【红狐数据支持 - 最新10篇10w+公众号爆文数据】:
${wechatHotItemsJson.length > 10 ? wechatHotItemsJson.substring(0, 20000) : '暂无数据，请自行发挥'}

请根据以下参数深度润色：
${customPromptText}
${toneInjection}

【执行步骤】（必须严格执行）：
Step 0.5：差异化优势拆解。分析该项目相比同类工具的区别（输入差异、流程差异、输出差异、定位差异），提炼出 3-5 条核心优势。
Step 1：在 <thinking> 中分析传入的爆款文章数据，提炼能够引发用户焦虑、好奇或收藏欲的切入点。
Step 2：标题发散。必须打破千篇一律的格式，构思 3 条【风格完全迥异】的标题（微信公众号标题建议在 35-50 个字左右，必须信息量丰富、足够吸引人，但绝不能超过 60 个字）：
  - 标题A【情绪痛点型】：直击目标受众最大的焦虑或痛点。
  - 标题B【反常识猎奇型】：打破常规认知，制造极强的点击好奇心。
  - 标题C【直白干货型】：数字先行，强调极高价值的“资源/教程”属性。
Step 3：长文创作。以爆款结构为骨架，写一篇 1500 字左右的深度图文，融合 Step 0.5 的优势，必须给出小白极速运行指南，结尾处自然引入“付费社群/知识星球”转化。

文末必须包含以下极具诱惑力的社群引流结构：
"💎 加入【\${wechatName} 高阶内部知识星球/VIP群】
今天介绍的免安装绿色版工具和专属一键部署脚本，我已经上传到了我们的内部社群资料库。
加入我们，你还能立刻获得：
1. 🌟 每天 1 个绝密海外搞钱开源情报（带打包好的免安装包）
2. 🚀 大佬手把手 1 对 1 技术答疑与指导
3. 🤝 破局副业瓶颈、打破信息茧房的高端人脉圈
👉 关注公众号后台回复【入圈】或【加群】，获取今日限量早鸟特价名额！"

Step 4：严格按照以下格式输出！

### 输出格式（必须严格遵守）

\`\`\`
### 推荐标题
* 【情绪痛点型】 [字数在40字左右的爆款长标题，信息量充足，吸引力强]
* 【反常识猎奇型】 [字数在40字左右的爆款长标题，信息量充足，吸引力强]
* 【直白干货型】 [字数在40字左右的爆款长标题，信息量充足，吸引力强]

### 正文内容
[完整可发布的正文，1500字左右，排版良好，段落清晰]

**核心观点**：[一句话概括]

### 推荐标签
#标签1 #标签2 #标签3 #标签4 #标签5

### 差异化优势
**优势1**：
- 优势描述：[一句话]
- 与竞品对比差异：[说明]
...

### 爆款公式来源
**数据来源说明**：以下规律来自真实爆款数据。
**参考的爆款规律**：
1. **标题规律**：...
2. **结构规律**：...
3. **高频关键词**：...

**参考的爆款文章**（如果有传入数据，列出参考的文章）：
1. [文章标题](noteLink) - 作者：[作者名] - 阅读数：X / 点赞：X
...
\`\`\`
${ctaText}
`;

      
      // 3. 朋友圈极短剧本 (高转化文案)
      momentsPrompt = `
你是一位私域变现大师。请根据以下项目，写一条极简、极具诱惑力的微信朋友圈发售/引流剧本。
要求：
1. 字数极少（不超过 100 字）。
2. 第一句话抛出极强痛点或效果截图的描述。
3. 最后一句话引导评论或私信入群。
4. 格式：
   【文案】：...
   【配图建议】：... (例如建议放一张跑通收益的截图，或工具界面的截图)

项目名称: ${repo.name}
项目描述: ${repo.description}
入群要求: ${cta || '门槛未定'}
星球名称: ${planetName || '私有圈子'}
`;

      console.log('【AI一鱼三吃】正在并行发起 DeepSeek 小红书、微信公众号和朋友圈文案生成...');

      const [dsCopyXhs, dsCopyWechat] = await Promise.all([
        this.generateDeepseekContent(xhsPrompt, false),
        this.generateDeepseekContent(wechatPrompt, false)
      ]);
      return {
        copyXhs: dsCopyXhs.trim(),
        copyWechat: dsCopyWechat.trim(),
        copy: type === 'xiaohongshu' ? dsCopyXhs.trim() : dsCopyWechat.trim()
      };

    } catch (err) {
      if (type !== 'weekly_digest') {
        console.warn(`Gemini 运营文案一鱼两吃生成失败 (${err.message})，尝试使用 DeepSeek 备用通道...`);
        const currentDeepseekKey = this.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
        if (currentDeepseekKey) {
          try {
            console.log(`【AI一鱼三吃备用通道】正在并行发起 DeepSeek...`);
            const [dsCopyXhs, dsCopyWechat] = await Promise.all([
              this.generateDeepseekContent(xhsPrompt, false),
              this.generateDeepseekContent(wechatPrompt, false)
            ]);
            return {
              copyXhs: dsCopyXhs.trim(),
              copyWechat: dsCopyWechat.trim(),
              copy: type === 'xiaohongshu' ? dsCopyXhs.trim() : dsCopyWechat.trim()
            };
          } catch (dsErr) {
            console.error('DeepSeek 一鱼两吃文案生成也失败:', dsErr);
          }
        }
      } else {
        console.error('AI 运营周报生成失败，最终错误原因:', err);
      }
      return this.generateMockCustomOperationsCopy(repoOrRepos, type, { tone, audience, cta, wechatName, error: err.message });
    }
  }

  // 模拟高级运营文案生成器 (高保真降级，支持引流定制的本地模板渲染)
  generateMockCustomOperationsCopy(repoOrRepos, type, { customPrompt, cta, wechatName = 'GitHub 搞钱雷达', error = '' }) {
    const cleaned = this.cleanErrorMessage(error);
    const errorPrefix = cleaned ? `【⚠️AI生成受阻 - 触发高保真降级系统：${cleaned}】\n\n` : '';
    const selectedCta = cta ? `\n\n📌 关注引流：${cta}` : '\n\n📌 觉得好用就赶紧收藏点赞吧！关注我，每天分享一个搞钱信息差！';

    const selectedToneName = '智能适配';
    const selectedAudienceName = '目标用户';

    if (type === 'weekly_digest') {
      const repos = Array.isArray(repoOrRepos) ? repoOrRepos : [repoOrRepos];
      const count = repos.length;
      
      let itemsListHtml = '';
      let comparisonRows = '';

      repos.forEach((repo, idx) => {
        const lang = repo.language || 'TypeScript';
        const score = repo.commercial_score >= 0 ? repo.commercial_score : 85 - idx * 5;
        itemsListHtml += `
--------------------------------------------------
🔥 【黑马 #${idx + 1}】：${repo.name} (评分：${score}分)
--------------------------------------------------
💡 项目简介：基于 ${lang} 开发，旨在解决“${repo.description || '暂无描述'}”的核心刚需。
🚀 变现策略：
  - 【信息差卖工具包】：把它打包成免安装绿色版，在闲鱼、小红书挂链接出售，定价 ¥9.9-29.9，跑量赚钱。
  - 【代安装/代配置服务】：帮不懂技术的打工人或小企业远程安装配置，一次收 ¥100-300，纯手工费零成本！
`;
        comparisonRows += `| ${repo.name} | ${repo.description ? repo.description.substring(0, 15) + '...' : '暂无'} | ${lang} | ${score}分 | 卖工具包 / 代安装服务 |\n`;
      });

      return `${errorPrefix}📋 【公众号推荐标题】：
1. 本周最震撼的 ${count} 个 GitHub 开源黑马！独立开发偷偷搞钱的绝对利器！
2. 信息差爆破！这 ${count} 个刚开源的神级工具，懂技术的人已经偷偷去套壳收费了！
3. 开源即变现？盘点本周 GitHub 飙升榜中最具搞钱相的 ${count} 大潜力股！

---

📌 【前沿视点 (已为您按${selectedToneName}的语气定制，面向${selectedAudienceName}客群)】：
在这个大模型和独立开发风靡的时代，最值钱的东西就是“信息差”和“效率门槛”。很多人整天抱怨没有创业想法、没有技术深度。事实上，GitHub 上每天都有成百上千个优秀轮子在飞速迭代。今天为大家盘点的这 ${count} 个神级项目，不仅解决了真实的企业刚需，更是独立开发者和自媒体人的“印钞机胚胎”。

${itemsListHtml}

--------------------------------------------------
📊 技术商业潜力横向对比分析
--------------------------------------------------
| 项目名称 | 核心痛点亮点 | 主要技术门槛 | 商业化评分 | 最佳推荐变现路径 |
| :--- | :--- | :--- | :--- | :--- |
${comparisonRows}
--------------------------------------------------
📌 落地避坑指南（小白避坑）：
1. 别盲目重构代码！直接用官方 Demo 或一键部署模版起步，先跑通冷启动付费。
2. 计费系统别自己写，直接接入 Stripe 或国内爱发电等支付聚合网关。
3. 流量为王！先在小红书、微信等渠道分发，拿到第一个付费客户，再考虑优化产品架构。${selectedCta}`;
    }

    // 单个仓库
    const repo = Array.isArray(repoOrRepos) ? repoOrRepos[0] : repoOrRepos;
    const name = repo.name || 'owner/repo';
    const lang = repo.language || 'JavaScript';
    const desc = repo.description || '暂无项目描述';

    const getCopyForType = (t) => {
      if (t === 'xiaohongshu') {
        let mainIdea = '';
        let monetizationIdea = '';
        let tags = '';

        if (tone === 'hype') {
          mainIdea = `🔥 发现一个超级神仙的开源项目：【${name}】！它简直是打工人的福音，专门治愈：${desc}！不用加班造轮子了！`;
          monetizationIdea = `1️⃣ 【打工人提效神器】：把它打包成免安装绿色版，发到闲鱼/小红书，帮职场小白一键安装，收个辛苦费 ¥50-100，纯跑量！\n2️⃣ 【副业生产力翻倍】：用它替代你天天加班手动做的重复性工作——报表、文案、素材整理，10分钟搞定原本一晚上的活！`;
          tags = `#打工人神器 #提效工具 #搞钱 #副业 #开源项目 #纯净无广告 #小红书爆款 #信息差`;
        } else if (tone === 'technical') {
          mainIdea = `💡 深度拆解：【${name}】为什么值得关注？它基于 ${lang} 开发，核心解决的问题是：${desc}。更重要的是——它完全免费、开源、无广告，是市面上那些收费几百块、还塞满弹窗广告的同类软件的完美替代品。`;
          monetizationIdea = `1️⃣ 【免费替代收费软件】：市面上同类工具动辄 ¥200+/年，这个开源版本功能完全不输，还零广告。帮人安装/配置一次收 ¥100-300。\n2️⃣ 【打包卖教程/资源】：录制保姆级安装视频 + 打包免安装版，在闲鱼、小红书卖信息差资源包，稳定被动收入。`;
          tags = `#免费替代 #纯净工具 #打工人福利 #提效神器 #开源推荐`;
        } else if (tone === 'beginner') {
          mainIdea = `🐣 小白搞钱信息差来了！今天给大家分享一个刚出来的“搞钱黑科技”——【${name}】。很多大公司都在用它解决：${desc} 这个麻烦！重点是，你完全不用自己懂写代码，也能赚这个信息差！`;
          monetizationIdea = `1️⃣ 【代部署/代汉化】：去闲鱼或小红书挂个服务，帮不懂技术的人做一键安装，一次收 ¥100-300，纯无本买卖！\n2️⃣ 【录制安装视频教程】：做成引流课程，打包卖资料，也是一种非常棒的被动收入！`;
          tags = `#小白副业 #信息差变现 #零基础创业 #副业推荐 #搞钱小妙招`;
        } else { // casual
          mainIdea = `🤪 喂喂喂，听说了吗？GitHub 上又出来个好玩的黑马【${name}】。这玩意基于 ${lang} 开发，主要是帮大家省掉“${desc}”的头疼折腾。再也不用迎难而上给老板当螺丝钉了！`;
          monetizationIdea = `1️⃣ 打包成免安装绿色版，挂在闲鱼上卖，定价 9.9 包邮，主打薄利多销、躺着接单！\n2️⃣ 直接在小红书发对比测评：免费开源 VS 收费流氓软件，流量蹭蹭涨，公众号粉丝坐火箭！`;
          tags = `#打工人日常 #幽默搞钱 #提效工具 #纯净神器`;
        }

        return `${errorPrefix}📋 【爆款小红书标题】：\n1. 拯救打工人！GitHub 上被吹爆的纯净提效神器，我帮你们打包好了！\n2. 告别加班！原来一晚上的活，用这个免费神器 10 分钟搞定！\n3. 吹爆这个免费工具！完全吊打市面上收费几百块的同类软件，关键还零广告！\n\n---\n\n✨ 【小红书爆款图文 (已为您按${selectedToneName}的语气定制，面向${selectedAudienceName}客群)】：\n\n🚀 救命！这个纯净提效神器真的太好用了！ \n\n${mainIdea}\n\n💡 想用它变现？终极保姆级思路来了：\n\n${monetizationIdea}\n\n🛠️ 落地执行第一步动作：\n\n点击本卡片底部的收藏，先去获取免安装打包版体验一下！\n\n搞钱，必须今天就动手！🔥\n\n${tags}${selectedCta}`;
      } else {
        // 微信公众号单篇 (wechat_article)
        return `${errorPrefix}📋 【推荐公众号大标题】：\n1. 深度解析 GitHub 刚上榜的 ${lang} 神器 ${name}：小白保姆级免安装绿色版运行指南\n2. 闭源平替？从小红书过来找 ${name} 的看这里，一键打包运行教程送上！\n3. 纯干货！扒一扒 ${name} 怎么免环境双击运行，附带云盘资源包下载！\n\n---\n\n📌 【微信公众号干货包 (已为您按${selectedToneName}的语气定制，面向${selectedAudienceName}客群)】：\n\n### 一、 承接从小红书引流过来的粉丝\n\n大家好！有很多朋友从小红书过来找这个工具的一键免安装版和保姆级上手教程。今天就专门给大家做个脑残级的部署运行说明，不管你是Windows还是Mac，跟着这篇指南，3分钟直接运行！\n\n### 二、 极简傻瓜式使用教程\n\n1. **第一步：下载资源包**\n   在文章底部找到提供的云盘下载链接，下载 \`[${name.split('/').pop()}-green-package].zip\` 压缩包。\n   \n2. **第二步：解压文件**\n   将下载好的压缩包解压到本地。**【注意】解压路径中千万不能包含中文字符，否则可能会报错！**\n   \n3. **第三步：一键运行**\n   解压后，找到文件夹中的 \`运行.bat\`（Windows系统）或 \`run.sh\`（Mac/Linux系统），鼠标双击运行即可，系统会自动启动可视化界面！\n\n### 三、 小白常见问题避坑\n\n- **问题 1：双击运行后弹窗被防火墙拦截？**\n  * 解决办法：这是由于本地安全机制引起的，直接点击“仍要运行”或“放行”即可，开源代码100%纯绿色无毒。\n- **问题 2：端口冲突打不开网页？**\n  * 解决办法：检查后台是否开启了其他类似软件，重启软件会自动搜索空闲端口。\n\n### 四、 📥 资源下载与免安装版获取\n我已经把工具的绿色免安装版与傻瓜运行教程整理好了，关注公众号【${wechatName}】，在对话框回复项目名称关键词即可获取网盘下载地址：\n- 🔵 百度网盘：关注公众号后台回复关键词获取\n- 🟠 阿里云盘：关注公众号后台回复关键词获取\n\n---\n${selectedCta}`;
      }
    };

    const copyXhs = getCopyForType('xiaohongshu');
    const copyWechat = getCopyForType('wechat_article');

    return {
      copyXhs,
      copyWechat,
      copy: type === 'xiaohongshu' ? copyXhs : copyWechat
    };
  }

  // 模拟报告生成器 (用于 API 密钥未配置或请求失败时的降级方案)
  generateMockReport(repo, warnMessage = '') {
    // 净化警告信息，避免展示技术堆栈和内部 API 错误给用户
    let friendlyWarn = this.cleanErrorMessage(warnMessage);

    const language = repo.language || '未知';
    const isAI = repo.description && (repo.description.toLowerCase().includes('ai') || repo.description.toLowerCase().includes('llm') || repo.description.toLowerCase().includes('gpt'));
    
    let score = 60;
    let models = ['打包绿色版卖闲鱼/小红书（9.9元起步跑量）', '代安装/代配置服务（100-300元一次）'];
    let audience = ['职场打工人（行政、HR、财务、运营）', '想提效的普通电脑用户'];
    let painPoints = ['重复性工作耗时费力、天天加班', '同类收费软件贵且广告弹窗多'];
    let features = ['一键双击运行（无需安装环境）', '功能直观傻瓜式操作', '完全免费无广告纯净体验'];
    
    if (isAI) {
      score = 88;
      models = ['打包成AI提效工具包卖闲鱼（19.9元起）', '在小红书做教程引流公众号涨粉', '接付费代配置和一对一指导服务'];
      audience = ['自媒体博主和副业党（需要批量产内容）', '职场打工人（想用AI提效省时间）', '对AI感兴趣但不懂技术的普通用户'];
      painPoints = ['一个人产内容效率太低、天天憋文案', 'AI工具贵且学习成本高、不会用'];
      features = ['AI一键生成内容（文案/图片/视频脚本）', '批量处理功能（同时处理大量素材）', '傻瓜式操作界面（不需要写代码）'];
    } else if (language === 'Go' || language === 'Rust') {
      score = 72;
      models = ['打包成提效工具包分发（9.9-29.9元）', '为小企业代安装部署（200-500元一次）'];
      audience = ['对工具感兴趣的数码爱好者', '想要替代收费软件的普通用户', '小微企业和个体工商户'];
      painPoints = ['被同类收费软件绑架、价格高昂', '安装配置复杂、普通人搞不定'];
      features = ['极高性能（运行速度远超同类产品）', '完全免费开源无广告', '一键打包即用版本'];
    } else if (language === 'JavaScript' || language === 'TypeScript') {
      score = 75;
      models = ['打包成免安装版工具包出售（9.9元）', '录制安装教程视频卖资料包', '小红书做颜值测评引流公众号'];
      audience = ['追求效率和颜值的职场人士', '自媒体创作者和副业博主', '被流氓软件困扰的普通电脑用户'];
      painPoints = ['同类工具界面丑陋或充斥广告', '日常办公工作流程繁琐低效'];
      features = ['高颜值界面（完全不像免费软件）', '一键操作零学习成本', '支持Windows和Mac双平台'];
    }

    // 小红书“三步翻译搞钱法”降级兜底数据
    let xhsCat = '视觉反差极大的一键式本地工具';
    let xhsReason = '该一键式免安装本地小工具直击普通人痛点，视觉对比极度明显，非常容易吸引小红书用户关注。';
    let xhsTitles = [
      `《一键解决痛点！自制绿色免安装的 ${repo.name} 彻底搞定，告别收费流氓软件！》`,
      `《救命！终于找到这个完全免费、无广告的 ${repo.name} 效率神器了！》`,
      `《别再花冤枉钱了！用这个开源免运维利器一键搞定！》`
    ];

    if (isAI) {
      xhsCat = '副业/效率开挂神器';
      xhsReason = '人工智能目前是小红书最大的热门风口，效率开挂效果立竿见影，极其容易获得高赞和变现。';
      xhsTitles = [
        `《救命！这个免费 AI 搞钱神器，逼格高到想天天用！》`,
        `《独立开发狂喜！用这个神仙开源项目实现副业月入过万！》`,
        `《信息差爆破！普通人如何用它零门槛副业变现？》`
      ];
    } else if (language === 'JavaScript' || language === 'TypeScript') {
      xhsCat = '极简、高颜值的应用';
      xhsReason = '高颜值的界面展示在小红书极易获得女粉和强迫症的疯狂点赞收藏，是极好的低门槛吸粉利器。';
      xhsTitles = [
        `《强迫症疯狂心动！这个免费神仙软件，颜值高到想天天打开！》`,
        `《终于找到了！这个完全免费、无广告的极简神器！》`,
        `《小白友好！高颜值免安装独立产品，越用越爽！》`
      ];
    }

    return {
      commercialScore: score,
      monetizationModels: models,
      targetAudience: audience,
      painPoints: painPoints,
      mvpFeatures: features,
      roadmap: [
        '第1步：把项目打包成免安装绿色版，制作1分钟傻瓜式上手图文教程',
        '第2步：在小红书发免费平替对比测评，引导评论区扣要获取工具包并私信引流',
        '第3步：公众号沉淀精准粉丝，后期接代安装服务和定制化付费辅导'
      ],
      pricing: [
        { tier: '免费自取版', price: '0元', features: ['自己动手下载安装', '参考图文教程', '社区问答互助'] },
        { tier: '打包懒人版', price: '9.9元', features: ['免安装一键运行包', '1分钟上手教程', '微信答疑群'] },
        { tier: '代装省心版', price: '199元', features: ['远程帮你一键安装好', '手把手教你使用', '1个月售后支持'] }
      ],
      competitors: ['同类收费软件（价格高且广告多）', '其他免费但操作复杂的工具'],
      differentiators: [
        '完全免费无广告，是流氓收费软件的良心平替',
        '打包成绿色版后，普通人双击即用，零门槛上手'
      ],
      summary: `${friendlyWarn ? `[⚠️${friendlyWarn}] ` : ''}该工具基于 ${language} 开发，完全免费开源无广告。对于大量被收费软件绑架、天天被弹窗广告骚扰的普通用户来说，它是极好的良心博主推荐神器。建议打包成免安装绿色版，在小红书做免费平替测评内容引流，变现路径清晰且门槛低。`,
      xhsCategory: xhsCat,
      xhsCategoryReason: xhsReason,
      xhsTitlePackaging: xhsTitles,
      xhsTranslationMapping: [
        { techTerm: `基于 ${language} 开发的本地部署 ${repo.name} 项目`, humanPack: `完全免费、绿色免安装的实用提效神器` }
      ],
      xhsMonetizationDetails: {
        packagedProduct: `利用打包工具将 ${repo.name} 源码打包成免安装点击即用绿色版，制作 1 分钟傻瓜图文指南，引导用户评论区扣“要”，私信引流并收取 ¥9.9 的打赏包服务。`,
        packagedProductCta: `在小红书发效果对比图，引导用户：‘软件已经帮大家打包好了免安装绿色版，附带1分钟上手教程。评论区扣“要”，私信发你。’`,
        deploymentService: `为需要此工具但不懂技术的普通用户，提供一对一远程代搭建/代部署服务，单次收取 ¥199-299 的服务器代运维配置费用。`,
        deploymentServiceCta: `接单代搭建！手把手帮有痛点的姐妹用 10 分钟搭好这个神仙高颜值工具！`
      }
    };
  }
  async analyzeSocialTrends(githubRepos, socialTrends) {
    const currentKey = this.deepseekApiKey || process.env.DEEPSEEK_API_KEY; // 已改为 DeepSeek
    
    const formattedRepos = githubRepos.slice(0, 20).map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      language: r.language,
      stars: r.stars,
      starsToday: r.stars_today || r.starsToday || ''
    }));

    const formattedTrends = socialTrends.slice(0, 30).map(t => ({
      platform: t.platform,
      title: t.title,
      views_or_likes: t.views_or_likes,
      views_count: t.views_count || 0
    }));

    const prompt = `
你是一位顶级科技商业分析师与开源趋势预言家。
请对以下 GitHub 热门项目与海内外 12 大主流社媒（YouTube/Reddit/HN/推特，及国内的知乎/36Kr/B站/掘金/少数派等）热点进行深度比对与量化评分。

【GitHub 热门项目列表】
${JSON.stringify(formattedRepos, null, 2)}

【多源社媒热门话题列表】
${JSON.stringify(formattedTrends, null, 2)}

---

请严格按照以下格式输出，分为两部分：

## PART_1_JSON_START
输出一个 JSON 数组，为最有代表性的 Top 10 个 GitHub 项目打分：
[
  {
    "repo_name": "项目名称",
    "github_score": 数字(0-100，基于GitHub榜单热度),
    "social_score": 数字(0-100，基于海外前沿讨论度),
    "domestic_score": 数字(0-100，综合国内全平台的讨论热度),
    "info_gap": 数字(变现指数，计算公式：(github_score + social_score) / 2 + (国内痛点讨论热度 * 0.5) - (国内同类开源解法的普及度 * 1.5)。只要国内如知乎/36氪都在热议痛点但不知道该开源工具，分值就应该极高！),
    "trend_direction": "↑或→或↓",
    "verdict": "强推或关注或观望" (优先强推 info_gap 高的项目),
    "social_match": "简短说明匹配情况（如：知乎热议痛点，正好匹配此工具）",
    "xhs_copy": "如果 info_gap > 10 且 verdict 为强推，请用 emoji 和爆款网感为它生成一段 50 字左右的小红书引流笔记文案（突出解决痛点），否则填 null"
  }
]
## PART_1_JSON_END

## PART_2_REPORT_START
输出《社媒与GitHub开源热点智能比对报告》Markdown，包含：

### 1. 💥 商业变现风向标 (Commercial & Info Gap Trends)
- 结合知乎和36Kr数据，目前国内最大的"未被满足的痛点"是什么？
- 哪些开源项目可以作为这些痛点的"特效药"进行变现包装？

### 2. 🔄 供需双向比对 (Demand vs Solution)
- 找出那些存在巨大变现指数 (高 info_gap) 的项目
- 制作一个供需匹配对比表格

### 3. 🎯 商业化变现落地建议
- 针对"高痛点+低普及度"的项目，推荐具体的搞钱玩法（如闲鱼卖绿色包、代部署、小红书引流服务等）
- 给出起号与推广的实操建议

语言：简体中文，Markdown 格式，多用加粗、引用块、列表
## PART_2_REPORT_END
`;

    if (!currentKey) {
      console.warn('Gemini API Key 未配置，将返回模拟社媒分析报告');
      return this.generateMockSocialAnalysisReport(githubRepos, socialTrends);
    }

    try {
        console.log('【AI周报/社AI分析】正在使用 DeepSeek...');
        const dsModelResult = await this.generateDeepseekContent(prompt, false);
        if (typeof dsModelResult === 'string' && dsModelResult.includes('PART_1')) {
          return this.parseAnalysisResult(dsModelResult.trim());
        }
        return dsModelResult.trim();
    } catch (error) {
      console.error('社媒AI比对生成失败:', error);
      return this.generateMockSocialAnalysisReport(githubRepos, socialTrends, error.message);
    }
  }

  // 解析 AI 返回的混合格式，分离结构化 JSON 评分和 Markdown 报告
  parseAnalysisResult(rawText) {
    let scores = [];
    let report = rawText;

    try {
      const jsonMatch = rawText.match(/PART_1_JSON_START([\s\S]*?)PART_1_JSON_END/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[1].trim();
        // 尝试只提取括号 [] 内的数组内容，忽略前后可能的闲杂文本
        const arrayMatch = jsonStr.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrayMatch) {
          jsonStr = arrayMatch[0];
        } else {
          // 如果没匹配到，还是清洗代码块标记
          jsonStr = jsonStr.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        }
        
        try {
          scores = JSON.parse(jsonStr);
        } catch (parseErr) {
          console.warn('[parseAnalysisResult] JSON 解析失败:', parseErr.message);
          // 尝试简单修复：移除尾部多余逗号
          try {
            const fixedJson = jsonStr.replace(/,\s*([\]}])/g, '$1');
            scores = JSON.parse(fixedJson);
          } catch(e) {}
        }
      }

      const reportMatch = rawText.match(/PART_2_REPORT_START([\s\S]*?)(?:PART_2_REPORT_END|$)/);
      if (reportMatch) {
        report = reportMatch[1].trim();
      } else if (jsonMatch) {
        const afterJson = rawText.substring(rawText.indexOf('PART_1_JSON_END') + 'PART_1_JSON_END'.length).trim();
        if (afterJson.length > 50) {
          report = afterJson;
        } else {
          // 剔除 JSON 部分
          report = rawText.replace(/[\s\S]*PART_1_JSON_END/, '').trim();
        }
      } else {
        // 彻底清理残留的标签
        report = rawText.replace(/PART_[12]_(?:JSON|REPORT)_(?:START|END)/g, '').trim();
      }
    } catch (e) {
      console.warn('[parseAnalysisResult] 结构提取失败:', e.message);
    }

    // 再次全量清理，防止大模型自己生造标签导致遗漏
    report = report.replace(/PART_[12]_(?:JSON|REPORT)_(?:START|END)/g, '').trim();
    if (report.startsWith('```markdown')) {
      report = report.replace(/^```markdown/i, '').replace(/```$/i, '').trim();
    }

    return { report, scores };
  }

  // 辅助方法：下载图片转为 base64
  async downloadImageToBase64(url) {
    if (!url) return null;
    try {
      const axios = require('axios');
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
      const base64 = Buffer.from(response.data, 'binary').toString('base64');
      const mimeType = response.headers['content-type'] || 'image/jpeg';
      return {
        inlineData: {
          data: base64,
          mimeType
        }
      };
    } catch (e) {
      console.warn(`下载图片失败 [${url}]:`, e.message);
      return null;
    }
  }

  // 根据生成的文案智能提取图片生成提示词 (已整合 wechat-cover 技能)
  async generateImagePromptFromCopy(copyText) {
    // 红狐封面技能: 获取微信爆款封面，传给火山视觉模型
    let coverImageUrls = [];
    try {
      if (true) {
        const kwPrompt2 = `请根据以下自媒体宣发文案，提取一个适合在微信公众号搜索的核心关键词（如"AI工具"、"搞钱副业"等）。只需输出一个词，不要有任何标点符号。文案：${copyText.substring(0, 1000)}`;
        const kwText2 = await this.generateDeepseekContent(kwPrompt2, false);
        let searchKeyword = kwText2.trim().replace(/[^\w\u4e00-\u9fa5]/g, '').slice(0, 20) || '开源工具';
        console.log(`【红狐封面技能】从文案中提取搜索词：[${searchKeyword}]，准备拉取微信爆文封面...`);
        const redfoxWechat = require('../fetch/redfoxWechat');
        const hotWechatData = await redfoxWechat.searchHotArticle(searchKeyword, { maxItems: 10 });
        
        const validItems = (hotWechatData.items || []).filter(item => item.coverUrl && item.coverUrl.startsWith('http'));
        coverImageUrls = validItems.slice(0, 3).map(item => item.coverUrl);
        if (coverImageUrls.length > 0) {
          console.log(`【红狐封面技能】找到 ${coverImageUrls.length} 张同赛道真实爆款封面，准备传入火山视觉分析...`);
        }
      }
    } catch (e) {
      console.warn('【红狐封面技能】获取爆款封面失败，降级为无图参考模式:', e.message);
    }

    const prompt = `
你是一个专业的 AI 绘画提示词工程师和自媒体视觉爆款教练。
请仔细阅读下面的自媒体宣发文案，并结合提供的高点击率爆款封面图片（如果有），为我生成 6 段用于调用 AI 图像生成模型（如 Midjourney / Gemini Pro）的图片生成提示词。

具体要求如下：
1. **小红书配图（3张）**：
   - 比例限定：在提示词末尾加上 '--ar 3:4'。
   - 第1张为吸睛封面图（大标题、夸张高密度排版、极具视觉冲击力）；
   - 第2张为痛点/核心功能拆解图解；
   - 第3张为成果/收益展示图。

2. **微信公众号配图（3张，完全遵照我们传入的爆款封面规律）**：
   - 比例限定：在提示词末尾加上 '--ar 16:9'，由于目标是生成 2.35:1 效果的图，构图需中心聚焦。
   - **视觉分析 (极重要)**：如果你看到了随附的爆款封面图片，请先仔细观察它们的排版布局、主体元素（人像/大字报/插画）、配色风格。
   - 第1张为文章头部横版高级首图（必须模仿传入爆款图片的爆款风格，如果没有图则使用高级感、概念感强的大字报设计）；
   - 第2张为原理解析或功能拆解图；
   - 第3张为行动号召或愿景图。

3. **核心风格要求**：所有提示词都必须明确要求生成【高密度、包含大量排版文字信息的视觉图像】（Typography-heavy, text-rich, high-density information graphic），类似知识图解、干货海报。
4. 提示词必须直接描述画面细节，严禁出现“请画一幅”、“根据文案”等废话。
5. 请务必使用以下严格格式输出，每段提示词之间保留空行，严禁加任何 markdown 代码块或多余解释：

【小红书 - 图1 封面（3:4）】：[直接写提示词内容...]

【小红书 - 图2 核心（3:4）】：[直接写提示词内容...]

【小红书 - 图3 收益（3:4）】：[直接写提示词内容...]

【公众号 - 图1 首图（16:9）】：[直接写提示词内容...]

【公众号 - 图2 解析（16:9）】：[直接写提示词内容...]

【公众号 - 图3 号召（16:9）】：[直接写提示词内容...]

文案内容：
${copyText.substring(0, 2000)}
    `;

    try {
      const volcApiKey2 = this.volcApiKey || process.env.VOLC_API_KEY;
      if (coverImageUrls && coverImageUrls.length > 0 && volcApiKey2) {
        // 使用火山引擎视觉理解（多模态）
        const result = await this.generateVolcVisionContent(prompt, coverImageUrls);
        console.log('【火山视觉】多模态封面分析完成！');
        return result.trim().replace(/^['"]|['"]$/g, '');
      } else {
        const response = await this.generateDeepseekContent(prompt, false);
        return response.trim().replace(/^['"]|['"]$/g, '');
      }
    } catch (error) {
      console.error('智能提取提示词失败:', error);
      return '一张充满科技感的 3D 渲染图，带有代码和未来光影元素，极简风格 --ar 16:9'; // 降级保底
    }
  }

  // 调用火山引擎文生图
  async generateImage(prompt, platform) {
    const volcApiKey = this.volcApiKey || process.env.VOLC_API_KEY;
    if (!volcApiKey) {
      throw new Error('未配置 VOLC_API_KEY，无法调用图片生成模型。');
    }
    return this.generateVolcImage(prompt, platform);
  }

  // 火山引擎文生图（保留原 Pollinations 降级）
  async generateImageWithFallback(prompt, platform) {
    try {
      return await this.generateImage(prompt, platform);
    } catch (e) {
      console.warn('火山文生图失败，降级 Pollinations:', e.message);
      const width = platform === 'xiaohongshu' ? 768 : 1024;
      const height = platform === 'xiaohongshu' ? 1024 : 576;
      return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${Math.floor(Math.random() * 10000)}`;
    }
  }


  generateMockSocialAnalysisReport(githubRepos, socialTrends, error = '') {
    const cleanErr = error ? `*(由于网络或API配置原因，当前展示本地引擎生成的趋势预测: ${error})*\n\n` : '';
    const report = `# 💥 国内外社媒“信息差”智能比对报告\n\n${cleanErr}\n## 1. 💥 爆款风向标 (Info Gap)\n\n根据最新 YouTube/Reddit 与 B站/V2EX 的热度比对，当前最强烈的出圈趋势集中在 **AI 智能体 (AI Agents) 的本地私有化部署**。\n\n- **海外爆红**：*NetworkChuck* 在 YouTube 推广 DeepSeek 本地部署，播放量超 45 万。\n- **国内空缺**：B站虽有搬运，但高质量一键整合包极速缺货，存在极高**信息差红利**。\n\n---\n\n## 2. 🔄 信息差指数排行榜\n\n| GitHub 项目名 | 海外热度 | 国内热度 | 信息差指数 | 变现潜力 |\n| :--- | :---: | :---: | :---: | :--- |\n| **ollama/ollama** | 🔥 98 | 📈 65 | 🚀 +31 | **黄金搬运期** |\n| **cherry-ai/cherry-studio** | ✨ 88 | 💬 40 | 🚀 +45 | **红利蓝海** |\n\n---\n\n## 3. 🎯 商业化变现落地建议\n\n1. **核心选品**：抓住高达 +45 信息差的 Cherry Studio，制作免安装一键包。\n2. **小红书钩子**：使用生成的爆款文案，配一张高颜值 UI 对比图，引导评论发“求分享”。\n`;

    const scores = [
      { repo_name: 'ollama/ollama', github_score: 95, social_score: 98, domestic_score: 65, info_gap: 31, trend_direction: '↑', verdict: '强推', social_match: 'YouTube/B站均有讨论', xhs_copy: '🔥太强了！全网都在找的Ollama本地AI整合包来了！小白一键双击运行，告别配置折腾！要的赶紧评论区扣【要】！' },
      { repo_name: 'cherry-ai/cherry-studio', github_score: 82, social_score: 88, domestic_score: 40, info_gap: 45, trend_direction: '↑', verdict: '强推', social_match: '海外爆火，国内待爆发', xhs_copy: '😭后悔没早点用！比官网好用100倍的AI客户端Cherry Studio！完全免费，告别封号焦虑！一键打包送你，快来领！' },
      { repo_name: 'browser-use/browser-use', github_score: 78, social_score: 92, domestic_score: 30, info_gap: 55, trend_direction: '↑', verdict: '强推', social_match: '极大信息差', xhs_copy: '👀发现一个逆天神器！一键让AI接管你的浏览器帮你上班！解放双手不用写代码，打工人狂喜！滴滴上车！' },
      { repo_name: 'deepseek-ai/DeepSeek-R1', github_score: 90, social_score: 95, domestic_score: 85, info_gap: 7, trend_direction: '→', verdict: '关注', social_match: '国内外皆红海', xhs_copy: null },
      { repo_name: 'langchain-ai/langchain', github_score: 85, social_score: 70, domestic_score: 65, info_gap: 12, trend_direction: '→', verdict: '观望', social_match: '开发者硬核工具', xhs_copy: null }
    ];

    return { report, scores };
  }

  async extractPainPoints(keyword, data) {
    const dsKeyCheck = this.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
    if (!dsKeyCheck) {
      return '未能获取到大模型 API 密钥，痛点提炼功能暂时无法使用。请在设置中配置 DeepSeek API Key。';
    }

    const dataJson = JSON.stringify(data.slice(0, 30).map(i => ({title: i.title, interaction: i.interactiveCount})), null, 2);
    const prompt = `
你是一位敏锐的用户心理洞察专家和商业产品经理。
请根据以下在【${keyword}】赛道中爬取到的社媒高赞爆款内容数据，帮我提炼出受众的核心痛点和焦虑点。

【高赞爆款数据】：
${dataJson}

【任务要求】：
1. 深度剖析这些高赞内容背后的用户心理，为什么他们会点赞收藏？他们在害怕什么？他们渴望什么？
2. 总结出 3-5 条最核心的【用户真实痛点】。
3. 针对每一条痛点，给出 1 句话的【开发建议】（即如果我们要去 Github 找开源项目，应该找什么样的工具来解决这个痛点）。
4. 输出格式必须是结构化的 Markdown，直接输出结果，不要任何客套话。
`;

    try {
      const result = await this.generateDeepseekContent(prompt, false);
      return result;
    } catch (e) {
      console.error('痛点提炼大模型调用失败:', e);
      throw new Error('大模型调用失败: ' + e.message);
    }
  }

  async extractMonetization(keyword, data) {
    const dsKeyCheck = this.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
    if (!dsKeyCheck) {
      return '未能获取到大模型 API 密钥，拆解功能暂时无法使用。请在设置中配置 DeepSeek API Key。';
    }

    const dataJson = JSON.stringify(data.slice(0, 30).map(i => ({title: i.title, interaction: i.interactiveCount})), null, 2);
    const keywordStr = keyword ? `【${keyword}】相关` : '该赛道';
    const prompt = `
你是一位拥有操盘过千万级私域的商业黑客和顶级生财教练。
请深度剖析以下在${keywordStr}爬取到的微信生态（公众号）高赞爆文，反向拆解同行的变现闭环和引流套路。

【同行爆文样本数据】：
${dataJson}

【任务要求】：
1. 诊断【引流钩子】：同行都在用什么诱饵把公域流量洗入私域（微信群、个人号）？
2. 拆解【核心变现路径】：他们最终是怎么赚到钱的？是靠知识付费（卖课/圈子）？还是卖铲子（卖软件/源码部署）？还是提供代运营服务？
3. 提炼【高转化文案模板】：总结他们文章中能激发用户购买欲的常见话术结构。
4. 给出【直接可复制的降维打击策略】：如果我们直接利用 Github 开源项目做同赛道降维打击，我们的核心优势和操作SOP应该是什么？
5. 输出格式必须是结构化的 Markdown，排版清晰美观，使用 emoji 增强可读性。直接输出结果，不要任何多余的开场白或结尾套话。
`;

    try {
      const result = await this.generateDeepseekContent(prompt, false);
      return result;
    } catch (e) {
      console.error('变现拆解大模型调用失败:', e);
      throw new Error('大模型调用失败: ' + e.message);
    }
  }
}

module.exports = new AIAnalyst();
