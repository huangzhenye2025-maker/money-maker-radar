const axios = require('axios');
const cheerio = require('cheerio');

class GitHubTrending {
  constructor() {
    // 开启国内镜像加速代理 (默认开启)
    this.useProxy = process.env.USE_CN_PROXY !== 'false';
    this.baseUrl = this.useProxy ? 'https://ghproxy.net/https://github.com' : 'https://github.com';
    // Github API 国内也可以用代理，这里对于 Search API，使用另一个可用代理或保持原样。
    // 为了彻底防断网，这里暂不代 api.github.com（因为搜索请求带 token 容易报错），如果需要可以在 fetchFromSearch 添加容错。
    this.apiUrl = 'https://api.github.com';
    this.token = process.env.GITHUB_TOKEN;
  }

  // 从GitHub Trending页面抓取数据
  async fetchFromTrending(language = '', since = 'daily') {
    try {
      const url = `${this.baseUrl}/trending${language ? `/${language}` : ''}?since=${since}`;
      const response = await axios.get(url, { timeout: 15000 });
      const $ = cheerio.load(response.data);

      const repositories = [];

      $('.Box-row').each((index, element) => {
        // 查找总星标数 (包含 /stargazers 的链接)
        let stars = $(element).find('a[href*="/stargazers"]').text().trim();
        // 查找总分叉数 (包含 /forks 的链接)
        let forks = $(element).find('a[href*="/forks"]').text().trim();
        
        // 查找今日增长星标数 (float-sm-right 包含 stars today)
        let starsToday = '';
        const floatRightText = $(element).find('.float-sm-right').text().trim();
        if (floatRightText && floatRightText.includes('stars today')) {
          starsToday = floatRightText;
        } else {
          // 备用：遍历寻找含有 stars today 的 span
          $(element).find('span').each((i, span) => {
            const txt = $(span).text().trim();
            if (txt.includes('stars today')) {
              starsToday = txt;
            }
          });
        }

        let repoUrl = $(element).find('.h3 a').attr('href');
        // 由于使用了代理，我们需要把返回的链接转回真实 github 链接供前端展示
        let realUrl = `https://github.com${repoUrl}`;

        const repo = {
          rank: index + 1,
          name: $(element).find('.h3').text().trim().replace(/\s+/g, ' '),
          description: $(element).find('p').text().trim(),
          language: $(element).find('[itemprop="programmingLanguage"]').text().trim(),
          stars: stars || '0',
          forks: forks || '0',
          starsToday: starsToday || '0 stars today',
          url: realUrl
        };
        repositories.push(repo);
      });

      return repositories;
    } catch (error) {
      console.error('Error fetching trending data:', error.message);
      return [];
    }
  }

  // 使用GitHub搜索API获取热门仓库
  async fetchFromSearch(query = 'stars:>10000', sort = 'stars', order = 'desc', perPage = 30) {
    try {
      const url = `${this.apiUrl}/search/repositories`;
      const headers = {
        'Accept': 'application/vnd.github.v3+json'
      };

      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      let response;
      try {
        response = await axios.get(url, {
          headers,
          params: {
            q: query,
            sort,
            order,
            per_page: perPage
          },
          timeout: 15000
        });
      } catch (err) {
        if (err.response && err.response.status === 401 && this.token) {
          console.warn('[GitHub API] 配置的 Token 无效 (401 Unauthorized)，正在降级为无 Token 请求...');
          delete headers['Authorization'];
          response = await axios.get(url, {
            headers,
            params: {
              q: query,
              sort,
              order,
              per_page: perPage
            },
            timeout: 15000
          });
        } else {
          throw err;
        }
      }

      const repositories = response.data.items.map((item, index) => ({
        rank: index + 1,
        name: `${item.owner.login}/${item.name}`,
        description: item.description || '',
        language: item.language || '',
        stars: item.stargazers_count,
        forks: item.forks_count,
        url: item.html_url,
        created_at: item.created_at,
        updated_at: item.updated_at
      }));

      return repositories;
    } catch (error) {
      console.error('Error fetching search data:', error.message);
      return [];
    }
  }

  // 获取多个主题/关键词的热门仓库
  async fetchMultipleTopics(topics = ['productivity', 'automation', 'low-code', 'ai-tools'], since = 'daily') {
    const allRepositories = [];

    // 计算7天前的日期以模拟 Trending
    const date = new Date();
    date.setDate(date.getDate() - 7);
    const dateStr = date.toISOString().split('T')[0];

    for (const topic of topics) {
      console.log(`正在通过 GitHub API 获取主题/场景 [${topic}] 的热门仓库...`);
      // 使用更宽泛的搜索，不局限于编程语言
      const query = `${topic} created:>${dateStr}`;
      const repos = await this.fetchFromSearch(query, 'stars', 'desc', 10);
      
      const mappedRepos = repos.map(repo => ({
        ...repo,
        category: topic,
        starsToday: 'N/A' // Search API 没有单日新增数据
      }));
      
      allRepositories.push(...mappedRepos);
      
      // 避免并发请求过多触发API限流
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // 按stars排序
    allRepositories.sort((a, b) => {
      const starsA = typeof a.stars === 'number' ? a.stars : parseInt(String(a.stars).replace(/,/g, '')) || 0;
      const starsB = typeof b.stars === 'number' ? b.stars : parseInt(String(b.stars).replace(/,/g, '')) || 0;
      return starsB - starsA;
    });

    return allRepositories;
  }
}

module.exports = GitHubTrending;
