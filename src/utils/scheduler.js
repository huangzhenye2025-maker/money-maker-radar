/**
 * scheduler.js — 社媒热点监控定时自动抓取服务
 * 每 6 小时自动运行一次完整流程：抓取 → AI 分析 → 存库
 */

let cron = null;
try {
  cron = require('node-cron');
} catch (e) {
  console.warn('[Scheduler] node-cron 未安装，定时任务将被禁用。可运行 npm install node-cron 启用。');
}

class SocialScheduler {
  constructor() {
    this.db = null;
    this.socialTrending = null;
    this.aiAnalyst = null;
    this.task = null;
    this.isRunning = false;
    this.lastRunAt = null;
    this.lastRunStatus = 'idle'; // 'idle' | 'running' | 'success' | 'error'
    this.lastRunMessage = '';
    this.nextRunAt = null;
    this.intervalHours = 6; // 默认 6 小时
  }

  /**
   * 初始化调度器
   * @param {object} db - Database 实例
   * @param {object} socialTrending - SocialTrending 实例
   * @param {object} aiAnalyst - AIAnalyst 模块
   * @param {object} pushService - PushService 实例
   * @param {number} intervalHours - 抓取间隔（小时），默认6
   */
  init(db, socialTrending, aiAnalyst, pushService, intervalHours = 6) {
    this.db = db;
    this.socialTrending = socialTrending;
    this.aiAnalyst = aiAnalyst;
    this.pushService = pushService;
    this.intervalHours = intervalHours;

    if (!cron) {
      console.warn('[Scheduler] 定时器未启动（node-cron 不可用）');
      return;
    }

    // 构建 cron 表达式：每 N 小时整点触发（取模）
    const cronExpr = `0 */${intervalHours} * * *`;
    console.log(`[Scheduler] 社媒热点监控定时任务已启动，执行频率: 每 ${intervalHours} 小时 (cron: ${cronExpr})`);

    this.task = cron.schedule(cronExpr, async () => {
      console.log('[Scheduler] 定时触发社媒热点抓取任务...');
      await this.runOnce();
    });

    this._updateNextRunTime();

    // 启动后延迟 30 秒执行一次初始抓取（给服务器预热时间）
    // 用户要求改为纯手动触发，因此注释掉启动时的自动抓取
    /*
    setTimeout(() => {
      console.log('[Scheduler] 服务启动后初始化抓取...');
      this.runOnce().catch(e => console.error('[Scheduler] 初始化抓取失败:', e.message));
    }, 30000);
    */
  }

  /**
   * 执行一次完整的社媒抓取→AI分析→存库流程
   */
  async runOnce() {
    if (this.isRunning) {
      console.log('[Scheduler] 上次任务仍在运行，跳过本次执行');
      return { skipped: true, reason: '上次任务仍在运行' };
    }

    this.isRunning = true;
    this.lastRunStatus = 'running';
    this.lastRunMessage = '正在抓取数据...';

    try {
      // 1. 抓取 YouTube + X 数据
      console.log('[Scheduler] Step 1/3: 抓取社媒数据...');
      this.lastRunMessage = '正在从 YouTube/X 抓取热点数据...';
      const rawTrends = await this.socialTrending.fetchAll();

      // 1.5 同步抓取最新 GitHub 仓库数据以保证时效性
      if (this.pushService) {
        console.log('[Scheduler] Step 1.5/3: 自动抓取最新 GitHub 热点以保证数据新鲜度...');
        this.lastRunMessage = '正在更新最新 GitHub 热点仓库...';
        await this.pushService.fetchAndStoreData();
      }

      // 2. 获取 GitHub 仓库列表
      console.log('[Scheduler] Step 2/3: 加载 GitHub 对比数据...');
      this.lastRunMessage = '正在加载 GitHub 仓库数据...';
      const githubRepos = await this.db.getAllRepositories(30);

      // 3. AI 分析比对
      console.log('[Scheduler] Step 3/3: AI 多维比对分析...');
      this.lastRunMessage = '正在通过 AI 进行多维比对分析...';
      const result = await this.aiAnalyst.analyzeSocialTrends(githubRepos, rawTrends);
      const { report, scores } = result;

      // 4. 智能关联匹配 + 写入评分
      const trendsToSave = rawTrends.map(t => {
        const associated = githubRepos.find(r => {
          const parts = r.name.split('/');
          const repoNameOnly = parts[parts.length - 1].toLowerCase().trim();
          return t.title.toLowerCase().includes(repoNameOnly);
        });

        // 从 AI 评分中找到匹配的项目分数
        const matchedScore = associated && scores
          ? scores.find(s => s.repo_name && s.repo_name.includes(associated.name.split('/').pop()))
          : null;

        return {
          ...t,
          associated_repo_id: associated ? associated.id : null,
          match_reason: associated ? `社媒话题关联 GitHub 热门项目 ${associated.name}` : null,
          github_score: matchedScore ? matchedScore.github_score : -1,
          social_score: matchedScore ? matchedScore.social_score : -1,
          trend_direction: matchedScore ? (matchedScore.trend_direction || '→') : '→',
          verdict: matchedScore ? matchedScore.verdict : null
        };
      });

      await this.db.insertSocialTrendsBatch(trendsToSave);
      await this.db.saveSocialAnalysis(report, scores);

      this.lastRunAt = new Date();
      this.lastRunStatus = 'success';
      this.lastRunMessage = `成功抓取 ${rawTrends.length} 条热点，AI 评分 ${scores ? scores.length : 0} 个项目`;
      this._updateNextRunTime();

      console.log(`[Scheduler] ✅ 完成。${this.lastRunMessage}`);
      return { success: true, trendsCount: rawTrends.length, scoresCount: scores ? scores.length : 0 };
    } catch (error) {
      this.lastRunStatus = 'error';
      this.lastRunMessage = `执行失败: ${error.message}`;
      console.error('[Scheduler] ❌ 定时任务执行失败:', error.message);
      return { success: false, error: error.message };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 获取调度器当前状态
   */
  getStatus() {
    return {
      enabled: !!cron && !!this.task,
      isRunning: this.isRunning,
      status: this.lastRunStatus,
      lastRunAt: this.lastRunAt ? this.lastRunAt.toISOString() : null,
      lastRunMessage: this.lastRunMessage,
      nextRunAt: this.nextRunAt ? this.nextRunAt.toISOString() : null,
      intervalHours: this.intervalHours
    };
  }

  _updateNextRunTime() {
    if (!this.intervalHours) return;
    const now = new Date();
    // 计算下一个整点间隔时间
    const nextHour = Math.ceil(now.getHours() / this.intervalHours) * this.intervalHours;
    const next = new Date(now);
    next.setHours(nextHour, 0, 0, 0);
    if (next <= now) next.setHours(next.getHours() + this.intervalHours);
    this.nextRunAt = next;
  }

  stop() {
    if (this.task) {
      this.task.destroy();
      this.task = null;
    }
  }
}

module.exports = new SocialScheduler();
