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

  // ==================== Reddit r/SideProject 抓取 ====================
  async fetchRedditTrends() {
    console.log('【Reddit抓取】正在获取 r/SideProject 全球独立开发热门项目...');
    const trends = [];
    try {
      const response = await axios.get('https://www.reddit.com/r/SideProject/hot.rss', {
        timeout: 10000,
        headers: { 'User-Agent': this.userAgent }
      });
      const $ = cheerio.load(response.data, { xmlMode: true });
      $('entry').each((i, el) => {
        if (trends.length >= 15) return;
        const title = $(el).find('title').text();
        const url = $(el).find('link').attr('href');
        const published = $(el).find('updated').text();
        const author = $(el).find('author name').text();
        trends.push({
          platform: 'reddit',
          title: title,
          url: url,
          views_or_likes: 'Reddit Hot',
          views_count: 0,
          published_at: published ? new Date(published).toLocaleDateString('zh-CN') : '近期',
          author: author || 'Redditor'
        });
      });
    } catch (error) {
      console.warn(`[Reddit] 抓取失败: ${error.message}`);
      return this.getMockRedditTrends();
    }
    console.log(`【Reddit】成功获取 ${trends.length} 条海外副业话题`);
    return trends.length > 0 ? trends : this.getMockRedditTrends();
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

  // ==================== 聚合入口 ====================

  async fetchAll() {
    console.log('【五大情报聚合】开始并发抓取 国内(B站, 少数派, V2EX) 与 海外(YouTube, Reddit) 热点数据...');
    try {
      const [youtubeList, redditList, sspaiList, v2exList, bilibiliList] = await Promise.all([
        this.fetchYouTubeMultiQuery(),
        this.fetchRedditTrends(),
        this.fetchSspaiTrends(),
        this.fetchV2exHot(),
        this.fetchBilibiliTechTrends()
      ]);
      const combined = [...youtubeList, ...redditList, ...sspaiList, ...v2exList, ...bilibiliList];
      console.log(`【情报聚合】完成。YouTube: ${youtubeList.length}, Reddit: ${redditList.length}, 少数派: ${sspaiList.length}, V2EX: ${v2exList.length}, Bilibili: ${bilibiliList.length}`);
      return combined;
    } catch (e) {
      console.error('社媒聚合抓取异常，启用全本地高保真缓存数据:', e.message);
      return [
        ...this.getMockYouTubeTrends(),
        ...this.getMockRedditTrends(),
        ...this.getMockSspaiTrends(),
        ...this.getMockV2exTrends(),
        ...this.getMockBilibiliTrends()
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
}

module.exports = SocialTrending;
