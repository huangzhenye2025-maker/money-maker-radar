const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const Database = require('../storage/database');
const FeishuSheetSender = require('../push/feishuSheetSender');

async function syncNow() {
  console.log('====== 开始从 SQLite 同步现有高商业价值项目到飞书多维表格 ======');
  
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data', 'github_trending.db');
  const db = new Database(dbPath);
  await db.init();

  const repos = await db.getAllRepositories(500);
  console.log(`从 SQLite 中检索到 ${repos.length} 个项目。`);

  const highValRepos = repos.filter(repo => repo.commercial_score >= 75 && repo.ai_report);
  console.log(`筛选出 ${highValRepos.length} 个已分析的高商业价值项目 (评分 >= 75)。`);

  if (highValRepos.length === 0) {
    console.log('没有发现已分析且评分 >= 75 的高商业价值项目，请先在控制台或通过每日任务触发 AI 分析。');
    db.close();
    return;
  }

  // 按分类整理
  const reposByCategory = {};
  highValRepos.forEach(repo => {
    const cat = repo.category || 'other';
    if (!reposByCategory[cat]) {
      reposByCategory[cat] = [];
    }
    reposByCategory[cat].push(repo);
  });

  const feishuSender = new FeishuSheetSender({
    spreadsheetId: process.env.FEISHU_SPREADSHEET_ID,
    sheetId: process.env.FEISHU_SHEET_ID
  });

  await feishuSender.sendToSheet(reposByCategory);
  console.log('====== 飞书多维表格数据增量同步完成！ ======');
  db.close();
}

syncNow().catch(console.error);
