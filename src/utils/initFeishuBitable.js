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

async function initBitable() {
  console.log('====== 开始进行飞书多维表格 CLI 初始化 ======');
  
  // 1. 验证 lark-cli 连接状态
  console.log('正在验证飞书 CLI 登录与连接状态...');
  let doctorResult;
  try {
    doctorResult = runCliCommand('doctor');
  } catch (err) {
    console.error('飞书 CLI 检查失败，请确保您已全局安装并且已成功登录。');
    console.error('可以手动尝试运行: lark-cli auth login');
    process.exit(1);
  }

  if (!doctorResult || !doctorResult.ok) {
    console.error('飞书 CLI 状态不正确:', JSON.stringify(doctorResult, null, 2));
    process.exit(1);
  }
  console.log(`飞书 CLI 连接正常，授权账号为: ${doctorResult.checks.find(c => c.name === 'token_exists')?.message || '已登录'}`);

  let baseToken = process.env.FEISHU_SPREADSHEET_ID;
  let isNewBase = false;

  // 2. 如果没有配置 FEISHU_SPREADSHEET_ID，或者传入了重新创建的参数，则自动创建一个新的 Bitable
  if (!baseToken || baseToken.trim() === '') {
    console.log('未检测到已有的 FEISHU_SPREADSHEET_ID，将使用 CLI 自动创建一个新的飞书多维表格...');
    const createResult = runCliCommand('base +base-create', ['--name "GitHub变现热点监控台"']);
    if (createResult.ok && createResult.data?.base?.base_token) {
      baseToken = createResult.data.base.base_token;
      isNewBase = true;
      console.log(`🎉 成功创建新的飞书多维表格！`);
      console.log(`👉 访问链接: ${createResult.data.base.url}`);
      console.log(`👉 Base Token: ${baseToken}`);
    } else {
      console.error('创建多维表格失败:', JSON.stringify(createResult, null, 2));
      process.exit(1);
    }
  } else {
    console.log(`检测到已配置 FEISHU_SPREADSHEET_ID: ${baseToken}，将进行增量更新或字段同步。`);
  }

  // 3. 获取现有的表格列表
  console.log('获取多维表格中的数据表列表...');
  const tableListResult = runCliCommand('base +table-list', [`--base-token ${baseToken}`]);
  if (!tableListResult.ok) {
    console.error('获取表格列表失败:', JSON.stringify(tableListResult, null, 2));
    process.exit(1);
  }

  const tables = tableListResult.data?.tables || [];
  let tableId = process.env.FEISHU_SHEET_ID;
  let targetTable = tables.find(t => t.id === tableId || t.name === 'GitHub热点监控');

  if (!targetTable) {
    // 找不到目标表格，如果是新创建的，将默认的“数据表”重命名为“GitHub热点监控”
    const defaultTable = tables.find(t => t.name === '数据表' || t.name === 'Table');
    if (defaultTable) {
      console.log(`重命名默认表格 "${defaultTable.name}" 为 "GitHub热点监控"...`);
      const renameResult = runCliCommand('base +table-update', [
        `--base-token ${baseToken}`,
        `--table-id ${defaultTable.id}`,
        `--name "GitHub热点监控"`
      ]);
      if (renameResult.ok) {
        targetTable = renameResult.data.table;
        tableId = targetTable.id;
        console.log(`成功重命名数据表，ID 为: ${tableId}`);
      } else {
        console.error('重命名数据表失败:', JSON.stringify(renameResult, null, 2));
        process.exit(1);
      }
    } else {
      // 没有任何数据表，新建一个
      console.log('新建数据表 "GitHub热点监控"...');
      const createTableResult = runCliCommand('base +table-create', [
        `--base-token ${baseToken}`,
        `--name "GitHub热点监控"`
      ]);
      if (createTableResult.ok) {
        targetTable = createTableResult.data.table;
        tableId = targetTable.id;
        console.log(`新建数据表成功，ID 为: ${tableId}`);
      } else {
        console.error('新建数据表失败:', JSON.stringify(createTableResult, null, 2));
        process.exit(1);
      }
    }
  } else {
    tableId = targetTable.id;
    console.log(`定位到目标数据表: ${targetTable.name} (ID: ${tableId})`);
  }

  // 4. 获取现有字段列表
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
  console.log(`当前拥有 ${existingFields.length} 个字段:`, existingFields.map(f => `${f.name}(${f.type})`).join(', '));

  // 创建临时配置文件夹用于存放 field-create JSON
  const scratchDir = path.join(__dirname, '../../scratch');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  // 定义所有需要的字段名和类型
  const requiredFields = [
    { name: '描述', type: 'text' },
    { name: '语言', type: 'text' },
    { name: '星标数', type: 'number' },
    { name: '分叉数', type: 'number' },
    { name: '分类', type: 'text' },
    { name: '商业化评分', type: 'number' },
    { name: '变现模式建议', type: 'text' },
    { name: '目标痛点分析', type: 'text' },
    { name: 'MVP落地路线图', type: 'text' },
    { name: '定价体系建议', type: 'text' },
    { name: '竞品矩阵', type: 'text' },
    { name: '链接', type: 'url' },
    { name: '更新时间', type: 'datetime' }
  ];

  // 4.1 检查并重命名首个默认文本字段 (多维表格必有一个默认主文本列)
  const defaultTextFields = existingFields.filter(f => f.type === 'text' && (f.name === '文本' || f.name === 'Title' || f.name === 'Text'));
  if (defaultTextFields.length > 0 && !existingFields.some(f => f.name === '仓库名称')) {
    const defaultField = defaultTextFields[0];
    console.log(`重命名主文本列 "${defaultField.name}" 为 "仓库名称"...`);
    const tempFile = path.join(scratchDir, 'rename_main.json');
    fs.writeFileSync(tempFile, JSON.stringify({ name: '仓库名称', type: 'text' }, null, 2));
    
    const updateResult = runCliCommand('base +field-update', [
      `--base-token ${baseToken}`,
      `--table-id ${tableId}`,
      `--field-id ${defaultField.id}`,
      `--json "@./scratch/rename_main.json"`
    ]);
    if (updateResult.ok) {
      console.log('成功重命名主文本列！');
    } else {
      console.error('重命名主列失败:', JSON.stringify(updateResult, null, 2));
    }
  }

  // 4.2 清理垃圾字段 (比如默认创建的 "单选", "日期", "附件" 等)
  const garbageFields = existingFields.filter(f => ['单选', '日期', '附件', 'Select', 'DateTime', 'Attachment'].includes(f.name));
  for (const field of garbageFields) {
    console.log(`清理默认垃圾字段 "${field.name}" (ID: ${field.id})...`);
    runCliCommand('base +field-delete', [
      `--base-token ${baseToken}`,
      `--table-id ${tableId}`,
      `--field-id ${field.id}`,
      '--yes'
    ]);
  }

  // 4.3 同步所有必需字段
  console.log('开始同步目标字段列...');
  // 重新获取一下当前字段以保证列表最新
  const refreshedFieldListResult = runCliCommand('base +field-list', [
    `--base-token ${baseToken}`,
    `--table-id ${tableId}`
  ]);
  const currentFields = refreshedFieldListResult.data?.fields || [];

  for (const targetField of requiredFields) {
    const exists = currentFields.some(f => f.name === targetField.name);
    if (!exists) {
      console.log(`🔧 正在创建缺失的字段: "${targetField.name}" (${targetField.type})...`);
      const tempFile = path.join(scratchDir, `field_${targetField.name}.json`);
      fs.writeFileSync(tempFile, JSON.stringify({ name: targetField.name, type: targetField.type }, null, 2));
      
      const createResult = runCliCommand('base +field-create', [
        `--base-token ${baseToken}`,
        `--table-id ${tableId}`,
        `--json "@./scratch/field_${targetField.name}.json"`
      ]);

      if (createResult.ok) {
        console.log(`✅ 成功创建字段: "${targetField.name}"`);
      } else {
        console.error(`❌ 创建字段 "${targetField.name}" 失败:`, JSON.stringify(createResult, null, 2));
      }
    } else {
      console.log(`⏭️ 字段已存在，跳过创建: "${targetField.name}"`);
    }
  }

  // 清除 scratch 下的字段临时文件
  try {
    const files = fs.readdirSync(scratchDir);
    for (const file of files) {
      if (file.startsWith('field_') || file.startsWith('rename_')) {
        fs.unlinkSync(path.join(scratchDir, file));
      }
    }
  } catch (e) {}

  // 5. 更新 .env 文件
  console.log('====== 多维表格字段配置同步成功！开始更新环境变量 ======');
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  const updateEnvKey = (key, value) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  };

  updateEnvKey('FEISHU_SPREADSHEET_ID', baseToken);
  updateEnvKey('FEISHU_SHEET_ID', tableId);

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log(`✅ 成功将多维表格配置写入到 .env 文件中：`);
  console.log(`   FEISHU_SPREADSHEET_ID=${baseToken}`);
  console.log(`   FEISHU_SHEET_ID=${tableId}`);
  console.log('====== 飞书多维表格 CLI 初始化完成！ ======');
}

if (require.main === module) {
  initBitable().catch(console.error);
}

module.exports = initBitable;
