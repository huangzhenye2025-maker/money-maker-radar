const nodemailer = require('nodemailer');

class EmailSender {
  constructor(config) {
    this.config = config;
    this.transporter = null;
  }

  // 初始化邮件发送器
  async init() {
    // 只有在配置完整时才初始化
    if (!this.config.user || !this.config.pass) {
      console.warn('邮件配置不完整，跳过邮件发送器初始化');
      return;
    }
    
    try {
      this.transporter = nodemailer.createTransport({
        service: this.config.service || 'smtp.gmail.com',
        port: this.config.port || 587,
        secure: false,
        auth: {
          user: this.config.user,
          pass: this.config.pass
        }
      });

      // 验证连接
      await this.transporter.verify();
      console.log('邮件发送器初始化成功');
    } catch (error) {
      console.error('邮件发送器初始化失败:', error);
      throw error;
    }
  }

  // 生成邮件内容
  generateEmailContent(reposByCategory) {
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>GitHub 热门仓库推送</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          h1 { color: #333; }
          h2 { color: #555; margin-top: 30px; }
          ul { list-style-type: none; padding: 0; }
          li { margin-bottom: 15px; padding: 10px; border-bottom: 1px solid #eee; }
          .repo-name { font-weight: bold; color: #0366d6; }
          .repo-description { font-size: 14px; color: #666; margin-top: 5px; }
          .repo-meta { font-size: 12px; color: #999; margin-top: 5px; }
        </style>
      </head>
      <body>
        <h1>GitHub 热门仓库推送</h1>
        <p>以下是您关注的分类的热门仓库：</p>
    `;

    for (const [category, repos] of Object.entries(reposByCategory)) {
      if (repos.length > 0) {
        html += `
          <h2>${this.capitalizeCategory(category)}</h2>
          <ul>
        `;

        repos.forEach(repo => {
          html += `
            <li>
              <div class="repo-name"><a href="${repo.url}" target="_blank">${repo.name}</a></div>
              ${repo.description ? `<div class="repo-description">${repo.description}</div>` : ''}
              <div class="repo-meta">
                ${repo.language ? `语言: ${repo.language} | ` : ''}
                ${repo.stars ? `星标: ${repo.stars} | ` : ''}
                ${repo.forks ? `分叉: ${repo.forks}` : ''}
              </div>
            </li>
          `;
        });

        html += `
          </ul>
        `;
      }
    }

    html += `
      </body>
      </html>
    `;

    return html;
  }

  // 发送邮件
  async sendEmail(to, subject, reposByCategory) {
    if (!this.transporter) {
      throw new Error('邮件发送器未初始化');
    }

    const html = this.generateEmailContent(reposByCategory);

    const mailOptions = {
      from: this.config.user,
      to,
      subject,
      html
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('邮件发送成功:', info.messageId);
      return info;
    } catch (error) {
      console.error('邮件发送失败:', error);
      throw error;
    }
  }

  // 分类名称首字母大写
  capitalizeCategory(category) {
    const categoryMap = {
      frontend: '前端',
      backend: '后端',
      mobile: '移动开发',
      devops: 'DevOps',
      data: '数据科学',
      blockchain: '区块链',
      gaming: '游戏开发',
      tools: '工具',
      other: '其他'
    };
    return categoryMap[category] || category.charAt(0).toUpperCase() + category.slice(1);
  }

  // 关闭邮件发送器
  close() {
    if (this.transporter) {
      this.transporter.close();
    }
  }
}

module.exports = EmailSender;
