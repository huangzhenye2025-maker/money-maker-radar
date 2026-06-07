const cron = require('node-cron');
const path = require('path');
const EmailSender = require('./emailSender');
const FeishuSheetSender = require('./feishuSheetSender');
const Database = require('../storage/database');
const GitHubTrending = require('../fetch/githubTrending');
const RepositoryClassifier = require('../classify/repositoryClassifier');

class PushService {
  constructor(config) {
    this.config = config;
    this.emailSender = null;
    this.feishuSheetSender = null;
    this.database = null;
    this.githubTrending = null;
    this.classifier = null;
    this.cronJob = null;
    this.isFetching = false;
  }

  // 初始化推送服务
  async init() {
    // 实例化组件
    this.emailSender = new EmailSender({
      service: this.config.emailService,
      port: this.config.emailPort,
      user: this.config.emailUser,
      pass: this.config.emailPass
    });

    this.feishuSheetSender = new FeishuSheetSender({
      appId: this.config.feishuAppId,
      appSecret: this.config.feishuAppSecret,
      spreadsheetId: this.config.feishuSpreadsheetId,
      sheetId: this.config.feishuSheetId
    });

    // 初始化 SQLite 数据库
    const dbPath = this.config.dbPath || path.join(__dirname, '../../data', 'github_trending.db');
    this.database = new Database(dbPath);

    this.githubTrending = new GitHubTrending();
    this.classifier = new RepositoryClassifier();

    // 运行初始化
    await this.database.init();
    try {
      await this.emailSender.init();
    } catch (err) {
      console.warn('邮件服务初始化失败，将跳过邮件发送:', err.message);
    }

    console.log('推送服务已完成 SQLite 绑定并初始化成功');
  }

  // 启动定时任务
  startCronJob() {
    // 默认每隔 24 小时执行一次 (或者从配置读取定时 cron)
    // 比如：每天凌晨 1 点执行
    this.cronJob = cron.schedule('0 1 * * *', async () => {
      console.log('【定时任务】开始执行每日 GitHub 热点数据抓取与商业推送...');
      await this.performPush();
    });

    console.log('定时推送任务已成功注册于每日凌晨 01:00');
  }

  // 执行数据抓取与变现评估推送
  async performPush() {
    try {
      // 1. 抓取最新 Trending 数据并存库 (内含 Top 3 热门项目的自动商业评估)
      await this.fetchAndStoreData();

      // 2. 按分类筛选高商业价值数据 (仅推送商业评分 >= 75 的项目)
      const reposByCategory = await this.getReposByCategory();

      // 统计本次有多少高潜力项目
      let totalHighPotential = 0;
      for (const repos of Object.values(reposByCategory)) {
        totalHighPotential += repos.length;
      }

      if (totalHighPotential === 0) {
        console.log('【推送中止】本日未发现商业评分 >= 75 的高潜力变现项目，跳过通知发送。');
        return;
      }

      console.log(`【开始推送】本日共筛选出 ${totalHighPotential} 个高商业价值变现机会！`);

      // 3. 发送邮件通知
      if (this.config.emailTo && this.config.emailUser && this.config.emailPass) {
        try {
          await this.emailSender.sendEmail(
            this.config.emailTo,
            `🔥 GitHub 商业化变现热点日报 - 发现 ${totalHighPotential} 个高价值项目`,
            reposByCategory
          );
        } catch (emailError) {
          console.warn('邮件推送失败:', emailError.message);
        }
      }

      // 4. 推送到飞书多维表格 (使用 CLI 时仅需配置 SpreadsheetId 和 SheetId)
      if (this.config.feishuSpreadsheetId && this.config.feishuSheetId) {
        try {
          await this.feishuSheetSender.sendToSheet(reposByCategory);
        } catch (feishuError) {
          console.warn('飞书多维表格推送失败:', feishuError.message);
        }
      } else {
        console.log('飞书推送配置未启用。本日高价值商业机会如下：');
        for (const [category, repos] of Object.entries(reposByCategory)) {
          console.log(`- [${category}] ${repos.map(r => `${r.name}(评分:${r.commercial_score})`).join(', ')}`);
        }
      }

      console.log('推送任务执行完成');
    } catch (error) {
      console.error('推送任务执行失败:', error);
    }
  }

