const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class FeishuSheetSender {
  constructor(config) {
    this.config = config;
  }

  // 辅助函数：安全执行 lark-cli 命令
  runCliCommand(command, args = []) {
    try {
      const fullCmd = `lark-cli ${command} ${args.join(' ')}`;
      console.log(`执行飞书推送命令: ${fullCmd}`);
      const output = execSync(fullCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      return JSON.parse(output);
    } catch (error) {
      if (error.stdout) {
        try {
          const parsed = JSON.parse(error.stdout);
          if (parsed.error) return parsed;
        } catch (e) {}
      }
      throw new Error(`执行 lark-cli 失败: ${error.message}`);
    }
  }

  // 生成飞书多维表批量插入所需的 JSON 负载
  generateBatchPayload(reposByCategory) {
    const fields = [
      '仓库名称',
      '描述',
      '语言',
      '星标数',
      '分叉数',
      '分类',
      '商业化评分',
      '变现模式建议',
      '目标痛点分析',
      'MVP落地路线图',
      '定价体系建议',
      '竞品矩阵',
      '链接',
      '更新时间'
    ];

    const rows = [];
    const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    const categoryMapping = {
      frontend: '🎨 前端开发',
      backend: '⚡ 后端开发',
      mobile: '📱 移动开发',
      devops: '🚀 运维部署',
      data: '🤖 AI与数据',
      blockchain: '⛓️ Web3/区块链',
      gaming: '🎮 游戏开发',
      tools: '🛠️ 实用工具',
      other: '📦 其他分类'
    };

    const supportedLanguages = ['Python', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'Java', 'C++', 'Vue', 'React', 'HTML', 'CSS', 'Shell'];

    for (const [category, repos] of Object.entries(reposByCategory)) {
      repos.forEach(repo => {
        let stars = 0;
        if (typeof repo.stars === 'number') {
          stars = repo.stars;
        } else if (typeof repo.stars === 'string') {
          stars = parseInt(repo.stars.replace(/[^0-9]/g, '')) || 0;
        }

        let forks = 0;
        if (typeof repo.forks === 'number') {
          forks = repo.forks;
        } else if (typeof repo.forks === 'string') {
          forks = parseInt(repo.forks.replace(/[^0-9]/g, '')) || 0;
        }

        // 映射分类和语言以完美匹配多维表单选下拉框
        const displayCategory = categoryMapping[category] || '📦 其他分类';
        let displayLanguage = repo.language || '其他语言';
        const matchedLang = supportedLanguages.find(l => l.toLowerCase() === displayLanguage.toLowerCase());
        displayLanguage = matchedLang || '其他语言';

        // 解析 AI 商业化评估报告
        let monetizationModels = '';
        let painPoints = '';
        let roadmap = '';
        let pricing = '';
        let competitors = '';

        if (repo.ai_report) {
          try {
            const report = typeof repo.ai_report === 'string' ? JSON.parse(repo.ai_report) : repo.ai_report;
            if (report) {
              if (Array.isArray(report.monetizationModels)) {
                monetizationModels = report.monetizationModels.join(', ');
              }
              if (Array.isArray(report.painPoints)) {
                painPoints = report.painPoints.join(', ');
              }
              if (Array.isArray(report.roadmap)) {
                roadmap = report.roadmap.join('\n');
              }
              if (Array.isArray(report.pricing)) {
                pricing = report.pricing.map(p => {
                  const features = Array.isArray(p.features) ? ` (${p.features.join(', ')})` : '';
                  return `${p.tier}: ${p.price}${features}`;
                }).join('\n');
              }
              if (Array.isArray(report.competitors)) {
                competitors = report.competitors.join(', ');
              }
            }
          } catch (e) {
            console.warn(`解析仓库 ${repo.name} 的 AI 报告失败:`, e.message);
          }
        }

        rows.push([
          repo.name || '',
          repo.description || '',
          displayLanguage,
          stars,
          forks,
          displayCategory,
          repo.commercial_score || 0,
          monetizationModels,
          painPoints,
          roadmap,
          pricing,
          competitors,
          repo.url || '',
          currentTime
        ]);
      });
    }

    return { fields, rows };
  }

  // 推送数据到飞书多维表
  async sendToSheet(reposByCategory) {
    try {
      const baseToken = this.config.spreadsheetId || process.env.FEISHU_SPREADSHEET_ID;
      const tableId = this.config.sheetId || process.env.FEISHU_SHEET_ID;

      if (!baseToken || !tableId) {
        throw new Error('未配置飞书多维表格的 baseToken 或 tableId，请先执行初始化。');
      }

      const payload = this.generateBatchPayload(reposByCategory);
      if (payload.rows.length === 0) {
        console.log('没有需要推送的多维表格记录。');
        return;
      }

      console.log(`生成多维表批量记录，共计 ${payload.rows.length} 条记录...`);

      // 创建临时 scratch 文件夹
      const scratchDir = path.join(__dirname, '../../scratch');
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }

      // 将推送数据写入临时文件以防止 Windows 命令长度溢出
      const tempPushFile = path.join(scratchDir, 'batch_push.json');
      fs.writeFileSync(tempPushFile, JSON.stringify(payload, null, 2));

      // 使用 lark-cli 批量插入多维表格记录
      const response = this.runCliCommand('base +record-batch-create', [
        `--base-token ${baseToken}`,
        `--table-id ${tableId}`,
        `--json "@./scratch/batch_push.json"`
      ]);

      if (response && response.ok) {
        console.log(`🎉 成功通过飞书 CLI 批量推送 ${payload.rows.length} 条项目数据到多维表格！`);
      } else {
        throw new Error(`飞书 CLI 推送记录失败: ${JSON.stringify(response)}`);
      }

      // 清理临时文件
      try {
        fs.unlinkSync(tempPushFile);
      } catch (e) {}

    } catch (error) {
      console.error('推送数据到飞书多维表失败:', error);
      throw error;
    }
  }
}

module.exports = FeishuSheetSender;
