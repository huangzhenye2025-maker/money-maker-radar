const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class FeishuLedgerSender {
  constructor() {}

  // 辅助函数：安全执行 lark-cli 命令
  runCliCommand(command, args = [], options = {}) {
    try {
      const fullCmd = `lark-cli ${command} ${args.join(' ')}`;
      console.log(`执行飞书台账推送命令: ${fullCmd}`);
      const output = execSync(fullCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], ...options });
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

  // 推送单条文案记录到台账
  async sendToLedger({ projectName, platform, copyText, status = '已发布' }) {
    try {
      const baseToken = process.env.FEISHU_LEDGER_BASE_TOKEN || process.env.FEISHU_SPREADSHEET_ID;
      const tableId = process.env.FEISHU_LEDGER_TABLE_ID;

      if (!baseToken || !tableId) {
        throw new Error('未配置飞书台账的 FEISHU_LEDGER_BASE_TOKEN 或 FEISHU_LEDGER_TABLE_ID');
      }

      const timestamp = new Date().getTime();

      /**
       * 从生成的文案里智能提取标题
       * 优先取第一个 # 标题行 / Emoji 开头行 / 非空第一行
       */
      const extractTitle = (text) => {
        if (!text) return projectName || '未知内容';
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        
        for (const line of lines) {
          // 过滤掉 AI 常见的开场白/废话
          if (/^(好的|收到|没问题|这里是|为你|当然|以下是|作为)/.test(line)) {
            continue;
          }
          
          // 优先匹配 Markdown 一级标题
          const h1 = line.match(/^#{1,2}\s+(.+)/);
          if (h1) {
            let t = h1[1].replace(/[*_`]/g, '').trim();
            // 如果 AI 输出了 "标题：xxx"，把 "标题：" 去掉
            t = t.replace(/^(标题：|标题:)/, '').trim();
            return t.slice(0, 100);
          }
          
          // 匹配以 Emoji 或中文开头的短句（通常是爆款标题）
          if (line.length <= 80 && /^[\u4e00-\u9fa5\uD83C-\uDBFF\uDC00-\uDFFF🎯🔥💡⚡🚀]/.test(line)) {
            let t = line.replace(/[*_`#]/g, '').trim();
            t = t.replace(/^(标题：|标题:)/, '').trim();
            return t.slice(0, 100);
          }
        }
        // 兜底：取第一非空且非废话的行
        for (const line of lines) {
          if (!/^(好的|收到|没问题|这里是|为你|当然|以下是|作为)/.test(line)) {
            let t = line.replace(/[*_`#]/g, '').trim();
            t = t.replace(/^(标题：|标题:)/, '').trim();
            return t.slice(0, 100);
          }
        }
        return (lines[0] || projectName || '未知内容').replace(/[*_`#]/g, '').trim().slice(0, 100);
      };

      const title = extractTitle(copyText);

      // 构建多维表需要的 payload (官方 API 结构)
      const payload = {
        records: [
          {
            fields: {
              "平台": platform === 'xiaohongshu' ? '小红书' : '公众号',
              "内容标题": title,
              "发布状态": '草稿',
              "数据记录时间": timestamp,
              "发布时间": timestamp,
              "备注": copyText || ''
            }
          }
        ]
      };

      // 写入临时文件以处理大文本
      const scratchDir = path.join(__dirname, '../../scratch');
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }

      const tempPushFile = path.join(scratchDir, `ledger_push_${Date.now()}.json`);
      fs.writeFileSync(tempPushFile, JSON.stringify(payload, null, 2));

      // 执行插入 (使用通用 api POST 绕过 cli 的 base-token 校验)
      const response = this.runCliCommand('api POST', [
        `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records/batch_create`,
        `--data "@${path.basename(tempPushFile)}"`
      ], { cwd: scratchDir });

      if (response && response.code === 0) {
        console.log(`🎉 成功同步 1 条文案到飞书台账！`);
      } else {
        throw new Error(`飞书 CLI 推送台账失败: ${JSON.stringify(response)}`);
      }

      // 清理临时文件
      try {
        fs.unlinkSync(tempPushFile);
      } catch (e) {}

      return { success: true };
    } catch (error) {
      console.error('同步飞书台账失败:', error);
      throw error;
    }
  }
}

module.exports = new FeishuLedgerSender();