  // 抓取并存储数据，同时智能分析本日最火的 3 个项目
  async fetchAndStoreData() {
    if (this.isFetching) {
      console.log('抓取任务正在进行中，跳过本次触发。');
      return;
    }
    
    this.isFetching = true;
    try {
      console.log('正在自 GitHub Trending 抓取热门项目...');
      const topics = this.config.topics || ['副业', '变现', '自媒体', '小红书', '效率', '办公自动化', 'ai工具', '游戏脚本'];
      const repos = await this.githubTrending.fetchMultipleTopics(topics, 'daily');

      if (!repos || repos.length === 0) {
        console.warn('未抓取到任何项目数据。');
        return;
      }

      // 给仓库进行技术分类
      const classifiedRepos = this.classifier.classifyBatch(repos);

      // 智能批量翻译简介为中文
      const aiAnalyst = require('../classify/aiAnalyst');
      let translatedRepos = classifiedRepos;
      try {
        translatedRepos = await aiAnalyst.translateDescriptions(classifiedRepos);
      } catch (transErr) {
        console.warn('描述批量翻译发生错误，使用原始数据:', transErr.message);
      }

      // 存储到 SQLite 数据库
      await this.database.insertBatch(translatedRepos);
      console.log(`成功同步 ${repos.length} 个最新项目数据到 SQLite 数据库`);

      // 【智能增量分析】：自动选出星标增长最快的 top 3 项目进行商业价值前置分析
      const topRepos = [...classifiedRepos]
        .sort((a, b) => {
          const starsA = parseInt(a.starsToday.replace(/[^0-9]/g, '')) || 0;
          const starsB = parseInt(b.starsToday.replace(/[^0-9]/g, '')) || 0;
          return starsB - starsA;
        })
        .slice(0, 3);

      console.log('【AI 预热评估】正在对本日星标增长最快的前 3 个项目进行商业前景评估...');
      for (const repo of topRepos) {
        try {
          const dbRepos = await this.database.queryRepositories({ query: repo.name, limit: 1 });
          if (dbRepos.length > 0 && dbRepos[0].commercial_score === -1) {
            const dbRepo = dbRepos[0];
            console.log(`-> 评估中: ${dbRepo.name}`);
            const report = await aiAnalyst.analyzeRepository(dbRepo);
            await this.database.updateAiReport(dbRepo.id, report.commercialScore, report);
          }
        } catch (err) {
          console.warn(`评估 ${repo.name} 失败:`, err.message);
        }
      }
    } catch (error) {
      console.error('抓取任务发生错误:', error);
    } finally {
      this.isFetching = false;
    }
  }

  // 获取高商业价值仓库按分类筛选 (仅推送评分 >= 75 的项目)
  async getReposByCategory() {
    const categories = ['frontend', 'backend', 'mobile', 'devops', 'data', 'blockchain', 'gaming', 'tools'];
    const reposByCategory = {};

    for (const category of categories) {
      // 从 SQLite 获取分类下的最新项目
      const allRepos = await this.database.getRepositoriesByCategory(category, 30);
      
      // 过滤出评分 >= 75 的高商业潜力项目
      const highValRepos = allRepos.filter(repo => repo.commercial_score >= 75);
      
      if (highValRepos.length > 0) {
        reposByCategory[category] = highValRepos;
      }
    }

    return reposByCategory;
  }

  // 停止定时服务
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
    }
    if (this.emailSender) {
      this.emailSender.close();
    }
    if (this.database) {
      this.database.close();
    }
    console.log('推送服务定时任务已顺利卸载停止');
  }
}

module.exports = PushService;
