class MemoryStorage {
  constructor() {
    this.repositories = [];
  }

  // 初始化存储
  async init() {
    console.log('内存存储初始化成功');
  }

  // 插入仓库数据
  async insertRepository(repo) {
    // 检查是否已存在
    const existingIndex = this.repositories.findIndex(r => r.url === repo.url);
    if (existingIndex !== -1) {
      // 更新现有数据
      this.repositories[existingIndex] = {
        ...repo,
        fetched_at: new Date().toISOString()
      };
    } else {
      // 添加新数据
      this.repositories.push({
        ...repo,
        id: this.repositories.length + 1,
        fetched_at: new Date().toISOString()
      });
    }
    return this.repositories.length;
  }

  // 批量插入仓库数据
  async insertBatch(repos) {
    for (const repo of repos) {
      await this.insertRepository(repo);
    }
  }

  // 根据分类获取仓库
  async getRepositoriesByCategory(category, limit = 10) {
    return this.repositories
      .filter(repo => repo.category === category)
      .sort((a, b) => new Date(b.fetched_at) - new Date(a.fetched_at))
      .slice(0, limit);
  }

  // 获取所有仓库
  async getAllRepositories(limit = 100) {
    return this.repositories
      .sort((a, b) => new Date(b.fetched_at) - new Date(a.fetched_at))
      .slice(0, limit);
  }

  // 获取分类统计
  async getCategoryStats() {
    const stats = {};
    this.repositories.forEach(repo => {
      const category = repo.category || 'other';
      stats[category] = (stats[category] || 0) + 1;
    });
    return Object.entries(stats).map(([category, count]) => ({ category, count }));
  }

  // 清理旧数据
  async cleanupOldData(days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const beforeCount = this.repositories.length;
    this.repositories = this.repositories.filter(repo => {
      return new Date(repo.fetched_at) > cutoffDate;
    });
    return beforeCount - this.repositories.length;
  }

  // 关闭存储
  close() {
    console.log('内存存储已关闭');
  }
}

module.exports = MemoryStorage;
