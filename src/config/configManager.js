const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor() {
    this.config = {};
    this.loadConfig();
  }

  // 加载配置
  loadConfig() {
    // 加载.env文件
    dotenv.config({ override: true });

    // 基础配置
    this.config = {
      // GitHub API配置
      github: {
        token: process.env.GITHUB_TOKEN || ''
      },

      // 邮件配置
      email: {
        service: process.env.EMAIL_SERVICE || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        user: process.env.EMAIL_USER || '',
        pass: process.env.EMAIL_PASS || '',
        to: process.env.EMAIL_TO || ''
      },

      // 飞书配置
      feishu: {
        appId: process.env.FEISHU_APP_ID || '',
        appSecret: process.env.FEISHU_APP_SECRET || '',
        spreadsheetId: process.env.FEISHU_SPREADSHEET_ID || '',
        sheetId: process.env.FEISHU_SHEET_ID || ''
      },

      // 推送配置
      push: {
        interval: parseInt(process.env.PUSH_INTERVAL) || 24 // 小时
      },

      // 数据库配置
      database: {
        path: process.env.DB_PATH || path.join(__dirname, '../../data', 'github_trending.db')
      },

      // 分类配置
      categories: {
        languages: (process.env.CATEGORIES || 'JavaScript,Python,Go,Java,C++,TypeScript,Rust').split(',')
      }
    };

    // 确保数据目录存在
    this.ensureDataDir();
  }

  // 确保数据目录存在
  ensureDataDir() {
    const dataDir = path.dirname(this.config.database.path);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  // 获取配置
  get(key, defaultValue = null) {
    const keys = key.split('.');
    let value = this.config;

    for (const k of keys) {
      if (value[k] === undefined) {
        return defaultValue;
      }
      value = value[k];
    }

    return value;
  }

  // 设置配置
  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!obj[k]) {
        obj[k] = {};
      }
      obj = obj[k];
    }

    obj[keys[keys.length - 1]] = value;
  }

  // 验证配置
  validate() {
    const errors = [];

    // 邮件配置为可选，只给出警告
    if (!this.config.email.user || !this.config.email.pass || !this.config.email.to) {
      console.warn('邮件配置不完整，将跳过邮件推送功能');
    }

    return {
      valid: true, // 即使邮件配置不完整，也允许应用运行
      errors
    };
  }

  // 获取完整配置
  getAll() {
    return this.config;
  }
}

// 导出单例
module.exports = new ConfigManager();
