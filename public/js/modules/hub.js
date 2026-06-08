  // ==================== 页面六：社媒热点监控 (Social Monitor) ====================
  const sspaiTrendsList = document.getElementById('sspai-trends-list');
  const redditTrendsList = document.getElementById('reddit-trends-list');
  const youtubeTrendsList = document.getElementById('youtube-trends-list');
  const bilibiliTrendsList = document.getElementById('bilibili-trends-list');
  const v2exTrendsList = document.getElementById('v2ex-trends-list');
  const producthuntTrendsList = document.getElementById('producthunt-trends-list');
  const hackernewsTrendsList = document.getElementById('hackernews-trends-list');
  const juejinTrendsList = document.getElementById('juejin-trends-list');
  const twitterTrendsList = document.getElementById('twitter-trends-list');
  const taaftTrendsList = document.getElementById('taaft-trends-list');
  const zhihuTrendsList = document.getElementById('zhihu-trends-list');
  const krTrendsList = document.getElementById('36kr-trends-list');
  const socialAnalysisReportContainer = document.getElementById('social-analysis-report-container');
  const btnSocialFetchNow = document.getElementById('btn-social-fetch-now');
  const socialProgress = document.getElementById('social-progress');
  const socialDataStatus = document.getElementById('social-data-status');
  const socialHistorySelect = document.getElementById('social-history-select');
  let socialCompareChart = null;

  async function loadSocialMonitorData() {
    if (sspaiTrendsList) sspaiTrendsList.innerHTML = `<div class="loading-spinner" style="padding: 2rem;"><span class="spinner"></span><p style="font-size:0.75rem">加载中...</p></div>`;
    if (redditTrendsList) redditTrendsList.innerHTML = `<div class="loading-spinner" style="padding: 2rem;"><span class="spinner"></span><p style="font-size:0.75rem">加载中...</p></div>`;
    if (youtubeTrendsList) youtubeTrendsList.innerHTML = `<div class="loading-spinner" style="padding: 2rem;"><span class="spinner"></span><p style="font-size:0.75rem">加载中...</p></div>`;
    if (bilibiliTrendsList) bilibiliTrendsList.innerHTML = `<div class="loading-spinner" style="padding: 2rem;"><span class="spinner"></span><p style="font-size:0.75rem">加载中...</p></div>`;
    if (v2exTrendsList) v2exTrendsList.innerHTML = `<div class="loading-spinner" style="padding: 2rem;"><span class="spinner"></span><p style="font-size:0.75rem">加载中...</p></div>`;
    if (producthuntTrendsList) producthuntTrendsList.innerHTML = `<div class="loading-spinner" style="padding: 2rem;"><span class="spinner"></span><p style="font-size:0.75rem">加载中...</p></div>`;
    if (hackernewsTrendsList) hackernewsTrendsList.innerHTML = `<div class="loading-spinner" style="padding: 2rem;"><span class="spinner"></span><p style="font-size:0.75rem">加载中...</p></div>`;
    if (juejinTrendsList) juejinTrendsList.innerHTML = `<div class="loading-spinner" style="padding: 2rem;"><span class="spinner"></span><p style="font-size:0.75rem">加载中...</p></div>`;
    if (twitterTrendsList) twitterTrendsList.innerHTML = `<div class="loading-spinner" style="padding: 2rem;"><span class="spinner"></span><p style="font-size:0.75rem">加载中...</p></div>`;
    if (taaftTrendsList) taaftTrendsList.innerHTML = `<div class="loading-spinner" style="padding: 2rem;"><span class="spinner"></span><p style="font-size:0.75rem">加载中...</p></div>`;
    if (zhihuTrendsList) zhihuTrendsList.innerHTML = `<div class="loading-spinner" style="padding: 2rem;"><span class="spinner"></span><p style="font-size:0.75rem">加载中...</p></div>`;
    if (krTrendsList) krTrendsList.innerHTML = `<div class="loading-spinner" style="padding: 2rem;"><span class="spinner"></span><p style="font-size:0.75rem">加载中...</p></div>`;
    if (socialAnalysisReportContainer) socialAnalysisReportContainer.innerHTML = `<div class="loading-spinner" style="padding: 4rem 2rem;"><span class="spinner"></span><p style="font-size:0.8rem">分析中...</p></div>`;
    
    try { 
      const response = await fetch('/api/social/trends');
      const result = await response.json();
      if (result.success) {
        renderSocialMonitor(result.data);
        loadSocialHistory();
      } else {
        showToast(result.message || '获取数据失败', 'error');
      }
    } catch (e) {
      showToast('加载失败: ' + e.message, 'error');
    }
  }

  // 热度分徽章
  function renderScoreBadge(score, label) {
    if (score < 0) return '';
    let cls = 'score-badge--low';
    if (score >= 80) cls = 'score-badge--high';
    else if (score >= 60) cls = 'score-badge--mid';
    return `<span class="score-badge ${cls}" title="${label}">${score}</span>`;
  }

  // 趋势方向箭头
  function renderTrendArrow(direction) {
    const map = { '↑': { cls: 'trend-up', label: '上升' }, '→': { cls: 'trend-flat', label: '平稳' }, '↓': { cls: 'trend-down', label: '下降' } };
    const d = map[direction] || map['→'];
    return `<span class="trend-arrow ${d.cls}" title="趋势${d.label}">${direction}</span>`;
  }

  // verdict 推荐等级徽章
  function renderVerdict(verdict) {
    if (!verdict) return '';
    const map = { '强推': { cls: 'verdict-hot', icon: '<i data-lucide="flame" class="icon-sm" style="width:14px;height:14px;"></i>' }, '关注': { cls: 'verdict-watch', icon: '<i data-lucide="eye" class="icon-sm" style="width:14px;height:14px;"></i>' }, '观望': { cls: 'verdict-wait', icon: '<i data-lucide="hourglass" class="icon-sm" style="width:14px;height:14px;"></i>' } };
    const v = map[verdict] || { cls: 'verdict-watch', icon: '•' };
    return `<span class="verdict-badge ${v.cls}">${v.icon} ${verdict}</span>`;
  }

  // 更新数据状态栏
  function updateSocialDataStatus(schedulerStatus, hasMockData) {
    if (!socialDataStatus) return;
    socialDataStatus.classList.remove('hidden');

    const lastUpdate = schedulerStatus && schedulerStatus.lastRunAt
      ? (() => {
          const diff = Math.floor((Date.now() - new Date(schedulerStatus.lastRunAt)) / 60000);
          return diff < 1 ? '刚刚更新' : `${diff} 分钟前更新`;
        })()
      : '暂未运行';

    const nextRun = schedulerStatus && schedulerStatus.nextRunAt
      ? (() => {
          const diff = Math.floor((new Date(schedulerStatus.nextRunAt) - Date.now()) / 60000);
          return diff > 0 ? `约 ${diff} 分钟后自动更新` : '即将自动更新';
        })()
      : `每 ${(schedulerStatus && schedulerStatus.intervalHours) || 6} 小时自动更新`;

    const lastUpdateEl = document.getElementById('social-last-update-text');
    const nextUpdateEl = document.getElementById('social-next-update-text');
    const offlineBadge = document.getElementById('social-offline-badge');

    if (lastUpdateEl) lastUpdateEl.textContent = lastUpdate;
    if (nextUpdateEl) nextUpdateEl.textContent = nextRun;
    if (offlineBadge) {
      if (hasMockData) offlineBadge.classList.remove('hidden');
      else offlineBadge.classList.add('hidden');
    }
  }

  // 渲染强推卡片
  function renderTopPicks(scores) {
    const topPicksSection = document.getElementById('social-top-picks');
    const topPicksCards = document.getElementById('top-picks-cards');
    if (!topPicksSection || !topPicksCards) return;

    const hotItems = (scores || []).slice(0, 10);
    if (hotItems.length === 0) {
      topPicksSection.classList.add('hidden');
      return;
    }

    topPicksSection.classList.remove('hidden');
    // Rename section title to avoid confusion
    const sectionTitle = topPicksSection.querySelector('h2');
    if (sectionTitle) sectionTitle.innerHTML = 'AI 综合热度评估报告';

    topPicksCards.classList.remove('top-picks-grid'); // Remove grid class so it doesn't try to place dots as grid items
    window._topPicksData = hotItems;
    if (typeof window._topPicksIndex === 'undefined') {
      window._topPicksIndex = 0;
    }

    window.renderCurrentTopPick = () => {
      const s = window._topPicksData[window._topPicksIndex];
      if (!s) return;
      
      const cardsHtml = `
      <div class="carousel-wrapper" style="position: relative;">
        <button class="carousel-arrow left-arrow" onclick="window.prevTopPick()">
          <i data-lucide="chevron-left"></i>
        </button>
        <button class="carousel-arrow right-arrow" onclick="window.nextTopPick()">
          <i data-lucide="chevron-right"></i>
        </button>
        
        <div class="top-pick-card carousel-slide" style="min-height: 220px;">
          <div class="top-pick-header">
            <span class="top-pick-name">${s.repo_name || '未知项目'} ${s.verdict === '强推' ? '<span class="badge" style="background:#f59e0b;color:#fff;margin-left:8px">强推</span>' : ''}</span>
            ${renderTrendArrow(s.trend_direction)}
          </div>
          <div class="top-pick-match">${s.social_match || ''}</div>
          <div class="top-pick-scores">
            <div class="score-item">
              <span class="score-label">GitHub热度</span>
              ${renderScoreBadge(s.github_score, 'GitHub热度评分')}
            </div>
            <div class="score-item">
              <span class="score-label">海外热度</span>
              ${renderScoreBadge(s.social_score, '海外社媒热度')}
            </div>
            <div class="score-item">
              <span class="score-label">国内热度</span>
              ${renderScoreBadge(s.domestic_score, '国内平台热度')}
            </div>
          </div>
          <div class="info-gap-section" style="padding: 0.6rem; background: rgba(245,158,11,0.1); border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(245,158,11,0.2); margin-top: auto;">
            <span style="font-size: 0.8rem; color: #f59e0b; font-weight: 600;"><i data-lucide="trending-up" class="icon-sm"></i> 信息差指数: ${s.info_gap > 0 ? '+' : ''}${s.info_gap || 0}</span>
            <div style="display: flex; gap: 0.4rem;">
              ${s.xhs_copy ? `<button class="btn btn-sm copy-xhs-btn" data-copy="${encodeURIComponent(s.xhs_copy)}" style="background: #ff2442; color: #fff; padding: 0.2rem 0.5rem; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;"><i data-lucide="clipboard-copy" class="icon-sm"></i> 文案</button>` : ''}
              <button class="btn btn-sm btn-open-ops" data-repo-url="${s.repo_name || ''}" style="background: #6366f1; color: #fff; padding: 0.2rem 0.5rem; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;"><i data-lucide="megaphone" class="icon-sm"></i> 发文</button>
            </div>
          </div>
        </div>
      </div>
      <div class="carousel-controls">
         ${window._topPicksData.map((_, i) => `<div class="carousel-dot ${i === window._topPicksIndex ? 'active' : ''}" onclick="window.setTopPickIndex(${i})"></div>`).join('')}
      </div>
      `;
      topPicksCards.innerHTML = cardsHtml;

      // 绑定复制事件
      topPicksCards.querySelectorAll('.copy-xhs-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const text = decodeURIComponent(e.currentTarget.getAttribute('data-copy'));
          navigator.clipboard.writeText(text).then(() => {
            showToast('✨ 小红书爆款文案已复制到剪贴板！', 'success');
          });
        });
      });

      // 绑定发文排版事件
      topPicksCards.querySelectorAll('.btn-open-ops').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const url = btn.getAttribute('data-repo-url');
          if (window.openMediaOpsDrawer) {
            window.openMediaOpsDrawer(url);
          }
        });
      });

      if (window.lucide) {
        window.lucide.createIcons();
      }
    };

    window.nextTopPick = () => {
      window.setTopPickIndex((window._topPicksIndex + 1) % window._topPicksData.length);
    };

    window.prevTopPick = () => {
      window.setTopPickIndex((window._topPicksIndex - 1 + window._topPicksData.length) % window._topPicksData.length);
    };

    window.setTopPickIndex = (i) => {
       window._topPicksIndex = i;
       window.renderCurrentTopPick();
       clearInterval(window._topPicksInterval);
       window._topPicksInterval = setInterval(() => {
          window._topPicksIndex = (window._topPicksIndex + 1) % window._topPicksData.length;
          window.renderCurrentTopPick();
       }, 5000);
    };

    // 初始渲染并启动轮播
    window.setTopPickIndex(0);
  }

  // 渲染 Chart.js 双轴对比图
  function renderSocialCompareChart(scores) {
    const chartSection = document.getElementById('social-chart-section');
    const canvas = document.getElementById('social-compare-chart');
    if (!chartSection || !canvas || !scores || scores.length === 0) {
      if (chartSection) chartSection.classList.add('hidden');
      return;
    }

    chartSection.classList.remove('hidden');
    const chartData = scores.slice(0, 10).filter(s => s.github_score >= 0 || s.social_score >= 0);
    if (chartData.length === 0) { chartSection.classList.add('hidden'); return; }

    const labels = chartData.map(s => {
      const name = s.repo_name || '';
      return name.includes('/') ? name.split('/').pop() : name;
    });

    if (socialCompareChart) { socialCompareChart.destroy(); socialCompareChart = null; }

    const ctx = canvas.getContext('2d');
    socialCompareChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'GitHub 热度',
            data: chartData.map(s => s.github_score >= 0 ? s.github_score : 0),
            backgroundColor: 'rgba(99, 102, 241, 0.7)',
            borderColor: 'rgba(99, 102, 241, 1)',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: '海外热度 (YT/X)',
            data: chartData.map(s => s.social_score >= 0 ? s.social_score : 0),
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
            borderColor: 'rgba(16, 185, 129, 1)',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: '国内热度 (B站/V2EX)',
            data: chartData.map(s => s.domestic_score >= 0 ? s.domestic_score : 0),
            backgroundColor: 'rgba(244, 63, 94, 0.7)',
            borderColor: 'rgba(244, 63, 94, 1)',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: 'rgba(255,255,255,0.8)', font: { size: 12 } }
          },
          tooltip: {
            callbacks: {
              afterLabel: (ctx) => {
                const item = chartData[ctx.dataIndex];
                return item ? `趋势: ${item.trend_direction || '→'} | ${item.verdict || ''}` : '';
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            min: 0, max: 100,
            ticks: { color: 'rgba(255,255,255,0.7)' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
  }

  // 加载历史报告列表
  async function loadSocialHistory() {
    if (!socialHistorySelect) return;
    try {
      const res = await fetch('/api/social/history?limit=15');
      const result = await res.json();
      if (result.success && result.data.length > 0) {
        socialHistorySelect.innerHTML = `<option value=""><i data-lucide="history" class="icon-sm"></i> 历史报告 (${result.data.length})</option>` +
          result.data.map(h => {
            const d = new Date(h.created_at);
            const label = `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
            return `<option value="${h.id}">${label}</option>`;
          }).join('');
      }
    } catch (e) { /* 忽略 */ }
  }



  function renderSocialMonitor(data) {
    const trends = data.trends || [];
    const report = data.report || '';
    const scores = data.scores || [];
    const schedulerStatus = data.schedulerStatus || null;
    const hasMockData = trends.some(t => t.is_mock);

    // 更新状态栏
    updateSocialDataStatus(schedulerStatus, hasMockData);

    // 渲染强推卡片
    try {
      renderTopPicks(scores);
    } catch(e) { console.error('渲染强推卡片失败', e); }

    // 渲染热度对比图
    try {
      renderSocialCompareChart(scores);
    } catch(e) { console.error('渲染图表失败', e); }

    // 分类趋势
    const sspaiTrends = trends.filter(t => t.platform === 'sspai');
    const redditTrends = trends.filter(t => t.platform === 'reddit');
    const ytTrends = trends.filter(t => t.platform === 'youtube');
    const bilibiliTrends = trends.filter(t => t.platform === 'bilibili').slice(0, 5);
    const phTrends = trends.filter(t => t.platform === 'producthunt').slice(0, 5);
    const hnTrends = trends.filter(t => t.platform === 'hackernews').slice(0, 5);
    const twitterTrends = trends.filter(t => t.platform === 'twitter').slice(0, 5);
    const taaftTrends = trends.filter(t => t.platform === 'taaft' || t.platform === 'theresanaiforthat').slice(0, 5);
    const juejinTrends = trends.filter(t => t.platform === 'juejin').slice(0, 5);
    const zhihuTrends = trends.filter(t => t.platform === 'zhihu').slice(0, 5);
    const krTrends = trends.filter(t => t.platform === '36kr').slice(0, 5);
    const v2exTrends = trends.filter(t => t.platform === 'v2ex').slice(0, 5);

    // 渲染 X 话题
    // 渲染 少数派(Sspai) 列表
    if (sspaiTrendsList) {
      if (sspaiTrends.length === 0) {
        sspaiTrendsList.innerHTML = `<div class="list-placeholder" style="padding: 2rem;"><p>暂无 Sspai 平台数据。请点击"立即抓取"</p></div>`;
      } else {
        sspaiTrendsList.innerHTML = sspaiTrends.map((t, idx) => {
          return `
            <a href="${t.url}" target="_blank" class="x-trend-row">
              <div style="display: flex; flex-direction: column; flex-grow: 1; overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                  <span class="x-trend-rank">#${idx + 1}</span>
                  <span class="x-trend-title" title="${t.title}">${t.title}</span>
                </div>
              </div>
            </a>
          `;
        }).join('');
      }
    }

    // 渲染 Reddit 列表
    if (redditTrendsList) {
      if (redditTrends.length === 0) {
        redditTrendsList.innerHTML = `<div class="list-placeholder" style="padding: 2rem;"><p>暂无 Reddit 平台数据。请点击"立即抓取"</p></div>`;
      } else {
        redditTrendsList.innerHTML = redditTrends.map((t, idx) => {
          return `
            <a href="${t.url}" target="_blank" class="x-trend-row">
              <div style="display: flex; flex-direction: column; flex-grow: 1; overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                  <span class="x-trend-rank">#${idx + 1}</span>
                  <span class="x-trend-title" title="${t.title}">${t.title}</span>
                </div>
              </div>
              <span class="x-trend-volume">${t.views_or_likes || ''}</span>
            </a>
          `;
        }).join('');
      }
    }

    // 渲染 YouTube 视频
    if (youtubeTrendsList) {
      if (ytTrends.length === 0) {
        youtubeTrendsList.innerHTML = `<div class="list-placeholder" style="padding: 2rem;"><p>暂无 YouTube 视频数据。请点击"立即抓取"</p></div>`;
      } else {
        youtubeTrendsList.innerHTML = ytTrends.map(t => {
          const matchBadge = t.associated_repo_id ? `
            <span class="trend-match-badge" title="${t.match_reason || ''}">
              <i data-lucide="link" style="width:10px;height:10px"></i> 关联: ${t.repo_name || ''}
            </span>` : '';
          return `
            <a href="${t.url}" target="_blank" class="yt-video-row">
              <span class="yt-video-title" title="${t.title}">${t.title}</span>
              <div class="yt-video-meta-row">
                <span class="yt-video-channel">${t.author || '科技博主'}</span>
                <div class="yt-video-stats">
                  <span>${t.views_or_likes || ''}</span>
                  <span>•</span>
                  <span>${t.published_at || ''}</span>
                </div>
              </div>
              ${matchBadge}
            </a>
          `;
        }).join('');
      }
    }

    // 渲染 Bilibili 趋势
    if (bilibiliTrendsList) {
      if (bilibiliTrends.length === 0) {
        bilibiliTrendsList.innerHTML = `<div class="list-placeholder" style="padding: 2rem;"><p>暂无 Bilibili 趋势数据。请点击"立即抓取"</p></div>`;
      } else {
        bilibiliTrendsList.innerHTML = bilibiliTrends.map((t, idx) => {
          return `
            <a href="${t.url}" target="_blank" rel="noreferrer" class="x-trend-row">
              <div style="display: flex; flex-direction: column; flex-grow: 1; overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                  <span class="x-trend-rank">#${idx + 1}</span>
                  <span class="x-trend-title" title="${t.title}">${t.title}</span>
                </div>
              </div>
              <span class="x-trend-volume">${t.views_or_likes || ''}</span>
            </a>
          `;
        }).join('');
      }
    }

    // 渲染 V2EX 趋势
    if (v2exTrendsList) {
      if (v2exTrends.length === 0) {
        v2exTrendsList.innerHTML = `<div class="list-placeholder" style="padding: 2rem;"><p>暂无 V2EX 趋势数据。请点击"立即抓取"</p></div>`;
      } else {
        v2exTrendsList.innerHTML = v2exTrends.map((t, idx) => {
          return `
            <a href="${t.url}" target="_blank" class="x-trend-row">
              <div style="display: flex; flex-direction: column; flex-grow: 1; overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                  <span class="x-trend-rank">#${idx + 1}</span>
                  <span class="x-trend-title" title="${t.title}">${t.title}</span>
                </div>
              </div>
              <span class="x-trend-volume">${t.views_or_likes || ''}</span>
            </a>
          `;
        }).join('');
      }
    }

    const renderGenericList = (listEl, dataArr, emptyMsg) => {
      if (listEl) {
        if (dataArr.length === 0) {
          listEl.innerHTML = `<div class="list-placeholder" style="padding: 2rem;"><p>${emptyMsg}</p></div>`;
        } else {
          listEl.innerHTML = dataArr.map((t, idx) => `
            <a href="${t.url}" target="_blank" class="x-trend-row">
              <div style="display: flex; flex-direction: column; flex-grow: 1; overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                  <span class="x-trend-rank">#${idx + 1}</span>
                  <span class="x-trend-title" title="${t.title}">${t.title}</span>
                </div>
              </div>
              <span class="x-trend-volume">${t.views_or_likes || ''}</span>
            </a>
          `).join('');
        }
      }
    };

    renderGenericList(producthuntTrendsList, phTrends, '暂无 Product Hunt 热点');
    renderGenericList(hackernewsTrendsList, hnTrends, '暂无 Hacker News 热点');
    renderGenericList(twitterTrendsList, twitterTrends, '暂无 Twitter/X 热点');
    renderGenericList(taaftTrendsList, taaftTrends, '暂无 量子位 AI 资讯');
    renderGenericList(juejinTrendsList, juejinTrends, '暂无 掘金 前端热点');
    renderGenericList(zhihuTrendsList, zhihuTrends, '暂无 人人都是产品经理 商业干货');
    renderGenericList(krTrendsList, krTrends, '暂无 36Kr AI创投资讯');

    // 渲染 AI 报告
    if (socialAnalysisReportContainer) {
      if (report) {
        socialAnalysisReportContainer.innerHTML = marked.parse(report);
      } else {
        socialAnalysisReportContainer.innerHTML = `<p class="text-muted">暂无 AI 比对分析报告。</p>`;
      }
    }

    lucide.createIcons();
  }

  // 历史报告切换
  if (socialHistorySelect) {
    socialHistorySelect.addEventListener('change', async () => {
      const id = socialHistorySelect.value;
      if (!id) {
        // 如果选择为空，则重新加载最新数据
        loadSocialMonitorData();
        return;
      }
      try {
        const res = await fetch(`/api/social/history/${id}`);
        const result = await res.json();
        if (result.success) {
          // 组装用于 renderSocialMonitor 的数据格式
          const payload = result.data.structured || {};
          // 确保 report 文本也带上
          payload.report = result.data.report || '';
          
          // 重新渲染整个大盘（卡片、左侧列表、报表图）
          renderSocialMonitor(payload);
          
          const d = new Date(result.data.created_at);
          showToast(`时光倒流：已完整切换至 (${d.toLocaleString('zh-CN')}) 的大盘快照！`, 'info');
        }
      } catch (e) {
        showToast('加载历史快照失败: ' + e.message, 'error');
      }
    });
  }

  // 绑定立即抓取事件
  if (btnSocialFetchNow) {
    btnSocialFetchNow.addEventListener('click', async () => {
      btnSocialFetchNow.disabled = true;
      btnSocialFetchNow.innerHTML = '<i data-lucide="loader-2" class="spin"></i> AI 比对分析中...';
      if (socialProgress) socialProgress.classList.remove('hidden');
      
      const stepCrawl = document.getElementById('social-step-crawl');
      const stepGemini = document.getElementById('social-step-gemini');
      const stepRender = document.getElementById('social-step-render');

      if (stepCrawl) stepCrawl.className = 'step active';
      if (stepGemini) stepGemini.className = 'step';
      if (stepRender) stepRender.className = 'step';
      lucide.createIcons();

      const delay = ms => new Promise(res => setTimeout(res, ms));
      
      try {
        setTimeout(() => {
          if (stepCrawl && stepCrawl.classList.contains('active')) {
            stepCrawl.className = 'step completed';
            if (stepGemini) stepGemini.className = 'step active';
            lucide.createIcons();
          }
        }, 4000);

        const response = await fetch('/api/social/fetch-now', { method: 'POST' });
        const result = await response.json();

        if (result.success) {
          if (stepGemini) stepGemini.className = 'step completed';
          if (stepRender) stepRender.className = 'step active';
          lucide.createIcons();
          await delay(800);
          if (stepRender) stepRender.className = 'step completed';
          lucide.createIcons();
          await delay(400);
          if (socialProgress) socialProgress.classList.add('hidden');
          renderSocialMonitor(result.data);
          loadSocialHistory();
          
          if (result.data.failedPlatforms && result.data.failedPlatforms.length > 0) {
            const platformMap = {
              'youtube': 'YouTube', 'reddit': 'Reddit', 'sspai': '少数派', 'v2ex': 'V2EX',
              'bilibili': 'B站', 'producthunt': 'Product Hunt', 'hackernews': 'Hacker News',
              'twitter': 'Twitter/X', 'taaft': 'AI导航', 'juejin': '掘金', 'zhihu': '人人都是产品经理', '36kr': '36Kr'
            };
            const names = result.data.failedPlatforms.map(p => platformMap[p] || p).join('、');
            showToast(`更新完成！但以下平台失败：${names}。请稍后使用单点刷新补抓。`, 'warning', 10000);
          } else {
            showToast('社媒热点抓取与 AI 比对报告成功更新！', 'success');
          }
        } else {
          throw new Error(result.message);
        }
      } catch (err) {
        if (socialProgress) socialProgress.classList.add('hidden');
        showToast('社媒抓取与比对失败: ' + err.message, 'error');
      } finally {
        btnSocialFetchNow.disabled = false;
        btnSocialFetchNow.innerHTML = '<i data-lucide="refresh-cw"></i> <span>立即抓取并 AI 比对</span>';
        lucide.createIcons();
      }
    });
  }

  // 绑定独立抓取事件
  document.querySelectorAll('.btn-single-fetch').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const targetBtn = e.currentTarget;
      const platform = targetBtn.getAttribute('data-platform');
      if (!platform) return;
      
      const icon = targetBtn.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', 'loader-2');
        icon.classList.add('spin');
        if (window.lucide) window.lucide.createIcons();
      }
      targetBtn.disabled = true;

      try {
        const response = await fetch('/api/social/fetch-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform })
        });
        const result = await response.json();
        
        if (result.success && result.data) {
          // 返回的是全量趋势数据，直接重新渲染整个监控面板，无缝刷新
          renderSocialMonitor(result.data);
          showToast(`${platform} 独立抓取成功！`, 'success');
        } else {
          showToast(`${platform} 独立抓取失败或无更新`, 'error');
        }
      } catch (err) {
        showToast(`${platform} 抓取请求失败: ${err.message}`, 'error');
      } finally {
        targetBtn.disabled = false;
        if (icon) {
          icon.setAttribute('data-lucide', 'refresh-cw');
          icon.classList.remove('spin');
          if (window.lucide) window.lucide.createIcons();
        }
      }
    });
  });
