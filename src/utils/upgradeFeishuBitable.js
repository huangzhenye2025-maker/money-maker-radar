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

async function upgradeBitable() {
  console.log('====== 开始进行飞书多维表格视觉与视图高级升级 ======');

  const baseToken = process.env.FEISHU_SPREADSHEET_ID;
  const tableId = process.env.FEISHU_SHEET_ID;

  if (!baseToken || !tableId) {
    console.error('未配置飞书多维表格的 baseToken 或 tableId，请先运行初始化。');
    process.exit(1);
  }

  // 1. 获取现有字段列表以查找分类和语言字段的 ID
  console.log('获取数据表字段列表...');
  const fieldListResult = runCliCommand('base +field-list', [
    `--base-token ${baseToken}`,
    `--table-id ${tableId}`
  ]);
  if (!fieldListResult.ok) {
    console.error('获取字段列表失败:', JSON.stringify(fieldListResult, null, 2));
    process.exit(1);
  }

  const existingFields = fieldListResult.data?.fields || [];
  const categoryField = existingFields.find(f => f.name === '分类');
  const languageField = existingFields.find(f => f.name === '语言');

  // 创建临时配置文件夹
  const scratchDir = path.join(__dirname, '../../scratch');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  // 2. 升级“分类”为单选下拉框，配置彩虹配色和 Emoji (扁平化 JSON 格式)
  if (categoryField) {
    console.log(`正在将“分类”字段 (ID: ${categoryField.id}) 升级为高质感单选字段...`);
    
    const categoryJson = {
      name: '分类',
      type: 'select',
      multiple: false,
      options: [
        { name: '🤖 AI与数据', color: 2 },
        { name: '🎨 前端开发', color: 5 },
        { name: '⚡ 后端开发', color: 6 },
        { name: '🚀 运维部署', color: 4 },
        { name: '📱 移动开发', color: 0 },
        { name: '⛓️ Web3/区块链', color: 3 },
        { name: '🎮 游戏开发', color: 1 },
        { name: '🛠️ 实用工具', color: 7 },
        { name: '📦 其他分类', color: 7 }
      ]
    };

    const tempFile = path.join(scratchDir, 'update_category.json');
    fs.writeFileSync(tempFile, JSON.stringify(categoryJson, null, 2));

    const updateResult = runCliCommand('base +field-update', [
      `--base-token ${baseToken}`,
      `--table-id ${tableId}`,
      `--field-id ${categoryField.id}`,
      `--json "@./scratch/update_category.json"`
    ]);

    if (updateResult.ok) {
      console.log('✅ “分类”字段升级成功！');
    } else {
      console.error('❌ “分类”字段升级失败:', JSON.stringify(updateResult, null, 2));
    }
  }

  // 3. 升级“语言”为精美单选下拉框 (扁平化 JSON 格式)
  if (languageField) {
    console.log(`正在将“语言”字段 (ID: ${languageField.id}) 升级为高质感单选字段...`);
    
    const languageJson = {
      name: '语言',
      type: 'select',
      multiple: false,
      options: [
        { name: 'Python', color: 5 },
        { name: 'JavaScript', color: 3 },
        { name: 'TypeScript', color: 5 },
        { name: 'Go', color: 5 },
        { name: 'Rust', color: 2 },
        { name: 'Java', color: 1 },
        { name: 'C++', color: 6 },
        { name: 'Vue', color: 4 },
        { name: 'React', color: 5 },
        { name: 'HTML', color: 2 },
        { name: 'CSS', color: 6 },
        { name: 'Shell', color: 7 },
        { name: '其他语言', color: 7 }
      ]
    };

    const tempFile = path.join(scratchDir, 'update_language.json');
    fs.writeFileSync(tempFile, JSON.stringify(languageJson, null, 2));

    const updateResult = runCliCommand('base +field-update', [
      `--base-token ${baseToken}`,
      `--table-id ${tableId}`,
      `--field-id ${languageField.id}`,
      `--json "@./scratch/update_language.json"`
    ]);

    if (updateResult.ok) {
      console.log('✅ “语言”字段升级成功！');
    } else {
      console.error('❌ “语言”字段升级失败:', JSON.stringify(updateResult, null, 2));
    }
  }

  // 4. 创建高级视图
  console.log('正在获取现有视图列表...');
  const viewListResult = runCliCommand('base +view-list', [
    `--base-token ${baseToken}`,
    `--table-id ${tableId}`
  ]);
  const views = viewListResult.data?.views || [];
  console.log(`当前拥有 ${views.length} 个视图:`, views.map(v => `${v.name}(${v.type})`).join(', '));

  // 4.1 创建“项目变现卡片墙 (画廊视图)”
  if (!views.some(v => v.name === '🎴 项目变现卡片墙')) {
    console.log('正在创建 🎴 项目变现卡片墙 (画廊视图)...');
    const viewJson = {
      name: '🎴 项目变现卡片墙',
      view_type: 'gallery'
    };
    const tempFile = path.join(scratchDir, 'create_view_gallery.json');
    fs.writeFileSync(tempFile, JSON.stringify(viewJson, null, 2));

    const createResult = runCliCommand('base +view-create', [
      `--base-token ${baseToken}`,
      `--table-id ${tableId}`,
      `--json "@./scratch/create_view_gallery.json"`
    ]);

    if (createResult.ok) {
      console.log('✅ 画廊视图创建成功！');
    } else {
      console.error('❌ 画廊视图创建失败:', JSON.stringify(createResult, null, 2));
    }
  }

  // 4.2 创建“技术分类看板 (看板视图)”
  if (!views.some(v => v.name === '🗂️ 技术分类看板')) {
    console.log('正在创建 🗂️ 技术分类看板 (看板视图)...');
    const viewJson = {
      name: '🗂️ 技术分类看板',
      view_type: 'kanban'
    };
    const tempFile = path.join(scratchDir, 'create_view_kanban.json');
    fs.writeFileSync(tempFile, JSON.stringify(viewJson, null, 2));

    const createResult = runCliCommand('base +view-create', [
      `--base-token ${baseToken}`,
      `--table-id ${tableId}`,
      `--json "@./scratch/create_view_kanban.json"`
    ]);

    if (createResult.ok) {
      console.log('✅ 看板视图创建成功！');
    } else {
      console.error('❌ 看板视图创建失败:', JSON.stringify(createResult, null, 2));
    }
  }

  // 清除 scratch 下的临时文件
  try {
    const files = fs.readdirSync(scratchDir);
    for (const file of files) {
      if (file.startsWith('update_') || file.startsWith('create_view_')) {
        fs.unlinkSync(path.join(scratchDir, file));
      }
    }
  } catch (e) {}

  console.log('====== 飞书多维表格视觉与视图高级升级成功！ ======');
}

if (require.main === module) {
  upgradeBitable().catch(console.error);
}

module.exports = upgradeBitable;
