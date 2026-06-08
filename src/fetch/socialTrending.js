const axios = require('axios');
const cheerio = require('cheerio');

class SocialTrending {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    // 大众提效/副业向搜索关键词组
    this.youtubeQueries = [
      '副业工具',
      'AI效率神器',
      '黑科技软件',
      '自媒体运营工具',
      '免费开源平替'
    ];

  }

  // ==================== 工具方法 ====================

  // 将"14.5万"、"145K"、"1.2M" 等格式转换为数字
  parseViewCount(str) {
    if (!str || typeof str !== 'string') return 0;
    const s = str.replace(/,/g, '').replace(/次观看|views|播放|posts?/gi, '').trim();
    if (/(\d+\.?\d*)\s*[万]/i.test(s)) {
      return Math.round(parseFloat(s.match(/(\d+\.?\d*)/)[1]) * 10000);
    }
    if (/(\d+\.?\d*)\s*[Kk]/i.test(s)) {
      return Math.round(parseFloat(s.match(/(\d+\.?\d*)/)[1]) * 1000);
    }
    if (/(\d+\.?\d*)\s*[Mm]/i.test(s)) {
      return Math.round(parseFloat(s.match(/(\d+\.?\d*)/)[1]) * 1000000);
    }
    const num = parseFloat(s.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : num;
  }

  // 去除重复条目（按 url 或 title 去重）
  deduplicateList(list) {
    const seenUrls = new Set();
    const seenTitles = new Set();
    return list.filter(item => {
      const titleKey = (item.title || '').toLowerCase().trim().substring(0, 30);
      if (item.url && seenUrls.has(item.url)) return false;
      if (seenTitles.has(titleKey)) return false;
      if (item.url) seenUrls.add(item.url);
      seenTitles.add(titleKey);
      return true;
    });
  }

  // ==================== YouTube 抓取 ====================

  // 单关键词 YouTube 搜索 — 解析 ytInitialData
  async fetchYouTubeSingleQuery(query) {
    const videos = [];
    try {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIIBA%3D%3D`;
      const response = await axios.get(url, {
        headers: { 'User-Agent': this.userAgent, 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 12000
      });

      const $ = cheerio.load(response.data);
      let json = null;

      $('script').each((i, el) => {
        const text = $(el).text();
        if (text.includes('ytInitialData =') && !json) {
          try {
            const startIdx = text.indexOf('ytInitialData =') + 'ytInitialData ='.length;
            const trimmedText = text.substring(startIdx).trim();
            // 更稳健的 JSON 边界查找
            let depth = 0, endIdx = 0;
            for (let ci = 0; ci < Math.min(trimmedText.length, 2000000); ci++) {
              if (trimmedText[ci] === '{') depth++;
              else if (trimmedText[ci] === '}') { depth--; if (depth === 0) { endIdx = ci + 1; break; } }
            }
            json = JSON.parse(trimmedText.substring(0, endIdx));
          } catch (e) { /* 解析失败，忽略 */ }
        }
      });

      if (json) {
        const contents = json?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
        if (contents && Array.isArray(contents)) {
          for (const content of contents) {
            const itemSection = content?.itemSectionRenderer?.contents;
            if (itemSection && Array.isArray(itemSection)) {
              for (const item of itemSection) {
                const video = item.videoRenderer;
                if (video && videos.length < 8) {
                  const title = video.title?.runs?.[0]?.text || video.title?.accessibility?.accessibilityData?.label;
                  const videoId = video.videoId;
                  const viewsRaw = video.viewCountText?.simpleText || video.shortViewCountText?.simpleText || '0';
                  const published = video.publishedTimeText?.simpleText || '近期';
                  const author = video.ownerText?.runs?.[0]?.text || '未知作者';
                  if (title && videoId) {
                    videos.push({
                      platform: 'youtube',
                      title,
                      url: `https://www.youtube.com/watch?v=${videoId}`,
                      views_or_likes: viewsRaw,
                      views_count: this.parseViewCount(viewsRaw),
                      published_at: published,
                      author,
                      query_source: query
                    });
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[YouTube搜索] 关键词"${query}"爬取失败: ${error.message}`);
    }
    return videos;
  }

  // RSS 兜底 — 单关键词
  async fetchYouTubeRSS(query) {
    const videos = [];
    try {
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?search_query=${encodeURIComponent(query)}`;
      const rssResponse = await axios.get(rssUrl, {
        timeout: 8000,
        headers: { 'User-Agent': this.userAgent }
      });
      const $ = cheerio.load(rssResponse.data, { xmlMode: true });
      $('entry').each((i, entry) => {
        if (videos.length >= 5) return;
        const title = $(entry).find('title').text();
        const url = $(entry).find('link').attr('href') || $(entry).find('id').text();
        const author = $(entry).find('author name').text();
        const published = $(entry).find('published').text();
        if (title && url) {
          videos.push({
            platform: 'youtube',
            title,
            url,
            views_or_likes: '推荐热播',
            views_count: 0,
            published_at: published ? new Date(published).toLocaleDateString('zh-CN') : '刚刚',
            author: author || '未知频道',
            query_source: query
          });
        }
      });
    } catch (rssError) {
      console.warn(`[YouTube RSS] "${query}" RSS兜底失败: ${rssError.message}`);
    }
    return videos;
  }

  // 多关键词并发 YouTube 抓取 — 汇聚 + 去重 + 按热度排序
  async fetchYouTubeMultiQuery(queries = null) {
    const queryList = queries || this.youtubeQueries;
    console.log(`【YouTube多词抓取】正在并发搜索 ${queryList.length} 个技术关键词...`);

    const results = await Promise.allSettled(
      queryList.map(q => this.fetchYouTubeSingleQuery(q))
    );

    let allVideos = [];
    results.forEach(r => {
      if (r.status === 'fulfilled') allVideos = allVideos.concat(r.value);
    });

    // 若完全没抓到，启用 RSS 兜底
    if (allVideos.length === 0) {
      console.log('[YouTube] 网页解析全部失败，尝试 RSS 兜底...');
      const rssResults = await Promise.allSettled(
        queryList.slice(0, 2).map(q => this.fetchYouTubeRSS(q))
      );
      rssResults.forEach(r => {
        if (r.status === 'fulfilled') allVideos = allVideos.concat(r.value);
      });
    }

    // 去重后按观看量降序排列
    const deduped = this.deduplicateList(allVideos);
    deduped.sort((a, b) => (b.views_count || 0) - (a.views_count || 0));

    if (deduped.length === 0) {
      console.log('【YouTube】所有在线源均失败，启用本地预置数据...');
      return this.getMockYouTubeTrends();
    }

    console.log(`【YouTube】成功获取 ${deduped.length} 条视频（去重后），取前 20 条`);
    return deduped.slice(0, 20);
  }
  // ==================== 少数派 (Sspai) 抓取 ====================
  async fetchSspaiTrends() {
    console.log('【少数派抓取】正在获取 Sspai 效率工具与应用推荐...');
    const trends = [];
    try {
      const response = await axios.get('https://sspai.com/api/v1/article/tag/page/get?limit=15&tag=%E6%95%88%E7%8E%87%E5%B7%A5%E5%85%B7', { timeout: 10000 });
      if (response.data && response.data.data) {
        response.data.data.forEach(item => {
          trends.push({
            platform: 'sspai',
            title: item.title,
            url: `https://sspai.com/post/${item.id}`,
            views_or_likes: `${item.like_count || 0} 赞同`,
            views_count: item.like_count || 0,
            published_at: new Date(item.released_time * 1000).toLocaleDateString('zh-CN'),
            author: item.author?.nickname || '少数派作者'
          });
        });
      }
    } catch (error) {
      console.warn(`[Sspai] 抓取失败: ${error.message}`);
      return this.getMockSspaiTrends();
    }
    console.log(`【少数派】成功获取 ${trends.length} 条效率热点`);
    return trends.length > 0 ? trends : this.getMockSspaiTrends();
  }

  // ==================== 扩展：海外与前沿平台抓取 ====================

  async fetchRedditTrends() {
    console.log('【Reddit抓取】正在多线程获取 r/SideProject, r/SaaS, r/OpenAI...');
    const subreddits = ['SideProject', 'SaaS', 'OpenAI'];
    let allTrends = [];
    
    for (const sub of subreddits) {
      try {
        const response = await axios.get(`https://www.reddit.com/r/${sub}/hot.rss`, {
          timeout: 10000,
          headers: { 'User-Agent': this.userAgent }
        });
        const $ = cheerio.load(response.data, { xmlMode: true });
        $('entry').each((i, el) => {
          if (allTrends.length >= 25) return;
          const title = $(el).find('title').text();
          const url = $(el).find('link').attr('href');
          const published = $(el).find('updated').text();
          const author = $(el).find('author name').text();
          allTrends.push({
            platform: 'reddit',
            title: `[r/${sub}] ${title}`,
            url: url,
            views_or_likes: 'Reddit Hot',
            views_count: 0,
            published_at: published ? new Date(published).toLocaleDateString('zh-CN') : '近期',
            author: author || 'Redditor'
          });
        });
      } catch (error) {
        console.warn(`[Reddit r/${sub}] 抓取失败: ${error.message}`);
      }
    }
    
    if (allTrends.length === 0) return this.getMockRedditTrends();
    console.log(`【Reddit】成功获取 ${allTrends.length} 条海外副业话题`);
    return allTrends;
  }

  async fetchProductHunt() {
    console.log('【Product Hunt抓取】正在获取全球最新 AI/SaaS 产品...');
    const trends = [];
    try {
      const response = await axios.get('https://www.producthunt.com/feed', {
        timeout: 10000,
        headers: { 'User-Agent': this.userAgent }
      });
      const $ = cheerio.load(response.data, { xmlMode: true });
      $('entry').each((i, el) => {
        if (trends.length >= 15) return;
        const title = $(el).find('title').text();
        const url = $(el).find('link').attr('href');
        const published = $(el).find('published').text();
        const author = $(el).find('author name').text();
        trends.push({
          platform: 'producthunt',
          title: title,
          url: url,
          views_or_likes: 'PH 热门',
          views_count: 0,
          published_at: published ? new Date(published).toLocaleDateString('zh-CN') : '今日',
          author: author || 'Maker'
        });
      });
    } catch (e) {
      console.warn(`[Product Hunt] 抓取失败: ${e.message}`);
      return this.getMockProductHunt();
    }
    return trends.length > 0 ? trends : this.getMockProductHunt();
  }

  async fetchHackerNews() {
    console.log('【Hacker News抓取】正在获取 YC 社区极客热点...');
    const trends = [];
    try {
      const response = await axios.get('https://news.ycombinator.com/rss', {
        timeout: 10000,
        headers: { 'User-Agent': this.userAgent }
      });
      const $ = cheerio.load(response.data, { xmlMode: true });
      $('item').each((i, el) => {
        if (trends.length >= 15) return;
        const title = $(el).find('title').text();
        const url = $(el).find('link').text();
        const published = $(el).find('pubDate').text();
        trends.push({
          platform: 'hackernews',
          title: title,
          url: url,
          views_or_likes: 'HN Frontpage',
          views_count: 0,
          published_at: published ? new Date(published).toLocaleDateString('zh-CN') : '今日',
          author: 'HN User'
        });
      });
    } catch (e) {
      console.warn(`[Hacker News] 抓取失败: ${e.message}`);
      return this.getMockHackerNews();
    }
    return trends.length > 0 ? trends : this.getMockHackerNews();
  }

  async fetchTwitterAITrends() {
    console.log('【Twitter/X】正在获取海外 AI 创始人和独立开发者风向标...');
    // 使用 Nitter RSS 代理节点 (由于公共节点经常挂掉，准备了失败回退)
    const trends = [];
    const queries = ['levelsio', 'rowancheung', 'search?q=%23buildinpublic'];
    
    for (const q of queries) {
      try {
        const url = q.startsWith('search') ? `https://nitter.net/${q}&rss=1` : `https://nitter.net/${q}/rss`;
        const response = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': this.userAgent } });
        const $ = cheerio.load(response.data, { xmlMode: true });
        $('item').each((i, el) => {
          if (trends.length >= 15) return;
          const title = $(el).find('title').text();
          const url = $(el).find('link').text();
          trends.push({
            platform: 'twitter',
            title: title,
            url: url,
            views_or_likes: 'Twitter 热门',
            views_count: 0,
            published_at: '近期',
            author: q.startsWith('search') ? '推友' : `@${q}`
          });
        });
      } catch (e) {
        console.warn(`[Twitter/X] Nitter 节点抓取失败 (${q}): ${e.message}`);
      }
    }
    return trends.length > 0 ? trends : this.getMockTwitter();
  }

    async fetchAIDirectories() {
    console.log('【AI 导航】正在通过 RSSHub 获取量子位 AI 资讯...');
    const trends = [];
    try {
      const response = await axios.get('https://rsshub.rssforever.com/qbitai/category/%E8%B5%84%E8%AE%AF', { timeout: 10000, headers: { 'User-Agent': this.userAgent } });
      const $ = cheerio.load(response.data, { xmlMode: true });
      $('item').each((i, el) => {
        if (trends.length >= 10) return;
        trends.push({
          platform: 'taaft',
          title: $(el).find('title').text(),
          url: $(el).find('link').text(),
          views_or_likes: 'AI 资讯',
          views_count: 0,
          published_at: $(el).find('pubDate').text() || '今日',
          author: '量子位'
        });
      });
    } catch (e) {
      console.warn(`[AI Directories] RSSHub 抓取失败: ${e.message}`);
      return this.getMockAIDirectories();
    }
    return trends.length > 0 ? trends : this.getMockAIDirectories();
  }

  async fetchJuejin() {
    console.log('【掘金 Juejin】正在获取国内技术与前沿 AI 文章...');
    const trends = [];
    try {
      // 掘金综合热榜 API
      const response = await axios.post('https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed', {
        id_type: 2, client_type: 2608, sort_type: 200, cursor: "0", limit: 20
      }, { headers: { 'User-Agent': this.userAgent } });
      
      if (response.data && response.data.data) {
        response.data.data.forEach(item => {
          if (item.item_info && item.item_info.article_info) {
            const article = item.item_info.article_info;
            trends.push({
              platform: 'juejin',
              title: article.title,
              url: `https://juejin.cn/post/${article.article_id}`,
              views_or_likes: `${article.view_count || 0} 阅读`,
              views_count: article.view_count || 0,
              published_at: new Date(article.ctime * 1000).toLocaleDateString('zh-CN'),
              author: item.item_info.author_user_info?.user_name || '掘金掘友'
            });
          }
        });
      }
    } catch (e) {
      console.warn(`[Juejin] 抓取失败: ${e.message}`);
      return this.getMockJuejin();
    }
    return trends.length > 0 ? trends : this.getMockJuejin();
  }


  // ==================== 国内平台抓取 (V2EX / Bilibili) ====================

  // 抓取 V2EX 热榜
  async fetchV2exHot() {
    console.log('【国内热点抓取】正在获取 V2EX 每日热榜(RSS)...');
    const trends = [];
    try {
      const response = await axios.get('https://www.v2ex.com/index.xml', {
        headers: { 'User-Agent': this.userAgent },
        timeout: 8000
      });
      const $ = cheerio.load(response.data, { xmlMode: true });
      $('entry').each((i, el) => {
        if (trends.length >= 15) return;
        const title = $(el).find('title').text().trim();
        const url = $(el).find('link').attr('href');
        const author = $(el).find('author name').text().trim() || '未知节点';
        const published = $(el).find('published').text().trim();
        
        trends.push({
          platform: 'v2ex',
          title: title,
          url: url,
          views_or_likes: 'RSS 热门',
          views_count: 0,
          published_at: published || '今日热点',
          author: author
        });
      });
    } catch (e) {
      console.warn(`[V2EX] 热榜抓取失败: ${e.message}，启用备用缓存...`);
      return this.getMockV2exTrends();
    }
    return trends.length > 0 ? trends : this.getMockV2exTrends();
  }

  // 抓取 B站 技术热门视频
  async fetchBilibiliTechTrends() {
    console.log('【热点抓取】正在获取 Bilibili 效率/AI/大众热点...');
    const trends = [];
    try {
      const response = await axios.get('https://api.bilibili.com/x/web-interface/search/all/v2?keyword=' + encodeURIComponent('效率神器 AI工具 免费软件'), {
        headers: { 'User-Agent': this.userAgent },
        timeout: 8000
      });
      
      const videoResult = response.data?.data?.result?.find(x => x.result_type === 'video');
      if (videoResult && Array.isArray(videoResult.data)) {
        const ninetyDaysAgo = (Date.now() / 1000) - (90 * 24 * 60 * 60);
        for (const v of videoResult.data) {
          if (trends.length >= 10) break;
          // Filter out videos older than 90 days
          if (v.pubdate && v.pubdate < ninetyDaysAgo) continue;
          
          const cleanTitle = (v.title || '').replace(/<[^>]+>/g, ''); // Remove <em> tags
          const url = v.bvid ? `https://www.bilibili.com/video/${v.bvid}` : (v.arcurl || '#');
          const play = v.play || 0;
          
          trends.push({
            platform: 'bilibili',
            title: cleanTitle,
            url: url.startsWith('http:') ? url.replace('http:', 'https:') : url,
            views_or_likes: play || '热门播放',
            views_count: this.parseViewCount(play),
            published_at: '近期'
          });
        }
      }
    } catch (e) {
      console.warn(`[Bilibili] 搜索页面抓取失败: ${e.message}，启用备用缓存...`);
      return this.getMockBilibiliTrends();
    }
    return trends.length > 0 ? trends : this.getMockBilibiliTrends();
  }

  // ==================== 知乎 (Zhihu) 抓取 ====================
      async fetchZhihuTrends() {
    console.log('【产品经理抓取】正在通过 RSSHub 获取人人都是产品经理热门文章...');
    const trends = [];
    try {
      const response = await axios.get('https://rsshub.rssforever.com/woshipm/popular', { timeout: 10000, headers: { 'User-Agent': this.userAgent } });
      const $ = cheerio.load(response.data, { xmlMode: true });
      $('item').each((i, el) => {
        if (trends.length >= 15) return;
        trends.push({
          platform: 'zhihu', // Keep 'zhihu' to maintain frontend compatibility without needing UI changes immediately, but we change author
          title: $(el).find('title').text(),
          url: $(el).find('link').text(),
          views_or_likes: '热门商业干货',
          views_count: 0,
          published_at: $(el).find('pubDate').text() || '今日',
          author: '产品经理社区'
        });
      });
    } catch (error) {
      console.warn(`[Woshipm] RSSHub 抓取失败: ${error.message}`);
      return this.getMockZhihuTrends();
    }
    return trends.length > 0 ? trends : this.getMockZhihuTrends();
  }

  // ==================== 36氪 (36Kr) 抓取 ====================
    async fetch36KrTrends() {
    console.log('【36Kr抓取】正在通过 RSSHub 获取 36氪快讯...');
    const trends = [];
    try {
      const response = await axios.get('https://rsshub.rssforever.com/36kr/newsflashes', { timeout: 10000, headers: { 'User-Agent': this.userAgent } });
      const $ = cheerio.load(response.data, { xmlMode: true });
      $('item').each((i, el) => {
        if (trends.length >= 15) return;
        trends.push({
          platform: '36kr',
          title: $(el).find('title').text(),
          url: $(el).find('link').text(),
          views_or_likes: '36氪快讯',
          views_count: 0,
          published_at: $(el).find('pubDate').text() || '今日',
          author: '36氪'
        });
      });
    } catch (error) {
      console.warn(`[36Kr] RSSHub 抓取失败: ${error.message}`);
      return this.getMock36KrTrends();
    }
    return trends.length > 0 ? trends : this.getMock36KrTrends();
  }

  // ==================== 聚合入口 ====================

  async fetchAll() {
    console.log('【全面情报聚合】开始并发抓取 国内(B站,少数派,V2EX,掘金,知乎,36Kr) 与 海外(YouTube,Reddit,PH,HN,推特,TAAFT)...');
    try {
      const [
        youtubeList, redditList, sspaiList, v2exList, bilibiliList,
        phList, hnList, twitterList, taaftList, juejinList, zhihuList, krList
      ] = await Promise.all([
        this.fetchYouTubeMultiQuery(),
        this.fetchRedditTrends(),
        this.fetchSspaiTrends(),
        this.fetchV2exHot(),
        this.fetchBilibiliTechTrends(),
        this.fetchProductHunt(),
        this.fetchHackerNews(),
        this.fetchTwitterAITrends(),
        this.fetchAIDirectories(),
        this.fetchJuejin(),
        this.fetchZhihuTrends(),
        this.fetch36KrTrends()
      ]);
      const combined = [
        ...youtubeList, ...redditList, ...sspaiList, ...v2exList, ...bilibiliList,
        ...phList, ...hnList, ...twitterList, ...taaftList, ...juejinList, ...zhihuList, ...krList
      ];
      console.log(`【情报聚合】完成。累计提取 ${combined.length} 条数据（来源涵盖 12 个独立站与社区）`);
      return combined;
    } catch (e) {
      console.error('社媒聚合抓取异常，启用全本地高保真缓存数据:', e.message);
      return [
        ...this.getMockYouTubeTrends(),
        ...this.getMockRedditTrends(),
        ...this.getMockSspaiTrends(),
        ...this.getMockV2exTrends(),
        ...this.getMockBilibiliTrends(),
        ...this.getMockProductHunt(),
        ...this.getMockHackerNews(),
        ...this.getMockTwitter(),
        ...this.getMockAIDirectories(),
        ...this.getMockJuejin(),
        ...this.getMockZhihuTrends(),
        ...this.getMock36KrTrends()
      ];
    }
  }

  // ==================== 本地高保真模拟数据 ====================

  getMockYouTubeTrends() {
    return [
      {
        platform: 'youtube', title: 'This New AI Web Scraper is INSANE (Zero Code & Auto Package)',
        url: 'https://www.youtube.com/watch?v=mock_yt_1', views_or_likes: '14.5万次观看',
        views_count: 145000, published_at: '2天前', author: 'TechWorld with Nana', is_mock: true
      },
      {
        platform: 'youtube', title: 'I Built a Business using ONLY Open Source GitHub Projects',
        url: 'https://www.youtube.com/watch?v=mock_yt_2', views_or_likes: '8.2万次观看',
        views_count: 82000, published_at: '5天前', author: 'Fireship', is_mock: true
      },
      {
        platform: 'youtube', title: 'Cursor editor who? Meet the newest Open-Source Copilot killers',
        url: 'https://www.youtube.com/watch?v=mock_yt_3', views_or_likes: '23万次观看',
        views_count: 230000, published_at: '1天前', author: 'Theo - t3.gg', is_mock: true
      },
      {
        platform: 'youtube', title: 'Top 5 Python Automation Scripts to Sell on Fiverr (Make Money Online)',
        url: 'https://www.youtube.com/watch?v=mock_yt_4', views_or_likes: '5.1万次观看',
        views_count: 51000, published_at: '3天前', author: 'Internet Made Coder', is_mock: true
      },
      {
        platform: 'youtube', title: 'How to build your own local ChatGPT with DeepSeek R1 for FREE',
        url: 'https://www.youtube.com/watch?v=mock_yt_5', views_or_likes: '45万次观看',
        views_count: 450000, published_at: '12小时前', author: 'NetworkChuck', is_mock: true
      }
    ];
  }
  getMockSspaiTrends() {
    return [
      {
        platform: 'sspai', title: '独立开发者的福音：如何利用 Cursor 零代码上架 iOS 应用',
        url: 'https://sspai.com/post/mock1', views_or_likes: '1420 赞同',
        views_count: 1420, published_at: '刚刚', is_mock: true
      },
      {
        platform: 'sspai', title: '效率翻倍：我用 AI 自动化了小红书的图文发布流',
        url: 'https://sspai.com/post/mock2', views_or_likes: '850 赞同',
        views_count: 850, published_at: '刚刚', is_mock: true
      }
    ];
  }

  getMockRedditTrends() {
    return [
      {
        platform: 'reddit', title: 'I reached $5k MRR with a simple AI wrapper app',
        url: 'https://www.reddit.com/r/SideProject/comments/mock1', views_or_likes: 'Reddit Hot',
        views_count: 500, published_at: '刚刚', is_mock: true
      },
      {
        platform: 'reddit', title: 'Show Reddit: A zero-code tool to scrape any website into an API',
        url: 'https://www.reddit.com/r/SideProject/comments/mock2', views_or_likes: 'Reddit Hot',
        views_count: 300, published_at: '刚刚', is_mock: true
      }
    ];
  }

  getMockV2exTrends() {
    return [
      {
        platform: 'v2ex', title: '分享一个刚发现的平替 Cursor 的开源编辑器',
        url: 'https://v2ex.com/t/mock1', views_or_likes: '342 回复',
        views_count: 342, published_at: '今日热点', author: 'coder123', is_mock: true
      },
      {
        platform: 'v2ex', title: '现在搞小红书开源工具变现还有机会吗？',
        url: 'https://v2ex.com/t/mock2', views_or_likes: '158 回复',
        views_count: 158, published_at: '今日热点', author: 'money_maker', is_mock: true
      },
      {
        platform: 'v2ex', title: 'DeepSeek R1 本地部署踩坑记录（附一键安装包）',
        url: 'https://v2ex.com/t/mock3', views_or_likes: '512 回复',
        views_count: 512, published_at: '今日热点', author: 'ai_lover', is_mock: true
      }
    ];
  }

  getMockBilibiliTrends() {
    return [
      {
        platform: 'bilibili', title: '白嫖最强国产AI！DeepSeek R1本地一键部署教程，小白必看！',
        url: 'https://www.bilibili.com/video/BV1kH4y1G7G9', views_or_likes: '28.5万播放',
        views_count: 285000, published_at: '1天前', author: '硬核科技', is_mock: true
      },
      {
        platform: 'bilibili', title: '别再花钱买AI了，盘点2025年最强开源免费AI工具合集',
        url: 'https://www.bilibili.com/video/BV1zV4y1W7q2', views_or_likes: '15.2万播放',
        views_count: 152000, published_at: '3天前', author: '某AUP主', is_mock: true
      }
    ];
  }

  getMockProductHunt() {
    return [
      { platform: 'producthunt', title: 'Cursor for Designers - Generate UI components using AI', url: 'https://producthunt.com/mock1', views_or_likes: '1024 Upvotes', views_count: 1024, published_at: '今日', author: 'PH Maker', is_mock: true },
      { platform: 'producthunt', title: 'MakeMyApp - Text to full stack application', url: 'https://producthunt.com/mock2', views_or_likes: '850 Upvotes', views_count: 850, published_at: '今日', author: 'SaaS Dev', is_mock: true }
    ];
  }

  getMockHackerNews() {
    return [
      { platform: 'hackernews', title: 'Show HN: A local AI agent that answers your emails', url: 'https://news.ycombinator.com/mock1', views_or_likes: 'HN Hot', views_count: 400, published_at: '今日', author: 'HN User', is_mock: true }
    ];
  }

  getMockTwitter() {
    return [
      { platform: 'twitter', title: 'Just hit $10k MRR with this AI wrapper I built in 2 hours! Thread 🧵', url: 'https://twitter.com/mock', views_or_likes: '500 Likes', views_count: 500, published_at: '今日', author: '@indie_hacker', is_mock: true }
    ];
  }

  getMockAIDirectories() {
    return [
      { platform: 'taaft', title: 'Auto-Blogger AI - Generate 100 SEO posts in minutes', url: 'https://theresanaiforthat.com/mock', views_or_likes: 'New Tool', views_count: 0, published_at: '今日', author: 'TAAFT', is_mock: true }
    ];
  }

  getMockJuejin() {
    return [
      {
        platform: 'juejin', title: '前端架构师带你深入理解 Cursor 的底层原理',
        url: 'https://juejin.cn/post/mock1', views_or_likes: '2.5w 阅读',
        views_count: 25000, published_at: '刚刚', author: '前端小智', is_mock: true
      },
      {
        platform: 'juejin', title: '如何利用大模型构建个人知识库并实现自动化',
        url: 'https://juejin.cn/post/mock2', views_or_likes: '1.2w 阅读',
        views_count: 12000, published_at: '刚刚', author: 'AI全栈', is_mock: true
      }
    ];
  }

  getMockZhihuTrends() {
    return [
      { platform: 'zhihu', title: 'OpenAI 刚刚发布了新模型，对未来的影响有哪些？', url: '#', views_or_likes: '958万 热度', views_count: 9580000, published_at: '今日', author: 'AI前沿' },
      { platform: 'zhihu', title: '独立开发者如何靠一个工具月入十万？', url: '#', views_or_likes: '822万 热度', views_count: 8220000, published_at: '今日', author: '创业笔记' },
      { platform: 'zhihu', title: '有哪些非常适合普通人入局的 AI 副业方向？', url: '#', views_or_likes: '645万 热度', views_count: 6450000, published_at: '昨天', author: '干货收集者' },
      { platform: 'zhihu', title: '国内大模型集体降价，会带来哪些商业机会？', url: '#', views_or_likes: '511万 热度', views_count: 5110000, published_at: '今日', author: '科技观察' }
    ];
  }

  getMock36KrTrends() {
    return [
      { platform: '36kr', title: '独家 | 某AI独角兽完成新一轮数亿美元融资', url: '#', views_or_likes: '创投首发', views_count: 5000, published_at: '2小时前', author: '36氪创投频道' },
      { platform: '36kr', title: 'SaaS 出海成共识，这几家公司是如何拿到第一批海外用户的？', url: '#', views_or_likes: '深度商业', views_count: 4000, published_at: '4小时前', author: '出海日报' },
      { platform: '36kr', title: '大厂高管离职做AI，他们的变现思路有哪些不同？', url: '#', views_or_likes: '人物专访', views_count: 3500, published_at: '今日', author: '未来科技' },
      { platform: '36kr', title: '2026年 AI 应用生态研究报告：效率工具依然是最赚钱的赛道', url: '#', views_or_likes: '行研报告', views_count: 8000, published_at: '昨日', author: '36氪研究院' }
    ];
  }
}

module.exports = SocialTrending;
