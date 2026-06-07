class RepositoryClassifier {
  constructor() {
    this.categories = {
      frontend: ['JavaScript', 'TypeScript', 'HTML', 'CSS', 'React', 'Vue', 'Angular', 'Svelte'],
      backend: ['Python', 'Java', 'Go', 'Ruby', 'PHP', 'C#', 'Node.js', 'Rust'],
      mobile: ['Swift', 'Kotlin', 'React Native', 'Flutter', 'Dart'],
      devops: ['Docker', 'Kubernetes', 'Terraform', 'Ansible', 'CI/CD', 'DevOps'],
      data: ['Python', 'R', 'SQL', 'Data Science', 'Machine Learning', 'AI'],
      blockchain: ['Solidity', 'Blockchain', 'Web3', 'Cryptocurrency'],
      gaming: ['C++', 'Unity', 'Unreal Engine', 'Game Development'],
      tools: ['CLI', 'Utilities', 'Tools', 'Productivity']
    };
  }

  // 根据语言分类
  classifyByLanguage(repo) {
    const language = repo.language || '';
    
    for (const [category, languages] of Object.entries(this.categories)) {
      if (languages.includes(language)) {
        return category;
      }
    }
    
    return 'other';
  }

  // 根据描述分类
  classifyByDescription(repo) {
    const description = repo.description || '';
    const lowerDesc = description.toLowerCase();
    
    if (lowerDesc.includes('frontend') || lowerDesc.includes('react') || lowerDesc.includes('vue')) {
      return 'frontend';
    } else if (lowerDesc.includes('backend') || lowerDesc.includes('server') || lowerDesc.includes('api')) {
      return 'backend';
    } else if (lowerDesc.includes('mobile') || lowerDesc.includes('android') || lowerDesc.includes('ios')) {
      return 'mobile';
    } else if (lowerDesc.includes('devops') || lowerDesc.includes('docker') || lowerDesc.includes('kubernetes')) {
      return 'devops';
    } else if (lowerDesc.includes('data') || lowerDesc.includes('machine learning') || lowerDesc.includes('ai')) {
      return 'data';
    } else if (lowerDesc.includes('blockchain') || lowerDesc.includes('web3') || lowerDesc.includes('crypto')) {
      return 'blockchain';
    } else if (lowerDesc.includes('game') || lowerDesc.includes('gaming')) {
      return 'gaming';
    } else if (lowerDesc.includes('tool') || lowerDesc.includes('utility') || lowerDesc.includes('cli')) {
      return 'tools';
    }
    
    return 'other';
  }

  // 综合分类
  classify(repo) {
    // 优先根据语言分类
    const languageCategory = this.classifyByLanguage(repo);
    if (languageCategory !== 'other') {
      return languageCategory;
    }
    
    // 否则根据描述分类
    return this.classifyByDescription(repo);
  }

  // 为仓库添加分类标签
  addCategories(repo) {
    // 优先保留抓取引擎赋予的真实业务场景标签（如“副业”、“游戏脚本”等）
    // 只有当没有标签，或者是被大盘强行打的旧标签时，才进行重新分类
    let category = repo.category;
    if (!category || category === 'backend' || category === 'frontend' || category === 'other') {
      category = this.classify(repo);
    }
    return {
      ...repo,
      category,
      tags: this.getTags(repo)
    };
  }

  // 提取仓库标签
  getTags(repo) {
    const tags = [];
    const description = repo.description || '';
    const lowerDesc = description.toLowerCase();
    
    // 从描述中提取标签
    if (lowerDesc.includes('open source')) tags.push('open-source');
    if (lowerDesc.includes('library')) tags.push('library');
    if (lowerDesc.includes('framework')) tags.push('framework');
    if (lowerDesc.includes('tool')) tags.push('tool');
    if (lowerDesc.includes('cli')) tags.push('cli');
    if (lowerDesc.includes('api')) tags.push('api');
    if (lowerDesc.includes('database')) tags.push('database');
    if (lowerDesc.includes('security')) tags.push('security');
    if (lowerDesc.includes('performance')) tags.push('performance');
    if (lowerDesc.includes('web')) tags.push('web');
    if (lowerDesc.includes('mobile')) tags.push('mobile');
    
    // 添加语言标签
    if (repo.language) {
      tags.push(repo.language.toLowerCase());
    }
    
    return [...new Set(tags)]; // 去重
  }

  // 批量分类仓库
  classifyBatch(repos) {
    return repos.map(repo => this.addCategories(repo));
  }

  // 获取分类统计
  getCategoryStats(repos) {
    const stats = {};
    
    repos.forEach(repo => {
      const category = repo.category || this.classify(repo);
      stats[category] = (stats[category] || 0) + 1;
    });
    
    return stats;
  }
}

module.exports = RepositoryClassifier;
