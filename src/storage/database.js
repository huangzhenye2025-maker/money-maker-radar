const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  // 初始化数据库
  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          this.createTables()
            .then(() => this.runMigrations())
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }

  // 创建基础表
  async createTables() {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS repositories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          language TEXT,
          stars TEXT,
          forks TEXT,
          stars_today TEXT,
          url TEXT UNIQUE,
          category TEXT,
          tags TEXT,
          created_at TEXT,
          updated_at TEXT,
          fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_repositories_category ON repositories(category);
        CREATE INDEX IF NOT EXISTS idx_repositories_language ON repositories(language);
        CREATE INDEX IF NOT EXISTS idx_repositories_fetched_at ON repositories(fetched_at);
      `;

      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // 执行增量数据库迁移（增加商业化评估和收藏相关字段，以及社媒监控表）
  async runMigrations() {
    return new Promise((resolve) => {
      const migrations = [
        'ALTER TABLE repositories ADD COLUMN commercial_score INTEGER DEFAULT -1;',
        'ALTER TABLE repositories ADD COLUMN ai_report TEXT;',
        'ALTER TABLE repositories ADD COLUMN is_starred INTEGER DEFAULT 0;',
        'ALTER TABLE repositories ADD COLUMN description_zh TEXT;',
        `CREATE TABLE IF NOT EXISTS social_trends (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform TEXT NOT NULL,
          title TEXT NOT NULL,
          url TEXT UNIQUE,
          views_or_likes TEXT,
          published_at TEXT,
          fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          associated_repo_id INTEGER,
          match_reason TEXT
        );`,
        `CREATE TABLE IF NOT EXISTS social_analyses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          report TEXT NOT NULL
        );`,
        'ALTER TABLE social_trends ADD COLUMN github_score INTEGER DEFAULT -1;',
        'ALTER TABLE social_trends ADD COLUMN social_score INTEGER DEFAULT -1;',
        'ALTER TABLE social_trends ADD COLUMN trend_direction TEXT DEFAULT "→";',
        'ALTER TABLE social_trends ADD COLUMN verdict TEXT;',
        'ALTER TABLE social_analyses ADD COLUMN structured_data TEXT;',
        'ALTER TABLE social_trends ADD COLUMN domestic_score INTEGER DEFAULT -1;',
        'ALTER TABLE social_trends ADD COLUMN info_gap INTEGER DEFAULT 0;',
        'ALTER TABLE social_trends ADD COLUMN xhs_copy TEXT;'
      ];

      let completed = 0;
      const executeNext = () => {
        if (completed >= migrations.length) {
          resolve();
          return;
        }

        const sql = migrations[completed];
        this.db.run(sql, (err) => {
          // 如果列已存在，或者表已存在，我们在本机制中也忽略报错，继续下一个迁移
          completed++;
          executeNext();
        });
      };

      executeNext();
    });
  }

  // 插入仓库数据（使用 ON CONFLICT 模式，保证更新时不会抹除 AI 报告和收藏状态）
  async insertRepository(repo) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO repositories 
        (name, description, language, stars, forks, stars_today, url, category, tags, created_at, updated_at, description_zh)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          language = excluded.language,
          stars = excluded.stars,
          forks = excluded.forks,
          stars_today = excluded.stars_today,
          category = excluded.category,
          tags = excluded.tags,
          updated_at = excluded.updated_at,
          fetched_at = CURRENT_TIMESTAMP,
          description_zh = COALESCE(excluded.description_zh, repositories.description_zh)
      `;

      const tags = Array.isArray(repo.tags) ? JSON.stringify(repo.tags) : repo.tags;

      this.db.run(sql, [
        repo.name,
        repo.description,
        repo.language,
        repo.stars,
        repo.forks,
        repo.starsToday,
        repo.url,
        repo.category,
        tags,
        repo.created_at,
        repo.updated_at,
        repo.description_zh || null
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  // 批量插入仓库数据
  async insertBatch(repos) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        const sql = `
          INSERT INTO repositories 
          (name, description, language, stars, forks, stars_today, url, category, tags, created_at, updated_at, description_zh)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(url) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            language = excluded.language,
            stars = excluded.stars,
            forks = excluded.forks,
            stars_today = excluded.stars_today,
            category = excluded.category,
            tags = excluded.tags,
            updated_at = excluded.updated_at,
            fetched_at = CURRENT_TIMESTAMP,
            description_zh = COALESCE(excluded.description_zh, repositories.description_zh)
        `;

        const stmt = this.db.prepare(sql);
        let error = null;

        repos.forEach(repo => {
          if (error) return;

          const tags = Array.isArray(repo.tags) ? JSON.stringify(repo.tags) : repo.tags;

          try {
            stmt.run([
              repo.name,
              repo.description,
              repo.language,
              repo.stars,
              repo.forks,
              repo.starsToday,
              repo.url,
              repo.category,
              tags,
              repo.created_at,
              repo.updated_at,
              repo.description_zh || null
            ]);
          } catch (err) {
            error = err;
          }
        });

        stmt.finalize((err) => {
          if (error) {
            reject(error);
          } else if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  // 智能算法：基于技术标签与描述关键词预测小红书定位分类（用于未评估项目的即时过滤）
  getHeuristicXhsCategory(name, description, language) {
    const desc = (description || '').toLowerCase();
    const lang = (language || '').toLowerCase();
    const repoName = (name || '').toLowerCase();

    // 1. 极简、高颜值的应用 (Minimalist, beautiful UI apps)
    const xhsUiKeywords = [
      'ui', 'theme', 'design', 'client', 'editor', 'beautiful', 'desktop', 
      'aesthetic', 'dashboard', 'clock', 'calendar', 'kanban', 'schedule', 
      'player', 'markdown', 'note', 'diary', 'minimalist', 'wallpaper', 'frontend',
      'music', 'sound', 'noise', 'white-noise', 'font', 'terminal', 'customizer'
    ];
    const isUiOriented = xhsUiKeywords.some(kw => desc.includes(kw) || repoName.includes(kw)) && 
                         ['css', 'html', 'typescript', 'javascript', 'vue', 'svelte', 'react'].includes(lang);

    if (isUiOriented) {
      return '极简、高颜值的应用';
    }

    // 2. 视觉反差极大的一键式本地工具 (Visual contrast "one-click" local tools)
    const xhsLocalKeywords = [
      'compress', 'image', 'video', 'photo', 'clean', 'optimize', 'remove', 
      'bg', 'anime', 'cartoon', 'upscale', 'super-resolution', 'resize', 
      'watermark', 'format', 'cli', 'local', 'script', 'ffmpeg', 'c-drive', 
      'disk', 'installer', 'executable', 'exe'
    ];
    const isLocalTool = xhsLocalKeywords.some(kw => desc.includes(kw) || repoName.includes(kw));
    if (isLocalTool) {
      return '视觉反差极大的一键式本地工具';
    }

    // 3. 副业/效率开挂神器 (Side-hustle/efficiency cheat tools)
    return '副业/效率开挂神器';
  }

  // 辅助解析行数据中的 tags 和 ai_report 字段
  parseRows(rows) {
    return rows.map(row => {
      let parsedTags = [];
      try {
        parsedTags = row.tags ? JSON.parse(row.tags) : [];
      } catch (e) {
        parsedTags = typeof row.tags === 'string' ? row.tags.split(',') : [];
      }

      let parsedReport = null;
      try {
        parsedReport = row.ai_report ? JSON.parse(row.ai_report) : null;
      } catch (e) {
        parsedReport = null;
      }

      // 智能预测/装配小红书定位分类（向下兼容并支持未评估仓库检索）
      const predictedCategory = this.getHeuristicXhsCategory(row.name, row.description, row.language);
      if (parsedReport) {
        if (!parsedReport.xhsCategory) {
          parsedReport.xhsCategory = predictedCategory;
          parsedReport.xhsCategoryReason = '（智能算法预测）该项目非常符合此类小红书选品，推荐运行 AI 分析以获取专属变现包装。';
        }
      } else {
        parsedReport = {
          xhsCategory: predictedCategory,
          xhsCategoryReason: '（智能算法预测）该项目非常符合此类小红书选品，推荐运行 AI 分析以获取专属变现包装。'
        };
      }

      return {
        ...row,
        tags: parsedTags,
        ai_report: parsedReport
      };
    });
  }

  // 根据分类获取仓库
  async getRepositoriesByCategory(category, limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM repositories 
        WHERE category = ? 
        ORDER BY fetched_at DESC 
        LIMIT ?
      `;

      this.db.all(sql, [category, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(this.parseRows(rows));
        }
      });
    });
  }

  // 获取所有分类的仓库
  async getAllRepositories(limit = 100) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM repositories 
        ORDER BY fetched_at DESC 
        LIMIT ?
      `;

      this.db.all(sql, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(this.parseRows(rows));
        }
      });
    });
  }

  async queryRepositories({ category, language, minStars, minScore, hasReport, isStarred, query, sortBy = 'fetched_at', limit = 50, offset = 0 }) {
    return new Promise((resolve, reject) => {
      let sql = `SELECT * FROM repositories WHERE 1=1`;
      const params = [];

      if (category) {
        sql += ` AND category = ?`;
        params.push(category);
      }

      if (language) {
        sql += ` AND language = ?`;
        params.push(language);
      }

      if (minStars) {
        sql += ` AND CAST(REPLACE(stars, ',', '') AS INTEGER) >= ?`;
        params.push(parseInt(minStars));
      }

      if (query) {
        sql += ` AND (name LIKE ? OR description LIKE ?)`;
        params.push(`%${query}%`, `%${query}%`);
      }

      // 动态排序引擎
      let orderBySql = ' ORDER BY fetched_at DESC';
      if (sortBy === 'ai_score') {
        orderBySql = ` ORDER BY commercial_score DESC, fetched_at DESC`;
      } else if (sortBy === 'stars_today') {
        orderBySql = ` ORDER BY CAST(REPLACE(REPLACE(REPLACE(REPLACE(stars_today, 'stars today', ''), 'stars', ''), ',', ''), ' ', '') AS INTEGER) DESC, fetched_at DESC`;
      } else if (sortBy === 'stars') {
        orderBySql = ` ORDER BY CAST(REPLACE(stars, ',', '') AS INTEGER) DESC`;
      }

      sql += orderBySql;

      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          let parsed = this.parseRows(rows);
          resolve(parsed);
        }
      });
    });
  }


  // 更新 AI 报告与评分
  async updateTrendScores(url, data) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE social_trends 
        SET github_score = COALESCE(?, github_score),
            social_score = COALESCE(?, social_score),
            domestic_score = COALESCE(?, domestic_score),
            info_gap = COALESCE(?, info_gap),
            trend_direction = COALESCE(?, trend_direction),
            verdict = COALESCE(?, verdict),
            xhs_copy = COALESCE(?, xhs_copy)
        WHERE url = ?
      `;
      this.db.run(sql, [
        data.github_score,
        data.social_score,
        data.domestic_score,
        data.info_gap,
        data.trend_direction,
        data.verdict,
        data.xhs_copy,
        url
      ], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  // 更新 AI 报告与评分
  async updateAiReport(id, score, report) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE repositories 
        SET commercial_score = ?, ai_report = ? 
        WHERE id = ?
      `;
      const reportStr = typeof report === 'object' ? JSON.stringify(report) : report;

      this.db.run(sql, [score, reportStr, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  // 更新中文描述
  async updateDescriptionZh(id, descriptionZh) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE repositories 
        SET description_zh = ? 
        WHERE id = ?
      `;
      this.db.run(sql, [descriptionZh, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  // 收藏/取消收藏仓库
  async toggleStarred(id, isStarred) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE repositories 
        SET is_starred = ? 
        WHERE id = ?
      `;
      this.db.run(sql, [isStarred ? 1 : 0, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  // 获取高潜力商业变现项目 (评分 >= scoreThreshold)
  async getHighPotentialRepositories(scoreThreshold = 75, limit = 20) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM repositories 
        WHERE commercial_score >= ? 
        ORDER BY commercial_score DESC, fetched_at DESC 
        LIMIT ?
      `;

      this.db.all(sql, [scoreThreshold, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(this.parseRows(rows));
        }
      });
    });
  }

  // 获取分类统计
  async getCategoryStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT category, COUNT(*) as count 
        FROM repositories 
        GROUP BY category 
        ORDER BY count DESC
      `;

      this.db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 清理旧数据
  async cleanupOldData(days = 7) {
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM repositories 
        WHERE fetched_at < datetime('now', '-' || ? || ' days')
          AND is_starred = 0  -- 保留用户收藏的数据不被清理
      `;

      this.db.run(sql, [days], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  // 插入或更新社媒热点数据
  async insertSocialTrendsBatch(trends) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        const sql = `
          INSERT INTO social_trends (platform, title, url, views_or_likes, published_at, associated_repo_id, match_reason, github_score, social_score, domestic_score, info_gap, xhs_copy, trend_direction, verdict)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(url) DO UPDATE SET
            title = excluded.title,
            views_or_likes = excluded.views_or_likes,
            published_at = excluded.published_at,
            associated_repo_id = COALESCE(excluded.associated_repo_id, social_trends.associated_repo_id),
            match_reason = COALESCE(excluded.match_reason, social_trends.match_reason),
            github_score = COALESCE(excluded.github_score, social_trends.github_score),
            social_score = COALESCE(excluded.social_score, social_trends.social_score),
            domestic_score = COALESCE(excluded.domestic_score, social_trends.domestic_score),
            info_gap = COALESCE(excluded.info_gap, social_trends.info_gap),
            xhs_copy = COALESCE(excluded.xhs_copy, social_trends.xhs_copy),
            trend_direction = COALESCE(excluded.trend_direction, social_trends.trend_direction),
            verdict = COALESCE(excluded.verdict, social_trends.verdict),
            fetched_at = CURRENT_TIMESTAMP
        `;
        const stmt = this.db.prepare(sql);
        let error = null;

        trends.forEach(trend => {
          if (error) return;
          try {
            stmt.run([
              trend.platform,
              trend.title,
              trend.url,
              trend.views_or_likes || null,
              trend.published_at || null,
              trend.associated_repo_id || null,
              trend.match_reason || null,
              trend.github_score !== undefined ? trend.github_score : -1,
              trend.social_score !== undefined ? trend.social_score : -1,
              trend.domestic_score !== undefined ? trend.domestic_score : -1,
              trend.info_gap !== undefined ? trend.info_gap : 0,
              trend.xhs_copy || null,
              trend.trend_direction || '→',
              trend.verdict || null
            ]);
          } catch (e) {
            error = e;
          }
        });

        stmt.finalize((err) => {
          if (error) {
            reject(error);
          } else if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  // 获取所有社媒热点数据
  async getSocialTrends(limit = 100) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT t.*, r.name as repo_name, r.url as repo_url 
        FROM social_trends t
        LEFT JOIN repositories r ON t.associated_repo_id = r.id
        ORDER BY t.fetched_at DESC
        LIMIT ?
      `;
      this.db.all(sql, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 保存最新的 AI 社媒比对报告（支持结构化数据字段）
  async saveSocialAnalysis(report, structuredData = null) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO social_analyses (report, structured_data) VALUES (?, ?)`;
      const structuredStr = structuredData ? JSON.stringify(structuredData) : null;
      this.db.run(sql, [report, structuredStr], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  // 获取最近一次的 AI 社媒比对报告（含结构化数据）
  async getLatestSocialAnalysis() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT report, structured_data FROM social_analyses ORDER BY created_at DESC LIMIT 1`;
      this.db.get(sql, [], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          let structured = null;
          try { structured = row.structured_data ? JSON.parse(row.structured_data) : null; } catch(e) {}
          resolve({ report: row.report, structured });
        } else {
          resolve(null);
        }
      });
    });
  }

  // 获取社媒分析历史列表
  async getSocialAnalysisHistory(limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT id, created_at, substr(report, 1, 200) as preview FROM social_analyses ORDER BY created_at DESC LIMIT ?`;
      this.db.all(sql, [limit], (err, rows) => {
        if (err) { reject(err); } else { resolve(rows); }
      });
    });
  }

  // 获取指定历史报告
  async getSocialAnalysisById(id) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT report, structured_data, created_at FROM social_analyses WHERE id = ?`;
      this.db.get(sql, [id], (err, row) => {
        if (err) { reject(err); }
        else if (row) {
          let structured = null;
          try { structured = row.structured_data ? JSON.parse(row.structured_data) : null; } catch(e) {}
          resolve({ report: row.report, structured, created_at: row.created_at });
        } else { resolve(null); }
      });
    });
  }

  // 关闭数据库连接
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = Database;
