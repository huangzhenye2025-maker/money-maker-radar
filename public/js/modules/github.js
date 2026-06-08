  // ==================== 页面一：概览控制台数据处理 (已移除) ====================

  // ==================== 页面二：代码评估 (Analyze) 处理 ====================
  let currentPackageKitData = null;
  const filterSearch = document.getElementById('filter-search');
  const filterCategory = document.getElementById('filter-category');
  const filterLanguage = document.getElementById('filter-language');
  const filterCommercialTier = document.getElementById('filter-commercial-tier');
  const filterSort = document.getElementById('filter-sort');
  const reposGrid = document.getElementById('repos-grid');
  const explorerLoading = document.getElementById('explorer-loading');
  const explorerEmpty = document.getElementById('explorer-empty');

  // 防画检索
  let searchTimeout = null;

  const btnGlobalSearch = document.getElementById('btn-global-search');
  if (btnGlobalSearch) {
    btnGlobalSearch.addEventListener('click', async () => {
      const query = filterSearch.value.trim();
      if (!query) {
        showToast('请输入要全网搜索的项目名称或关键字', 'error');
        return;
      }
      
      const originalHtml = btnGlobalSearch.innerHTML;
      btnGlobalSearch.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 检索中...';
      btnGlobalSearch.disabled = true;
      lucide.createIcons();

      try {
        const res = await fetch('/api/github/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        const result = await res.json();
        
        if (result.success) {
          showToast('全网检索完成，已自动收录入库！', 'success');
          // 刷新本地列表
          filterCategory.value = '';
          filterLanguage.value = '';
          filterSort.value = 'fetched_at'; // 确保按最新排序
          loadExplorerData();
        } else {
          showToast(result.message || '全网检索失败', 'error');
        }
      } catch (err) {
        showToast('请求异常: ' + err.message, 'error');
      } finally {
        btnGlobalSearch.innerHTML = originalHtml;
        btnGlobalSearch.disabled = false;
        lucide.createIcons();
      }
    });
  }

  filterSearch.addEventListener('input', () => {

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadExplorerData();
    }, 450);
  });

  [filterCategory, filterLanguage, filterSort, filterCommercialTier].forEach(select => {
    if (select) {
      select.addEventListener('change', loadExplorerData);
    }
  });

  async function loadExplorerData() {
    reposGrid.innerHTML = '';
    explorerLoading.classList.remove('hidden');
    explorerEmpty.classList.add('hidden');

    try {
      const query = filterSearch.value.trim();
      const category = filterCategory.value;
      const language = filterLanguage.value;
      const commercialTier = filterCommercialTier ? filterCommercialTier.value : '';
      const sortBy = filterSort ? filterSort.value : 'fetched_at';

      // 组装 API 查询参数
      let url = `/api/repositories?limit=60`;
      if (query) url += `&query=${encodeURIComponent(query)}`;
      if (category) url += `&category=${category}`;
      if (language) url += `&language=${language}`;
      if (commercialTier) url += `&commercialTier=${commercialTier}`;
      if (sortBy) url += `&sortBy=${sortBy}`;

      const response = await fetch(url);
      const result = await response.json();
      explorerLoading.classList.add('hidden');

      if (result.success && result.data.length > 0) {
        state.repositories = result.data;
        renderRepositoryCards(result.data);

        // 智能静默翻译机制：如果发现当前加载的项目中有任何项缺少中文翻译，且本次运行未触发过静默翻译，则在后台发起翻译
        const hasUntranslated = result.data.some(r => r.description && !r.description_zh);
        if (hasUntranslated && !state.silentTranslateTriggered) {
          state.silentTranslateTriggered = true;
          console.log('检测到有未翻译的项目，正在后台静默翻译...');
          fetch('/api/repositories/translate-pending', { method: 'POST' })
            .then(res => res.json())
            .then(resData => {
              if (resData.success && resData.count > 0) {
                console.log(`后台静默翻译成功，更新了 ${resData.count} 个项目，重新加载数据...`);
                // 静默重新拉取当前视图数据，无缝刷新中文化简介
                fetch(url)
                  .then(r => r.json())
                  .then(d => {
                    if (d.success) {
                      state.repositories = d.data;
                      renderRepositoryCards(d.data);
                    }
                  });
              }
            })
            .catch(err => console.warn('后台静默翻译失败:', err));
        }
      } else {
        explorerEmpty.classList.remove('hidden');
      }
    } catch (error) {
      explorerLoading.classList.add('hidden');
      showToast('获取热点仓库失败: ' + error.message, 'error');
    }
  }

  function renderRepositoryCards(repos) {
    const categoriesMap = {
      frontend: '前端',
      backend: '后端',
      devops: 'DevOps',
      data: 'AI/数据',
      tools: '工具',
      mobile: '移动开发',
      blockchain: 'Web3',
      gaming: '游戏开发',
      other: '其他'
    };

    reposGrid.innerHTML = repos.map(repo => {
      const hasReport = repo.commercial_score !== null && repo.commercial_score >= 0;

      let descriptionZh = repo.description_zh || '';
      if (!descriptionZh && hasReport && repo.ai_report) {
        try {
          const report = typeof repo.ai_report === 'string' ? JSON.parse(repo.ai_report) : repo.ai_report;
          if (report && report.summary) {
            descriptionZh = report.summary;
          }
        } catch (e) {}
      }

      const descHtml = descriptionZh ? `
        <p class="repo-card-desc-zh" style="color: hsl(var(--text)); font-weight: 500; font-size: 0.82rem; margin-bottom: 0.4rem; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${descriptionZh}">
          <i data-lucide="lightbulb" class="icon-sm"></i> ${descriptionZh}
        </p>
        <p class="repo-card-desc" style="font-size: 0.72rem; opacity: 0.55; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${repo.description || '暂无详细描述信息'}">
          ${repo.description || '暂无详细描述信息'}
        </p>
      ` : `
        <p class="repo-card-desc" style="font-size: 0.82rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;" title="${repo.description || '暂无详细描述信息'}">
          ${repo.description || '暂无详细描述信息'}
        </p>
      `;

      return `
        <div class="repo-card" data-repo-id="${repo.id}">
          <div class="repo-card-top">
            <div class="repo-card-header">
              <h3 title="${repo.name}">${repo.name}</h3>
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-sm btn-open-ops" data-repo-url="${repo.url}" style="background: rgba(99,102,241,0.1); color: #6366f1; border: 1px solid rgba(99,102,241,0.2); border-radius: 4px; padding: 0.15rem 0.5rem; font-size: 0.75rem; cursor: pointer;" title="一键发文排版">
                  <i data-lucide="megaphone" style="width: 14px; height: 14px;"></i>发文
                </button>
                <button class="btn-fav ${repo.is_starred === 1 ? 'active' : ''}" data-repo-id="${repo.id}">
                  <i data-lucide="star"></i>
                </button>
              </div>
            </div>
            ${descHtml}
          </div>
          
          <div class="repo-card-bottom">
            <div style="margin-bottom: 0.8rem;">
              <span class="badge bg-purple">${repo.language || '其他'}</span>
              <span class="badge">${categoriesMap[repo.category] || repo.category}</span>
            </div>
            <div class="repo-card-meta">
              <div class="repo-stats">
                <span><i data-lucide="star"></i> ${repo.stars || 0}</span>
                ${repo.stars_today ? `
                  <span style="color: hsl(var(--green)); font-weight: 600; display: inline-flex; align-items: center; gap: 0.15rem;" title="今日星标增长数">
                    <i data-lucide="trending-up" style="width: 13px; height: 13px; color: hsl(var(--green));"></i>
                    ${repo.stars_today.replace('stars today', '今日').trim()}
                  </span>
                ` : ''}
                <span><i data-lucide="git-fork"></i> ${repo.forks || 0}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    lucide.createIcons();
    
    // 绑定发文排版事件
    document.querySelectorAll('.btn-open-ops').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-repo-url');
        if (window.openMediaOpsDrawer) {
          window.openMediaOpsDrawer(url);
        }
      });
    });

    // 绑定卡片收藏点击事件（防止冒泡触发打开 Drawer）
    document.querySelectorAll('.btn-fav').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const repoId = btn.getAttribute('data-repo-id');
        const isCurrentlyStarred = btn.classList.contains('active');
        
        try {
          const res = await fetch(`/api/repositories/${repoId}/star`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isStarred: !isCurrentlyStarred })
          });
          const jsonRes = await res.json();
          if (jsonRes.success) {
            btn.classList.toggle('active');
            showToast(jsonRes.isStarred ? '收藏成功，已加为监控' : '已移出收藏监控', 'success');
            const newStarred = jsonRes.isStarred ? 1 : 0;
            // 同步本地 state.repositories
            const localRepo = state.repositories.find(r => r.id === parseInt(repoId));
            if (localRepo) localRepo.is_starred = newStarred;
            // 同步 state.allOpReposPool（自媒体中心），使收藏列表立即生效
            const opRepo = state.allOpReposPool ? state.allOpReposPool.find(r => r.id === parseInt(repoId)) : null;
            if (opRepo) opRepo.is_starred = newStarred;
          }
        } catch (err) {
          showToast('修改收藏状态失败', 'error');
        }
      });
    });

    // 绑定卡片整体点击事件，打开 Slide Drawer
    document.querySelectorAll('.repo-card').forEach(card => {
      card.addEventListener('click', () => {
        const repoId = card.getAttribute('data-repo-id');
        const foundRepo = state.repositories.find(r => r.id === parseInt(repoId));
        if (foundRepo) {
          openDetailDrawer(foundRepo);
        }
      });
    });
  }



  // ==================== 顶部全局动作执行 ====================
  const btnFetchNow = document.getElementById('btn-fetch-now');
  const btnTranslateAll = document.getElementById('btn-translate-all');

  if (btnTranslateAll) {
    btnTranslateAll.addEventListener('click', async () => {
      btnTranslateAll.disabled = true;
      showToast('正在利用 AI 批量翻译未完成的英文简介，请稍候...', 'info');
      
      try {
        const res = await fetch('/api/repositories/translate-pending', { method: 'POST' });
        const result = await res.json();
        
        btnTranslateAll.disabled = false;
        if (result.success) {
          showToast(result.message, 'success');
          if (state.activePage === 'explorer') loadExplorerData();
          if (state.activePage === 'operations') loadOperationsData();
        } else {
          throw new Error(result.message);
        }
      } catch (err) {
        btnTranslateAll.disabled = false;
        showToast('批量翻译触发失败: ' + err.message, 'error');
      }
    });
  }

  btnFetchNow.addEventListener('click', async () => {
    btnFetchNow.disabled = true;
    showToast('正在后台立即同步 GitHub 最新 Trending 潮汐...', 'info');
    
    try {
      const res = await fetch('/api/fetch-now', { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        showToast(result.message, 'success');
        // 后台更新，延迟 5 秒刷新列表
        setTimeout(() => {
          if (state.activePage === 'explorer') loadExplorerData();
          if (state.activePage === 'operations') loadOperationsData();
          btnFetchNow.disabled = false;
        }, 5000);
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      btnFetchNow.disabled = false;
      showToast('抓取触发失败: ' + err.message, 'error');
    }
  });

  // ==========================================================================
  // 页面五：自媒体矩阵运营中心 (Operations Hub) 交互控制器
  // ==========================================================================

  // 初始化自媒体运营状态
  state.selectedOpRepos = [];
  state.opTone = 'hype';
  state.opAudience = 'programmer';
  
  
  
  

  // 获取页面 DOM 元素
  const opRepoSearch = document.getElementById('op-repo-search');
  const opFilterStarredBtn = document.getElementById('op-filter-starred');
  const opFilterAllBtn = document.getElementById('op-filter-all');
  const opReposList = document.getElementById('op-repos-list');
  const opSelectedCountEl = document.getElementById('op-selected-count');
  const opBtnClearSel = document.getElementById('op-btn-clear-sel');
  const btnGenerateOperations = document.getElementById('btn-generate-operations');
  const btnFetchReadme = document.getElementById('btn-fetch-readme');
  
  const tabPreviewRed = document.getElementById('tab-preview-red');
  const tabPreviewWechat = document.getElementById('tab-preview-wechat');
  const tabPreviewMoments = document.getElementById('tab-preview-moments');
  
  // README Drawer 相关的 DOM
  const readmeDrawerOverlay = document.getElementById('readme-drawer-overlay');
  const btnCloseReadmeDrawer = document.getElementById('btn-close-readme-drawer');
  const readmeContentBody = document.getElementById('readme-content-body');
  const btnReadmeDrawerProceed = document.getElementById('btn-readme-drawer-proceed');
  const readmeDrawerRepoName = document.getElementById('readme-drawer-repo-name');
  const readmeDrawerLoading = document.getElementById('readme-drawer-loading');
  
  const opPreviewPlaceholder = document.getElementById('op-preview-placeholder');
  const opPreviewLoading = document.getElementById('op-preview-loading');
  const opResultsWrapper = document.getElementById('op-results-wrapper');
  const opActionFooter = document.getElementById('op-action-footer');
  
  const viewportXiaohongshu = document.getElementById('viewport-xiaohongshu');
  const viewportWechat = document.getElementById('viewport-wechat');
  const viewportMoments = document.getElementById('viewport-moments');
  
  const xhsRenderedBody = document.getElementById('xhs-rendered-body');
  const wechatRenderedBody = document.getElementById('wechat-rendered-body');
  const wechatMockupArticleTitle = document.getElementById('wechat-mockup-article-title');
  
  const btnCopyRawText = document.getElementById('btn-copy-raw-text');
  const btnSyncFeishu = document.getElementById('btn-sync-feishu');
  const btnCopyFormattedHtml = document.getElementById('btn-copy-formatted-html');
  const btnDownloadPoster = document.getElementById('btn-download-poster');

  const tabPreviewImage = document.getElementById('tab-preview-image');
  const viewportImageGen = document.getElementById('viewport-image-gen');

  const xhsKeywordInput = document.getElementById('xhs-keyword-input');
  const btnSearchXhs = document.getElementById('btn-search-xhs');
  const xhsLoadingSkeleton = document.getElementById('xhs-loading-skeleton');
  const xhsResultsContainer = document.getElementById('xhs-results-container');
  // 1. 获取后端仓库数据池并初始化渲染
  async function loadOperationsData() {
    let targetId = state.targetSelectRepoId;
    let targetUrl = state.targetSelectRepoUrl;
    state.targetSelectRepoId = null; // 消费并重置
    state.targetSelectRepoUrl = null;

    state.selectedOpRepos = targetId ? [targetId] : [];
    state.generatedCopy = '';
    handleOpSelectionChange();

    opReposList.innerHTML = `
      <div class="loading-spinner" style="padding: 1.5rem 0;">
        <span class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></span>
        <p style="font-size: 0.72rem;">正在加载高变现潜力仓库...</p>
      </div>
    `;

    try {
      // 并行拉取：最新150条 + 全量已收藏（避免旧收藏因分页被截断）
      const [recentRes, starredRes] = await Promise.all([
        fetch('/api/repositories?limit=150'),
        fetch('/api/repositories?limit=500&isStarred=true')
      ]);
      const [recentResult, starredResult] = await Promise.all([
        recentRes.json(),
        starredRes.json()
      ]);

      if (recentResult.success) {
        const recentData = recentResult.data || [];
        const starredData = (starredResult.success ? starredResult.data : []) || [];

        // 合并去重：以 id 为 key，已收藏项目优先（保证 is_starred 状态正确）
        const repoMap = new Map();
        recentData.forEach(r => repoMap.set(r.id, r));
        // 已收藏的覆盖或补充进来（即使不在最新150条里）
        starredData.forEach(r => repoMap.set(r.id, r));

        // 如果是从详情页跳转来的，确保目标项目在数据池中
        // （可能既非最新150条，也非已收藏，直接从浏览器内存注入）
        if (targetId && !repoMap.has(targetId)) {
          const injectedRepo = (state.repositories && state.repositories.find(r => r.id === targetId))
                            || state.currentSelectedRepo;
          if (injectedRepo && injectedRepo.id === targetId) {
            repoMap.set(targetId, injectedRepo);
            console.log(`[跳转注入] 目标项目 ${injectedRepo.name} 不在数据池中，已从内存注入`);
          }
        }

        state.allOpReposPool = Array.from(repoMap.values());
        
        // 如果是通过 URL 传入且之前没找到 ID，现在在完整数据池里找找看
        if (!targetId && targetUrl) {
          const searchStr = targetUrl.toLowerCase().replace(/\s+/g, '');
          const found = state.allOpReposPool.find(r => 
            (r.url && r.url.toLowerCase().replace(/\s+/g, '') === searchStr) || 
            (r.name && r.name.toLowerCase().replace(/\s+/g, '') === searchStr) ||
            (r.name && r.name.toLowerCase().replace(/\s+/g, '').includes(searchStr))
          );
          if (found) {
            targetId = found.id;
            // 找到 ID 后重新设置选中状态
            state.selectedOpRepos = [targetId];
            handleOpSelectionChange();
          }
        }

        // 如果找到了目标项目，但当前处于“已收藏”过滤模式下且该项目未收藏，则自动切换到“全部”模式以便展示
        if (targetId) {
          const tRepo = state.allOpReposPool.find(r => r.id === targetId);
          if (tRepo && tRepo.is_starred !== 1 && state.opFilterStarred) {
             state.opFilterStarred = false;
             if (typeof opFilterAllBtn !== 'undefined' && opFilterAllBtn) opFilterAllBtn.classList.add('active');
             if (typeof opFilterStarredBtn !== 'undefined' && opFilterStarredBtn) opFilterStarredBtn.classList.remove('active');
          }
        }

        renderOperationsRepos();

        // 如果是从详情页跳转来的，渲染完毕后在容器内滚动到目标项目并闪烁高亮
        if (targetId) {
          setTimeout(() => {
            const targetItem = opReposList.querySelector(`.op-repo-item[data-id="${targetId}"]`);
            if (targetItem) {
              // 用 offsetTop 定位到目标项（相对于容器内部），让其居中显示
              const targetOffsetTop = targetItem.offsetTop;
              const centerOffset = targetOffsetTop - (opReposList.clientHeight / 2) + (targetItem.clientHeight / 2);
              opReposList.scrollTop = Math.max(0, centerOffset);
              // 闪烁高亮动画，让用户一眼看到选中项
              targetItem.classList.add('jump-highlight');
              setTimeout(() => targetItem.classList.remove('jump-highlight'), 2000);
            } else {
              console.warn(`[跳转] 目标项目 id=${targetId} 渲染后仍未在列表中找到`);
            }
          }, 300);
        }
      } else {
        throw new Error(recentResult.message);
      }
    } catch (err) {
      showToast('获取自媒体项目列表失败: ' + err.message, 'error');

      opReposList.innerHTML = `<div class="list-placeholder"><p>获取数据失败，请点击刷新按钮重试。</p></div>`;
    }
  }

  // 2. 渲染仓库多选列表
  function renderOperationsRepos() {
    if (!state.allOpReposPool || state.allOpReposPool.length === 0) {
      opReposList.innerHTML = `<div class="list-placeholder"><p>暂无捕获仓库，请先点击头部抓取最新热点</p></div>`;
      return;
    }

    const searchQuery = opRepoSearch.value.trim().toLowerCase();
    
    // 过滤器筛选：已收藏监控 VS 全部高星
    let filtered = state.allOpReposPool;
    if (state.opFilterStarred) {
      filtered = filtered.filter(r => r.is_starred === 1);
    } else {
      // 全部高星下，优先展示星标多且最新抓取的项目
      const parseStars = s => parseInt(String(s || '0').replace(/[^0-9]/g, '')) || 0;
      filtered = [...filtered].sort((a, b) => {
        const diff = parseStars(b.stars) - parseStars(a.stars);
        if (diff !== 0) return diff;
        return new Date(b.fetched_at || 0) - new Date(a.fetched_at || 0);
      });
    }

    // 搜索关键字匹配
    if (searchQuery) {
      filtered = filtered.filter(r => 
        r.name.toLowerCase().includes(searchQuery) || 
        (r.description && r.description.toLowerCase().includes(searchQuery)) ||
        (r.language && r.language.toLowerCase().includes(searchQuery))
      );
    }

    if (filtered.length === 0) {
      opReposList.innerHTML = `<div class="list-placeholder" style="padding: 1.5rem 0;"><p>没有符合检索条件的项目</p></div>`;
      return;
    }

    let hintHtml = '';
    if (state.opFilterStarred) {
      hintHtml = `
        <div class="op-helper-hint" style="padding: 0.6rem 0.8rem; background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.15); border-radius: 8px; margin-bottom: 0.8rem; font-size: 0.72rem; color: #a5b4fc; display: flex; align-items: start; gap: 0.4rem; line-height: 1.4;">
          <i data-lucide="info" style="width: 14px; height: 14px; flex-shrink: 0; margin-top: 0.08rem; color: hsl(var(--primary));"></i>
          <span><b>使用提示：</b>最新抓取的未收藏项目，请点击上方<b>【全部高星热点】</b>切换查看，在此点击 ⭐ 收藏后即可在这里快速调用。</span>
        </div>
      `;
    }

    const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const starSvgFilled = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="hsl(37 90% 52%)" stroke="hsl(37 90% 52%)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:0.15rem;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

    const reposHtml = filtered.map(repo => {
      const isSelected = state.selectedOpRepos.includes(repo.id);
      const isStarred = repo.is_starred === 1;
      const starredStar = isStarred ? starSvgFilled : '';
      const hasScore = repo.commercial_score !== null && repo.commercial_score >= 0;
      
      let scoreBadge = '';
      if (hasScore) {
        const isMedium = repo.commercial_score < 75;
        scoreBadge = `<span class="op-repo-score ${isMedium ? 'score-medium' : ''}">${repo.commercial_score}分</span>`;
      }

      // 星标数只取数字部分，避免重复
      const starsNum = String(repo.stars || 0).replace(/[^0-9,]/g, '') || '0';

      return `
        <div class="op-repo-item ${isSelected ? 'selected' : ''}" data-id="${repo.id}">
          <div class="op-repo-checkbox">${checkSvg}</div>
          <div class="op-repo-info">
            <span class="op-repo-name">${starredStar}${repo.name}</span>
            <span class="op-repo-meta">${repo.language || 'Other'} · ★ ${starsNum}</span>
          </div>
          ${scoreBadge}
        </div>
      `;
    }).join('');

    opReposList.innerHTML = hintHtml + reposHtml;

    // 注意：不再调用 lucide.createIcons()，因为勾选图标已改为内联 SVG

    // 绑定多选卡片点击事件
    opReposList.querySelectorAll('.op-repo-item').forEach(item => {
      item.addEventListener('click', () => {
        const repoId = parseInt(item.getAttribute('data-id'));
        const index = state.selectedOpRepos.indexOf(repoId);
        
        if (index > -1) {
          state.selectedOpRepos.splice(index, 1);
          item.classList.remove('selected');
        } else {
          state.selectedOpRepos.push(repoId);
          item.classList.add('selected');
        }

        handleOpSelectionChange();
      });
    });
  }

  // 3. 仓库存控选择数量变化交互逻辑
  function handleOpSelectionChange() {
    const count = state.selectedOpRepos.length;
    opSelectedCountEl.innerText = count;

    if (count > 0) {
      opBtnClearSel.classList.remove('hidden');
    } else {
      opBtnClearSel.classList.add('hidden');
    }

    // 联动平台选择 Tabs：单选 vs 多选聚合
    const opPreviewTabs = document.querySelectorAll('.op-preview-tab');

    if (count === 0) {
      // 0 选择时，全部禁用
      opPreviewTabs.forEach(t => t.classList.add('disabled-tab'));
      opPreviewPlaceholder.classList.remove('hidden');
      opPreviewLoading.classList.add('hidden');
      opResultsWrapper.classList.add('hidden');
      opActionFooter.classList.add('hidden');
    } else if (count === 1) {
      // 1 选择时：激活小红书和微信公众号预览
      if(tabPreviewRed) tabPreviewRed.classList.remove('disabled-tab');
      if(tabPreviewWechat) tabPreviewWechat.classList.remove('disabled-tab');
      if(tabPreviewMoments) tabPreviewMoments.classList.remove('disabled-tab');
      if(tabPreviewMoments) tabPreviewMoments.classList.remove('disabled-tab');
      if(tabPreviewImage) tabPreviewImage.classList.remove('disabled-tab');
      
      // 如果状态异常，重置为小红书或微信
      if (state.activeOpPlatform !== 'xiaohongshu' && state.activeOpPlatform !== 'wechat' && state.activeOpPlatform !== 'image-gen') {
        state.activeOpPlatform = 'xiaohongshu';
      }

      updatePreviewTabsStyling();
    } else {
      // 多选择时：禁用小红书，激活并切入微信公众号预览（即周报）！
      if(tabPreviewRed) tabPreviewRed.classList.add('disabled-tab');
      if(tabPreviewWechat) tabPreviewWechat.classList.remove('disabled-tab');
      if(tabPreviewImage) tabPreviewImage.classList.remove('disabled-tab');
      
      if (state.activeOpPlatform === 'xiaohongshu') {
        state.activeOpPlatform = 'wechat';
      }
      updatePreviewTabsStyling();
    }
  }

  // 渲染 preview tabs 的激活高亮样式
  function updatePreviewTabsStyling() {
    const tabs = document.querySelectorAll('.op-preview-tab');
    tabs.forEach(tab => {
      const platform = tab.getAttribute('data-platform');
      if (platform === state.activeOpPlatform) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // 联动切换预览视口展示
    if(viewportXiaohongshu) viewportXiaohongshu.classList.add('hidden');
    if(viewportWechat) viewportWechat.classList.add('hidden');
    if(viewportMoments) viewportMoments.classList.add('hidden');
    if(viewportImageGen) viewportImageGen.classList.add('hidden');
    
    if (state.activeOpPlatform === 'xiaohongshu') {
      if(viewportXiaohongshu) viewportXiaohongshu.classList.remove('hidden');
      if (state.generatedCopy) {
        btnDownloadPoster.classList.remove('hidden');
      }
    } else if (state.activeOpPlatform === 'wechat') {
      if(viewportWechat) viewportWechat.classList.remove('hidden');
      btnDownloadPoster.classList.add('hidden');
    } else if (state.activeOpPlatform === 'moments') {
      if(viewportMoments) viewportMoments.classList.remove('hidden');
      btnDownloadPoster.classList.add('hidden');
    
      if(viewportWechat) viewportWechat.classList.remove('hidden');
      btnDownloadPoster.classList.add('hidden');
    } else if (state.activeOpPlatform === 'image-gen') {
      if(viewportImageGen) viewportImageGen.classList.remove('hidden');
      btnDownloadPoster.classList.add('hidden');
    }

    // 如果文案已生成，重新更新预览卡片填充
    if (state.generatedCopy) {
      renderMockupPreview();
    }
  }

  // 4. 选择器参数绑定
  
  // 筛选过滤器点击绑定
  opFilterStarredBtn.addEventListener('click', () => {
    opFilterStarredBtn.classList.add('active');
    opFilterAllBtn.classList.remove('active');
    state.opFilterStarred = true;
    renderOperationsRepos();
  });

  opFilterAllBtn.addEventListener('click', () => {
    opFilterAllBtn.classList.add('active');
    opFilterStarredBtn.classList.remove('active');
    state.opFilterStarred = false;
    renderOperationsRepos();
  });

  // 搜索框输入防抖
  let opSearchTimeout = null;
  opRepoSearch.addEventListener('input', () => {
    clearTimeout(opSearchTimeout);
    opSearchTimeout = setTimeout(() => {
      renderOperationsRepos();
    }, 300);
  });

  // 清除选择
  opBtnClearSel.addEventListener('click', () => {
    state.selectedOpRepos = [];
    const items = opReposList.querySelectorAll('.op-repo-item');
    items.forEach(i => i.classList.remove('selected'));
    handleOpSelectionChange();
  });

  // 语气风格和受众客群 Chips 已移除
  
  // 图片生成平台选择
  let selectedImgPlatform = 'xiaohongshu';
  const imgPlatformChips = document.querySelectorAll('#img-platform-group .op-chip');
  imgPlatformChips.forEach(chip => {
    chip.addEventListener('click', () => {
      imgPlatformChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedImgPlatform = chip.getAttribute('data-img-plat');
    });
  });

  // 图片提示词交互逻辑
  const btnCopyImgPrompt = document.getElementById('btn-copy-img-prompt');
  const imgPromptInput = document.getElementById('img-prompt-input');

  // 手动提取图片提示词
  const btnAutoPrompt = document.getElementById('btn-auto-prompt');
  if (btnAutoPrompt && imgPromptInput) {
    btnAutoPrompt.addEventListener('click', async () => {
      const copy = state.generatedCopyXhs || state.generatedCopy;
      if (!copy) {
        showToast('请先在左侧生成文案', 'warning');
        return;
      }
      imgPromptInput.value = '正在智能提取中...';
      try {
        const res = await fetch('/api/operations/generate-image-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ copy })
        });
        const data = await res.json();
        if (data.success && data.imagePrompt) {
          imgPromptInput.value = data.imagePrompt;
          showToast('提取成功', 'success');
        } else {
          imgPromptInput.value = '';
          showToast('提取失败', 'error');
        }
      } catch (e) {
        imgPromptInput.value = '';
        showToast('网络请求失败', 'error');
      }
    });
  }

  // 一键复制提示词到剪贴板
  if (btnCopyImgPrompt) {
    btnCopyImgPrompt.addEventListener('click', () => {
      const prompt = imgPromptInput.value.trim();
      if (!prompt) {
        showToast('请先提取或输入提示词', 'warning');
        return;
      }
      navigator.clipboard.writeText(prompt).then(() => {
        showToast('✨ 提示词已成功复制，快去 Midjourney / 火山文生图 粘贴吧！', 'success');
      }).catch(err => {
        showToast('复制失败，请手动选取复制', 'error');
      });
    });
  }

  // 平台预览 Tabs 点击切换绑定
  document.querySelectorAll('.op-preview-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('disabled-tab')) return;
      state.activeOpPlatform = tab.getAttribute('data-platform');
      updatePreviewTabsStyling();
    });
  });

  // README Drawer 交互逻辑
  btnCloseReadmeDrawer.addEventListener('click', () => {
    readmeDrawerOverlay.classList.add('hidden');
    readmeDrawerOverlay.classList.remove('slide-in');
  });

  btnReadmeDrawerProceed.addEventListener('click', () => {
    readmeDrawerOverlay.classList.add('hidden');
    readmeDrawerOverlay.classList.remove('slide-in');
    btnGenerateOperations.click(); // 触发自动生成
  });

  btnFetchReadme.addEventListener('click', async () => {
    const count = state.selectedOpRepos.length;
    if (count === 0) {
      showToast('请在左侧列表中至少选择一个开源项目！', 'error');
      return;
    }
    if (count > 1) {
      showToast('查看原始说明书功能目前仅支持单个项目。', 'warning');
      return;
    }

    const repoId = state.selectedOpRepos[0];
    const repo = state.allOpReposPool.find(r => r.id === repoId);
    
    // 打开 Drawer
    readmeDrawerOverlay.classList.remove('hidden');
    // 强制回流以应用动画
    void readmeDrawerOverlay.offsetWidth;
    readmeDrawerOverlay.classList.add('slide-in');
    
    readmeDrawerRepoName.textContent = repo ? repo.name : 'GitHub 项目';
    readmeContentBody.innerHTML = '';
    readmeDrawerLoading.classList.remove('hidden');

    try {
      const res = await fetch(`/api/repositories/${repoId}/readme`);
      const data = await res.json();
      
      if (data.success) {
        // 兼容性处理：如果 marked 库未成功加载（CDN 被拦截），则降级为纯文本展示
        if (typeof marked !== 'undefined') {
          readmeContentBody.innerHTML = marked.parse(data.data);
        } else {
          readmeContentBody.innerHTML = `<pre style="white-space: pre-wrap; word-break: break-word; font-family: monospace; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.7;">${data.data.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
        }
      } else {
        readmeContentBody.innerHTML = `<div class="error-state"><i data-lucide="alert-circle"></i><p>${data.message}</p></div>`;
        lucide.createIcons();
      }
    } catch (err) {
      readmeContentBody.innerHTML = `<div class="error-state"><i data-lucide="alert-circle"></i><p>网络请求失败：${err.message}</p></div>`;
      lucide.createIcons();
    } finally {
      readmeDrawerLoading.classList.add('hidden');
    }
  });

  // 5. 核心：调用 API 发起 AI 爆款文案生成
  btnGenerateOperations.addEventListener('click', async () => {
    const count = state.selectedOpRepos.length;
    if (count === 0) {
      showToast('请在左侧列表中至少选择一个开源项目作为推广素材！', 'error');
      return;
    }

    // 重置并显示加载动画
    opPreviewPlaceholder.classList.add('hidden');
    opPreviewLoading.classList.remove('hidden');
    opResultsWrapper.classList.add('hidden');
    opActionFooter.classList.add('hidden');

    const cta = document.getElementById('op-cta-input').value.trim();
    const planetName = document.getElementById('op-planet-name') ? document.getElementById('op-planet-name').value.trim() : '';

    try {
      let response;
      if (count === 1) {
        // 单个文案生成接口
        const payload = {
          id: state.selectedOpRepos[0],
          platform: state.activeOpPlatform,
          customPrompt: document.getElementById('op-custom-prompt') ? document.getElementById('op-custom-prompt').value.trim() : '',
          cta: cta,
          planetName: planetName,
          planetName: planetName
        };

        response = await fetch('/api/operations/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        // 多个聚合周报接口
        const payload = {
          ids: state.selectedOpRepos,
          customPrompt: document.getElementById('op-custom-prompt') ? document.getElementById('op-custom-prompt').value.trim() : '',
          cta: cta
        };

        response = await fetch('/api/operations/weekly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const result = await response.json();
      opPreviewLoading.classList.add('hidden');

      if (result.success) {
        state.generatedCopy = result.copy;
        state.generatedCopyXhs = result.copyXhs || result.copy;
        state.generatedCopyWechat = result.copyWechat || result.copy;
        state.generatedCopyMoments = result.copyMoments || '';
        
        // 渲染视口
        opResultsWrapper.classList.remove('hidden');
        opActionFooter.classList.remove('hidden');
        
        renderMockupPreview();
        showToast('AI 爆款自媒体“一鱼两吃”推广文案撰写润色完毕！', 'success');

        // 自动提取图片提示词
        const imgPromptInput = document.getElementById('img-prompt-input');
        if (imgPromptInput) {
          imgPromptInput.value = '正在根据刚才生成的文案，智能提取最吸引人的图片生成提示词...';
          fetch('/api/operations/generate-image-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ copy: state.generatedCopyXhs || state.generatedCopy })
          })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.imagePrompt) {
              imgPromptInput.value = data.imagePrompt;
            } else {
              imgPromptInput.value = '';
            }
          })
          .catch(() => {
            imgPromptInput.value = '';
          });
        }
      } else {
        throw new Error(result.message);
      }

    } catch (err) {
      opPreviewLoading.classList.add('hidden');
      opPreviewPlaceholder.classList.remove('hidden');
      showToast('生成文案出错: ' + err.message, 'error');
    }
  });

  // 6. 将生成的自媒体文案格式化渲染至高保真手机壳或网页容器
  function renderMockupPreview() {
    if (!state.generatedCopy) return;

    if (state.activeOpPlatform === 'xiaohongshu') {
      const copyToUse = state.generatedCopyXhs || state.generatedCopy;
      // 清理 markdown 代码包裹标志
      const cleanText = String(copyToUse || '').replace(/```markdown/gi, '').replace(/```/gi, '');

      // 1. 小红书文案预览模式
      // 将文案渲染进展示面板 (直接支持 Emojis，并换行空行透气)
      const xhsTextPanelBody = document.getElementById('xhs-text-panel-body');
      if (xhsTextPanelBody) {
        xhsTextPanelBody.innerText = cleanText;
      }
      btnDownloadPoster.classList.remove('hidden');

    } else if (state.activeOpPlatform === 'wechat') {
      const isSingle = state.selectedOpRepos.length === 1;
      btnDownloadPoster.classList.add('hidden');

      if (isSingle) {
        // 2. 微信公众号单篇 (一鱼两吃干货包) 预览模式
        const copyToUse = state.generatedCopyWechat || state.generatedCopy;
        const cleanText = String(copyToUse || '').replace(/```markdown/gi, '').replace(/```/gi, '');
        const repo = state.allOpReposPool.find(r => r.id === state.selectedOpRepos[0]);
        const repoName = repo ? repo.name : 'GitHub 神器';
        wechatMockupArticleTitle.innerText = `深度剖析：刚刚在 GitHub 飙升的开源神器 ${repoName}，如何快速把它包装成一门 SaaS 赚钱？`;

        // 公众号 Markdown 转换为富文本排版渲染 (超级亮点设计)
        const formattedHtml = parseMarkdownToWechatHTML(cleanText);
        wechatRenderedBody.innerHTML = formattedHtml;
      } else {
        // 3. 公众号聚合周报预览模式
        const cleanText = String(state.generatedCopy || '').replace(/```markdown/gi, '').replace(/```/gi, '');
        wechatMockupArticleTitle.innerText = `【搞钱技术周报】本周最值得关注的 ${state.selectedOpRepos.length} 大 GitHub 开源黑马机会！`;

        const formattedHtml = parseMarkdownToWechatHTML(cleanText);
        wechatRenderedBody.innerHTML = formattedHtml;
      }
    }
  }

  // 7. 绘制小红书三图轮播高清海报 (HTML5 Canvas 高端科技风设计)
  function drawXhsPoster(repo, slideIndex) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
    
    // 设置 Canvas 高清物理分辨率 (3:4 黄金比例 600x800)
    canvas.width = 600;
    canvas.height = 800;

    // A. 渐变底色背景
    const grad = ctx.createLinearGradient(0, 0, 0, 800);
    grad.addColorStop(0, '#1a0b2e'); // 暗系炫彩紫
    grad.addColorStop(0.5, '#0c0714'); 
    grad.addColorStop(1, '#050508');   // 太空钛金黑
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 800);

    // B. 炫彩渐变光圈 (Simulated Blur Neon Circles)
    const cyanGlow = ctx.createRadialGradient(480, 180, 10, 480, 180, 220);
    cyanGlow.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
    cyanGlow.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = cyanGlow;
    ctx.beginPath();
    ctx.arc(480, 180, 220, 0, Math.PI * 2);
    ctx.fill();

    const purpleGlow = ctx.createRadialGradient(100, 620, 10, 100, 620, 280);
    purpleGlow.addColorStop(0, 'rgba(99, 102, 241, 0.22)');
    purpleGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = purpleGlow;
    ctx.beginPath();
    ctx.arc(100, 620, 280, 0, Math.PI * 2);
    ctx.fill();

    // C. 绘制网状科技线段 (Tech Lattice lines)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 600; i += 60) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 100, 800);
      ctx.stroke();
    }

    // Helper: Wrap text on Canvas
    function wrapTextOnCanvas(text, x, y, maxWidth, lineHeight) {
      const words = String(text || '').split('');
      let line = '';
      let testLine = '';
      for (let n = 0; n < words.length; n++) {
        testLine = line + words[n];
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          ctx.fillText(line, x, y);
          line = words[n];
          y += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, y);
      return y;
    }

    const score = repo.commercial_score !== null && repo.commercial_score >= 0 ? repo.commercial_score : 85;

    if (slideIndex === 0) {
      // ==========================================
      // SLIDE 0: 爆款项目科技封面
      // ==========================================
      
      // 绘制顶部爆款徽章 (Xiaohongshu Red Badge)
      const badgeX = 50;
      const badgeY = 70;
      const badgeW = 230;
      const badgeH = 40;
      const badgeRad = 6;
      ctx.fillStyle = '#ff2442'; // 小红书红
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeRad);
      } else {
        ctx.rect(badgeX, badgeY, badgeW, badgeH);
      }
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔥 GITHUB 变现黑马推荐', badgeX + badgeW / 2, badgeY + badgeH / 2);

      // 绘制商业潜力分数 (Commercial Score Badge)
      ctx.strokeStyle = score >= 75 ? '#10b981' : '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.arc(500, 90, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = score >= 75 ? '#10b981' : '#f59e0b';
      ctx.font = '800 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(score, 500, 80);
      
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '500 10px "Microsoft YaHei", sans-serif';
      ctx.fillText('变现评分', 500, 108);

      // 提取小红书爆款标题包装
      let hasXhsTitle = false;
      let xhsTitle = '';
      let reportObj = null;
      if (repo.ai_report) {
        try {
          reportObj = typeof repo.ai_report === 'string' ? JSON.parse(repo.ai_report) : repo.ai_report;
          if (reportObj && reportObj.xhsTitlePackaging && reportObj.xhsTitlePackaging.length > 0) {
            xhsTitle = reportObj.xhsTitlePackaging[0];
            hasXhsTitle = true;
          }
        } catch (e) {}
      }

      let repoTitle = repo.name.replace('github.com/', '');

      if (hasXhsTitle) {
        // 绘制原始技术源码库源作为背书 (Small metadata tag)
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '500 12.5px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`💻 技术源项目: github.com/${repoTitle}`, 50, 132);

        // 绘制主标题 (Bold Catchy Xiaohongshu packaging title)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 31px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        wrapTextOnCanvas(xhsTitle, 50, 158, 500, 42);
      } else {
        // 绘制主项目标题 (原版 Bold Glowing Title)
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 42px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        if (repoTitle.length > 18) {
          const parts = repoTitle.split('/');
          if (parts.length >= 2) {
            ctx.fillText(parts[0] + ' /', 50, 150);
            ctx.fillText(parts[1], 50, 205);
          } else {
            ctx.fillText(repoTitle.substring(0, 15) + '...', 50, 150);
          }
        } else {
          ctx.fillText(repoTitle, 50, 150);
        }
      }

      // 绘制星标和开发语言 (Metadata Pill)
      const lang = repo.language || 'TypeScript';
      const stars = repo.stars || '0';
      
      const pillX = 50;
      const pillY = 270;
      const pillW = 280;
      const pillH = 34;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(pillX, pillY, pillW, pillH, 6);
      } else {
        ctx.rect(pillX, pillY, pillW, pillH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fbbf24'; // 星标黄
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', 65, pillY + pillH / 2);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 13px sans-serif';
      ctx.fillText(`${stars} stars`, 82, pillY + pillH / 2);

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('|', 165, pillY + pillH / 2);

      ctx.fillStyle = '#06b6d4'; // 冰蓝语言
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(lang, 185, pillY + pillH / 2);

      // Subtitle
      ctx.fillStyle = '#a5b4fc';
      ctx.font = '600 17px "Microsoft YaHei", sans-serif';
      ctx.fillText('⚡ 发现了一只非常值得包装的 GitHub 搞钱神器！', 50, 335);

      // Glassmorphism card for Description
      const cardX = 50;
      const cardY = 380;
      const cardW = 500;
      const cardH = 310;
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(cardX, cardY, cardW, cardH, 16);
      } else {
        ctx.rect(cardX, cardY, cardW, cardH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#a78bfa'; // 熔岩粉紫
      ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
      ctx.fillText('💡 项目核心简介', cardX + 30, cardY + 35);

      ctx.fillStyle = '#e4e4e7';
      ctx.font = '500 15px "Microsoft YaHei", sans-serif';
      const descText = repo.description || '暂无项目描述。这是一只非常具备潜力的开源项目，能有效解决特定受众的痛点需求！';
      wrapTextOnCanvas(descText, cardX + 30, cardY + 80, cardW - 60, 26);

    } else if (slideIndex === 1) {
      // ==========================================
      // SLIDE 1: 痛点与功能平替
      // ==========================================
      
      // 顶部徽章
      const badgeX = 50;
      const badgeY = 70;
      const badgeW = 230;
      const badgeH = 40;
      const badgeRad = 6;
      ctx.fillStyle = '#06b6d4'; // 科技青
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeRad);
      } else {
        ctx.rect(badgeX, badgeY, badgeW, badgeH);
      }
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💡 解决什么刚需痛点？', badgeX + badgeW / 2, badgeY + badgeH / 2);

      // 小标题 (项目名字)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(repo.name.toUpperCase(), 50, 135);

      // 主标题
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 36px "Microsoft YaHei", sans-serif';
      ctx.fillText('🛠️ 痛点剖析与功能平替', 50, 165);

      // Glassmorphic Card
      const cardX = 50;
      const cardY = 240;
      const cardW = 500;
      const cardH = 460;
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(cardX, cardY, cardW, cardH, 16);
      } else {
        ctx.rect(cardX, cardY, cardW, cardH);
      }
      ctx.fill();
      ctx.stroke();

      let painPoints = [
        '自托管运维极难：原生开源版本缺乏一键脚本，企业部署维护成本极高。',
        '传统竞品收费太贵：商业同类软件价格高昂，中小企业急需完美高性价比替身。',
        '痛点落地模糊：项目功能繁多，普通人不知道该怎么结合业务场景解决问题。'
      ];
      let mappings = [];

      if (repo.ai_report) {
        try {
          const report = typeof repo.ai_report === 'string' ? JSON.parse(repo.ai_report) : repo.ai_report;
          if (report) {
            if (report.xhsTranslationMapping && report.xhsTranslationMapping.length > 0) {
              mappings = report.xhsTranslationMapping;
            }
            if (report.painPoints && report.painPoints.length > 0) {
              painPoints = report.painPoints;
            }
          }
        } catch (e) {}
      }

      ctx.fillStyle = '#ffffff';
      
      if (mappings.length > 0) {
        // A. 绘制黑话 -> 人话对照卡片
        ctx.fillStyle = '#a5b4fc';
        ctx.font = 'bold 15.5px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('📝 【技术黑话 ➔ 爆款白话】翻译对照', cardX + 30, cardY + 28);

        // Technical Box
        const boxY = cardY + 60;
        const boxH = 80;
        const boxW = 205;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cardX + 25, boxY, boxW, boxH, 8);
        else ctx.rect(cardX + 25, boxY, boxW, boxH);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
        ctx.fillText('💻 GitHub 技术术语', cardX + 35, boxY + 14);
        ctx.fillStyle = '#a1a1aa';
        ctx.font = '500 11px sans-serif';
        wrapTextOnCanvas(mappings[0].techTerm, cardX + 35, boxY + 34, boxW - 20, 16);

        // Arrow
        ctx.fillStyle = '#ff2442';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('➔', cardX + 250, boxY + boxH / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // Packaged Box (Xiaohongshu red theme)
        ctx.fillStyle = 'rgba(255, 36, 66, 0.06)';
        ctx.strokeStyle = 'rgba(255, 36, 66, 0.25)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cardX + 270, boxY, boxW, boxH, 8);
        else ctx.rect(cardX + 270, boxY, boxW, boxH);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ff2442';
        ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
        ctx.fillText('📕 小红书爆款人话', cardX + 280, boxY + 14);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11.5px "Microsoft YaHei", sans-serif';
        wrapTextOnCanvas(mappings[0].humanPack, cardX + 280, boxY + 34, boxW - 20, 16);

        // B. 绘制 2 个小白痛点剖析
        ctx.fillStyle = '#06b6d4';
        ctx.font = 'bold 15.5px "Microsoft YaHei", sans-serif';
        ctx.fillText('💥 小白用户刚需痛点：', cardX + 30, cardY + 165);

        painPoints.slice(0, 2).forEach((pt, index) => {
          const py = cardY + 205 + index * 120;
          ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cardX + 45, py + 18, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#06b6d4';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(index + 1, cardX + 45, py + 18);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';

          const rawText = pt.replace(/^\d\.\s*/, '');
          const parts = rawText.split('：');

          if (parts.length >= 2) {
            ctx.fillStyle = '#ffffff';
            ctx.fillText(parts[0] + '：', cardX + 75, py);
            ctx.fillStyle = '#a1a1aa';
            ctx.font = '500 13px sans-serif';
            let detail = parts[1];
            if (detail.length > 55) detail = detail.substring(0, 52) + '...';
            wrapTextOnCanvas(detail, cardX + 75, py + 24, cardW - 105, 19);
          } else {
            ctx.fillStyle = '#ffffff';
            let main = pt;
            if (main.length > 55) main = main.substring(0, 52) + '...';
            wrapTextOnCanvas(main, cardX + 75, py + 8, cardW - 105, 19);
          }
        });
      } else {
        // 兜底绘制：原版 painPoints 列表
        painPoints.forEach((pt, index) => {
          const py = cardY + 30 + index * 140;
          
          ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cardX + 45, py + 18, 18, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#06b6d4';
          ctx.font = 'bold 15px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(index + 1, cardX + 45, py + 18);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          
          const rawText = pt.replace(/^\d\.\s*/, '');
          const parts = rawText.split('：');
          
          if (parts.length >= 2) {
            ctx.fillStyle = '#ffffff';
            ctx.fillText(parts[0] + '：', cardX + 80, py);
            
            ctx.fillStyle = '#a1a1aa';
            ctx.font = '500 13.5px sans-serif';
            let detail = parts[1];
            if (detail.length > 55) detail = detail.substring(0, 52) + '...';
            wrapTextOnCanvas(detail, cardX + 80, py + 26, cardW - 110, 20);
          } else {
            ctx.fillStyle = '#ffffff';
            let main = pt;
            if (main.length > 55) main = main.substring(0, 52) + '...';
            wrapTextOnCanvas(main, cardX + 80, py + 8, cardW - 110, 20);
          }
        });
      }

    } else if (slideIndex === 2) {
      // ==========================================
      // SLIDE 2: 变现模型
      // ==========================================
      
      // 顶部徽章
      const badgeX = 50;
      const badgeY = 70;
      const badgeW = 230;
      const badgeH = 40;
      const badgeRad = 6;
      ctx.fillStyle = '#ffb703'; // 金黄色
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeRad);
      } else {
        ctx.rect(badgeX, badgeY, badgeW, badgeH);
      }
      ctx.fill();

      ctx.fillStyle = '#111111';
      ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💰 普通人如何副业变现？', badgeX + badgeW / 2, badgeY + badgeH / 2);

      // 小标题 (项目名字)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(repo.name.toUpperCase(), 50, 135);

      // 主标题
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 36px "Microsoft YaHei", sans-serif';
      ctx.fillText('💎 商业变现路径推演', 50, 165);

      // Glassmorphic Card
      const cardX = 50;
      const cardY = 240;
      const cardW = 500;
      const cardH = 460;
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(cardX, cardY, cardW, cardH, 16);
      } else {
        ctx.rect(cardX, cardY, cardW, cardH);
      }
      ctx.fill();
      ctx.stroke();

      let monetizationDetails = null;
      let points = [
        'SaaS 云托管：一键云端打包免运维，按月收取高溢价订阅费。',
        '私有交付：面向不懂技术企业提供代汉化、代部署技术顾问服务。',
        '信息差倒卖：挂闲鱼包汉化及视频教程，零成本录像赚信息差。'
      ];

      if (repo.ai_report) {
        try {
          const report = typeof repo.ai_report === 'string' ? JSON.parse(repo.ai_report) : repo.ai_report;
          if (report) {
            if (report.xhsMonetizationDetails) {
              monetizationDetails = report.xhsMonetizationDetails;
            }
            if (report.monetizationModels && report.monetizationModels.length >= 2) {
              points[0] = report.monetizationModels[0];
              points[1] = report.monetizationModels[1];
            }
          }
        } catch (e) {}
      }

      ctx.fillStyle = '#ffffff';

      if (monetizationDetails) {
        // 绘制两款定制的小红书变现卡片 (路径 1 & 路径 2)
        const paths = [
          {
            title: '低客单价跑量 (免安装绿色版+傻瓜指南)',
            color: '#ffb703',
            glowColor: 'rgba(255, 183, 3, 0.05)',
            borderGlow: 'rgba(255, 183, 3, 0.25)',
            desc: monetizationDetails.packagedProduct || '',
            cta: monetizationDetails.packagedProductCta || '评论区扣“要”，私信引流！'
          },
          {
            title: '高客单价服务 (远程代部署/代搭建代运维)',
            color: '#ff2442',
            glowColor: 'rgba(255, 36, 66, 0.05)',
            borderGlow: 'rgba(255, 36, 66, 0.25)',
            desc: monetizationDetails.deploymentService || '',
            cta: monetizationDetails.deploymentServiceCta || '接单代部署，10分钟变现！'
          }
        ];

        paths.forEach((path, idx) => {
          const py = cardY + 22 + idx * 215;
          const cardWidth = cardW - 40;
          const cardHeight = 195;
          const curX = cardX + 20;

          // 绘制圆角背景框
          ctx.fillStyle = path.glowColor;
          ctx.strokeStyle = path.borderGlow;
          ctx.lineWidth = 1;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(curX, py, cardWidth, cardHeight, 10);
          else ctx.rect(curX, py, cardWidth, cardHeight);
          ctx.fill();
          ctx.stroke();

          // 绘制路径徽标/序号
          ctx.fillStyle = path.color;
          ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(`路径 ${idx + 1}：${path.title}`, curX + 15, py + 15);

          // 详细文案描述
          ctx.fillStyle = '#e4e4e7';
          ctx.font = '500 13px "Microsoft YaHei", sans-serif';
          let detailText = path.desc || '';
          if (detailText.length > 95) detailText = detailText.substring(0, 92) + '...';
          wrapTextOnCanvas(detailText, curX + 15, py + 46, cardWidth - 30, 20);

          // CTA 引流区
          const ctaY = py + 135;
          ctx.fillStyle = 'rgba(255,255,255,0.04)';
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(curX + 15, ctaY, cardWidth - 30, 40, 6);
          else ctx.rect(curX + 15, ctaY, cardWidth - 30, 40);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText('📣 引流钩子:', curX + 25, ctaY + 13);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'italic 11.5px "Microsoft YaHei", sans-serif';
          let ctaText = path.cta || '';
          if (ctaText.length > 50) ctaText = ctaText.substring(0, 47) + '...';
          ctx.fillText(ctaText, curX + 95, ctaY + 13);
        });
      } else {
        // 兜底绘制：原版 monetization 路径
        points.forEach((pt, index) => {
          const py = cardY + 30 + index * 140;
          
          ctx.fillStyle = 'rgba(255, 183, 3, 0.15)';
          ctx.strokeStyle = 'rgba(255, 183, 3, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cardX + 45, py + 18, 18, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffb703';
          ctx.font = 'bold 15px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(index + 1, cardX + 45, py + 18);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          
          const rawText = pt.replace(/^\d\.\s*/, '');
          const parts = rawText.split('：');
          
          if (parts.length >= 2) {
            ctx.fillStyle = '#ffffff';
            ctx.fillText(parts[0] + '：', cardX + 80, py);
            
            ctx.fillStyle = '#a1a1aa';
            ctx.font = '500 13.5px sans-serif';
            let detail = parts[1];
            if (detail.length > 55) detail = detail.substring(0, 52) + '...';
            wrapTextOnCanvas(detail, cardX + 80, py + 26, cardW - 110, 20);
          } else {
            ctx.fillStyle = '#ffffff';
            let main = pt;
            if (main.length > 55) main = main.substring(0, 52) + '...';
            wrapTextOnCanvas(main, cardX + 80, py + 8, cardW - 110, 20);
          }
        });
      }
    }

    // 绘制底部水印 (Watermark footer for all slides)
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '600 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GITHUB RADAR  •  自媒体运营中心  •  独立开发搞钱指南', 300, 765);

    // 将 canvas 转换为数据 URL 并填充图片
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const imgEl = document.getElementById(`xhs-cover-img-${slideIndex}`);
      const loadingEl = document.getElementById(`xhs-slide-loading-${slideIndex}`);
      
      if (imgEl) {
        imgEl.src = dataUrl;
        imgEl.classList.remove('hidden');
      }
      if (loadingEl) {
        loadingEl.classList.add('hidden');
      }
    } catch (e) {
      console.warn(`Canvas 导出 slideIndex ${slideIndex} 图片失败:`, e);
    }
    } catch (err) {
      console.error(`[drawXhsPoster] slideIndex ${slideIndex} 渲染发生未捕获异常:`, err);
      // 降级尝试隐藏 loading
      const loadingEl = document.getElementById(`xhs-slide-loading-${slideIndex}`);
      if (loadingEl) {
        loadingEl.classList.add('hidden');
      }
    }
  }

  // 7.5. 微信公众号 Markdown 转换为精致的富文本渲染器
  function parseMarkdownToWechatHTML(md) {
    if (!md) return '';
    let html = md;
    
    html = html.replace(/```markdown/gi, '').replace(/```/gi, '');
    
    html = html.replace(/^### (.*$)/gim, '<h3 style="font-size: 1.08rem; color: #07c160; border-left: 4px solid #07c160; padding-left: 0.6rem; margin: 1.6rem 0 0.8rem 0; font-weight: 600; line-height: 1.4; letter-spacing: 0.5px;">$1</h3>');
    
    html = html.replace(/^#### (.*$)/gim, '<h4 style="font-size: 0.96rem; color: #111111; margin: 1.2rem 0 0.6rem 0; font-weight: 600; line-height: 1.4;">$1</h4>');
    
    html = html.replace(/^## (.*$)/gim, '<h2 style="font-size: 1.22rem; color: #111111; border-bottom: 2px solid #07c160; padding-bottom: 0.4rem; margin: 1.8rem 0 1rem 0; font-weight: 700;">$1</h2>');
    
    html = html.replace(/^\> (.*$)/gim, '<blockquote style="background: #f7f8fa; border-left: 3px solid #07c160; padding: 0.8rem 1rem; font-size: 0.82rem; color: #555555; margin: 1rem 0; border-radius: 6px; line-height: 1.6;">$1</blockquote>');
    
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #07c160; font-weight: 700;">$1</strong>');
    
    // 微信段落及换行美化 (修复段落间距过大问题)
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');
    
    // 将 Markdown 表格解析为极其精美的微信表格样式 (微信编辑器可无损直接复制！)
    const lines = html.split('<br>');
    let inTable = false;
    let tableHtml = '';
    let processedLines = [];
    
    for (let line of lines) {
      if (line.trim().startsWith('|')) {
        inTable = true;
        const cols = line.split('|').map(c => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1);
        
        // 忽略 Markdown 分割线 | :--- | :--- |
        if (line.includes('---')) {
          continue;
        }
        
        tableHtml += '<tr style="border-bottom: 1px solid #eeeeee;">';
        cols.forEach(col => {
          // 如果是第一行且尚未闭合表头，作为表头 th 渲染，否则为 td
          if (!tableHtml.includes('</th>') && tableHtml.startsWith('<tr') && !tableHtml.includes('</td>')) {
            tableHtml += `<th style="background: #f3f4f6; color: #111111; border: 1px solid #e5e7eb; padding: 0.6rem 0.8rem; font-weight: 600; text-align: left; font-size: 0.76rem;">${col}</th>`;
          } else {
            tableHtml += `<td style="border: 1px solid #e5e7eb; padding: 0.6rem 0.8rem; font-size: 0.74rem; color: #4b5563; line-height: 1.4;">${col}</td>`;
          }
        });
        tableHtml += '</tr>';
      } else {
        if (inTable) {
          processedLines.push(`<table style="width: 100%; border-collapse: collapse; margin: 1.2rem 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.02);">${tableHtml}</table>`);
          tableHtml = '';
          inTable = false;
        }
        processedLines.push(line);
      }
    }
    
    // 如果表格在末尾结束
    if (inTable) {
      processedLines.push(`<table style="width: 100%; border-collapse: collapse; margin: 1.2rem 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.02);">${tableHtml}</table>`);
    }
    
    html = processedLines.join(' ');

    // 微信内联代码美化
    html = html.replace(/`(.*?)`/g, '<code style="background: #f3f4f6; color: #ff2442; font-family: monospace; font-size: 0.82rem; padding: 0.15rem 0.35rem; border-radius: 4px; margin: 0 0.15rem;">$1</code>');

    return html;
  }

  // 8. 复制文案与配图动作绑定

  // 下载小红书高清海报配图
  btnDownloadPoster.addEventListener('click', () => {
    const activeSlide = document.querySelector('.xhs-carousel-slide.active');
    if (!activeSlide) {
      showToast('尚未生成有效配图，请先勾选项目并点击“一键智能撰写文案”', 'error');
      return;
    }
    const activeIdx = activeSlide.getAttribute('data-slide-idx');
    const activeImg = document.getElementById(`xhs-cover-img-${activeIdx}`);
    if (!activeImg || !activeImg.src || activeImg.classList.contains('hidden')) {
      showToast('尚未生成有效配图，请先勾选项目并点击“一键智能撰写文案”', 'error');
      return;
    }
    
    try {
      const activeId = state.selectedOpRepos[0];
      const repo = state.allOpReposPool.find(r => r.id === activeId);
      const repoName = repo ? repo.name.replace(/\//g, '_') : 'github_radar';
      const slideNames = ['cover', 'painpoints', 'monetization'];
      
      const link = document.createElement('a');
      link.download = `xhs_${slideNames[activeIdx] || 'page'}_${repoName}.png`;
      link.href = activeImg.src;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast('🎨 高清小红书海报配图下载已启动！请去浏览器下载夹查看！', 'success');
    } catch (err) {
      showToast('海报下载失败: ' + err.message, 'error');
    }
  });
  
  // 同步到飞书台账
  btnSyncFeishu.addEventListener('click', async () => {
    let copyToUse = state.generatedCopy;
    if (state.activeOpPlatform === 'xiaohongshu' && state.generatedCopyXhs) {
      copyToUse = state.generatedCopyXhs;
    } else if (state.activeOpPlatform === 'wechat') {
      if (state.selectedOpRepos.length === 1 && state.generatedCopyWechat) {
        copyToUse = state.generatedCopyWechat;
      } else {
        copyToUse = state.generatedCopy;
      }
    }

    if (!copyToUse) {
      showToast('没有可同步的文案', 'error');
      return;
    }

    // 获取项目名称
    let projectName = '未知项目';
    if (state.selectedOpRepos.length === 1) {
       projectName = state.selectedOpRepos[0].name || '单项目文案';
    } else if (state.selectedOpRepos.length > 1) {
       projectName = `聚合文案 (${state.selectedOpRepos.length}个项目)`;
    }

    const cleanText = copyToUse.replace(/```markdown/gi, '').replace(/```/gi, '');
    
    const originalText = btnSyncFeishu.innerHTML;
    btnSyncFeishu.innerHTML = '<i data-lucide="loader-2" class="spin"></i> <span>同步中...</span>';
    btnSyncFeishu.disabled = true;
    lucide.createIcons();

    try {
      const res = await fetch('/api/feishu/sync-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          platform: state.activeOpPlatform,
          copyText: cleanText
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('🎉 成功同步至飞书台账！', 'success');
      } else {
        showToast(data.message || '同步失败', 'error');
      }
    } catch (e) {
      showToast('网络请求失败', 'error');
    } finally {
      btnSyncFeishu.innerHTML = originalText;
      btnSyncFeishu.disabled = false;
      lucide.createIcons();
    }
  });

  // 复制纯文本
  btnCopyRawText.addEventListener('click', () => {
    let copyToUse = state.generatedCopy;
    if (state.activeOpPlatform === 'xiaohongshu' && state.generatedCopyXhs) {
      copyToUse = state.generatedCopyXhs;
    } else if (state.activeOpPlatform === 'wechat') {
      if (state.selectedOpRepos.length === 1 && state.generatedCopyWechat) {
        copyToUse = state.generatedCopyWechat;
      } else {
        copyToUse = state.generatedCopy;
      }
    }

    if (!copyToUse) return;

    // 清理 markdown 前缀标志以拷出最纯净文本
    const cleanText = copyToUse.replace(/```markdown/gi, '').replace(/```/gi, '');

    navigator.clipboard.writeText(cleanText)
      .then(() => {
        showToast('纯文本已成功复制到剪贴板，快去发布吧！', 'success');
      })
      .catch(err => {
        showToast('复制纯文本失败，请手动选择复制', 'error');
      });
  });

  // 复制带格式的微信富文本 (微信编辑器一键秒级排版！)
  btnCopyFormattedHtml.addEventListener('click', () => {
    let richContentHtml = '';

    if (state.activeOpPlatform === 'xiaohongshu') {
      // 小红书模式没有 HTML 富文本，直接提醒并复制纯文本
      btnCopyRawText.click();
      return;
    } else {
      // 微信公众号模式提取 H1 标题和正文 HTML，拼接出极其高级的排版闭环！
      const title = wechatMockupArticleTitle.innerText;
      const body = wechatRenderedBody.innerHTML;
      
      richContentHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 1.5rem; max-width: 580px; margin: 0 auto; color: #3f3f3f;">
          <h2 style="font-size: 1.35rem; font-weight: 700; color: #111111; line-height: 1.4; margin-bottom: 1.2rem;">${title}</h2>
          <span style="font-size: 0.78rem; color: #576b95; display: block; margin-bottom: 1.5rem;">作者: GitHub 搞钱雷达</span>
          <div style="border-top: 1px solid #eeeeee; padding-top: 1.5rem;">
            ${body}
          </div>
        </div>
      `;
    }

    try {
      const type = 'text/html';
      const blob = new Blob([richContentHtml], { type });
      const data = [new ClipboardItem({ [type]: blob })];
      
      navigator.clipboard.write(data)
        .then(() => {
          showToast('🚀 微信公众号富文本排版已无损保存！前往公众号编辑器直接【Ctrl+V】即可！', 'success');
        })
        .catch(err => {
          console.error(err);
          // 降级使用带普通格式的 text/plain 剪贴板写入
          navigator.clipboard.writeText(richContentHtml)
            .then(() => showToast('微信富文本代码复制成功！', 'info'));
        });
    } catch (err) {
      showToast('此浏览器不支持快捷富文本复制，将为您自动复制纯文本...', 'info');
      btnCopyRawText.click();
    }
  });
