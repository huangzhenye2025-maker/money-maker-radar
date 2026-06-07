const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 加载现有的环境变量
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function runCliCommand(command, args = []) {
  try {
    const fullCmd = `lark-cli ${command} ${args.join(' ')}`;
    console.log(`执行命令: ${fullCmd}`);
    const output = execSync(fullCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return JSON.parse(output.trim());
  } catch (error) {
    if (error.stdout) {
      try {
        const parsed = JSON.parse(error.stdout.trim());
        if (parsed.error) return parsed;
      } catch (e) {}
    }
    throw new Error(`执行 lark-cli 失败: ${error.message}`);
  }
}

async function cleanAndSync() {
  console.log('====== 开始清理飞书多维表格中的历史重复记录 ======');

  const baseToken = process.env.FEISHU_SPREADSHEET_ID;
  const tableId = process.env.FEISHU_SHEET_ID;

  if (!baseToken || !tableId) {
    console.error('未配置飞书多维表格，请先进行初始化。');
    process.exit(1);
  }

  // 1. 获取现有所有记录
  console.log('获取当前表格的所有记录...');
  const recordListResult = runCliCommand('base +record-list', [
    `--base-token ${baseToken}`,
    `--table-id ${tableId}`,
    '--format json'
  ]);

  if (!recordListResult.ok) {
    console.error('获取记录列表失败:', JSON.stringify(recordListResult, null, 2));
    process.exit(1);
  }

  // 直接从 CLI 返回的 JSON 中提取 record_id_list
  const recordIds = recordListResult.data?.record_id_list || [];

  if (recordIds.length > 0) {
    console.log(`发现 ${recordIds.length} 条历史记录，正在进行全量清理...`);
    
    // 创建临时 JSON 文件用于批量删除
    const scratchDir = path.join(__dirname, '../../scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }

    const deleteJson = {
      record_id_list: recordIds
    };
    const tempFile = path.join(scratchDir, 'batch_delete.json');
    fs.writeFileSync(tempFile, JSON.stringify(deleteJson, null, 2));

    const deleteResult = runCliCommand('base +record-delete', [
      `--base-token ${baseToken}`,
      `--table-id ${tableId}`,
      `--json "@./scratch/batch_delete.json"`,
      '--yes'
    ]);

    if (deleteResult.ok) {
      console.log('✅ 历史垃圾与重复数据清理完成！');
    } else {
      console.error('❌ 清理历史数据失败:', JSON.stringify(deleteResult, null, 2));
    }

    try {
      fs.unlinkSync(tempFile);
    } catch (e) {}
  } else {
    console.log('表格中没有发现历史记录，无需清理。');
  }

  // 2. 重新进行同步
  console.log('正在执行全新数据增量同步...');
  
  const Database = require('../storage/database');
  const FeishuSheetSender = require('../push/feishuSheetSender');

  const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data', 'github_trending.db');
  const db = new Database(dbPath);
  await db.init();

  const repos = await db.getAllRepositories(500);
  const highValRepos = repos.filter(repo => repo.commercial_score >= 75 && repo.ai_report);

  if (highValRepos.length > 0) {
    const reposByCategory = {};
    highValRepos.forEach(repo => {
      const cat = repo.category || 'other';
      if (!reposByCategory[cat]) {
        reposByCategory[cat] = [];
      }
      reposByCategory[cat].push(repo);
    });

    const feishuSender = new FeishuSheetSender({
      spreadsheetId: baseToken,
      sheetId: tableId
    });

    await feishuSender.sendToSheet(reposByCategory);
    console.log('🎉 飞书多维表格高价值变现数据已完美写入！');
  } else {
    console.log('未在 SQLite 中发现符合评分条件的记录。');
  }
  
  db.close();
  console.log('====== 飞书多维表格升级同步完成！ ======');
}

if (require.main === module) {
  cleanAndSync().catch(console.error);
}

module.exports = cleanAndSync;
