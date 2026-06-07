// ==========================================
// 前端核心控制器：路由、数据流与 AI 报告渲染
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // 核心状态管理
  const state = {
    activePage: 'explorer',
    repositories: [],
    stats: {},
    currentSelectedRepo: null,
    charts: {},
    silentTranslateTriggered: false
  };

  // 初始化 Lucide 矢量图标
  lucide.createIcons();

  // ==================== 单页应用路由切换 ====================
  const navItems = document.querySelectorAll('.nav-item');
  const subpages = document.querySelectorAll('.subpage');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');

  const pageHeaders = {
    hub: {
      title: '变现情报中枢',
      subtitle: '一站式发现信息差红利，智能评估变现潜力，并一键发文'
    },
    github: {
      title: '榜单挖掘 - GitHub 热点过滤',
      subtitle: '从上万个热门开源项目中大海捞针，用最硬核的方式挖掘技术变现趋势'
    },
    operations: {
      title: '自媒体运营中心',
      subtitle: '一键将 GitHub 高变现热点转化为小红书及微信公众号爆款引流文案'
    },
    settings: {
      title: '系统整合配置',
      subtitle: '热重载微服务连接，动态配置 API 密钥及定时日报通知'
    },
    'xhs-data': {
      title: '小红书爆款赛道探测中心',
      subtitle: '利用红狐数据 API 穿透小红书数据壁垒，实时检索全网高转化爆款笔记'
    },
    'wechat-data': {
      title: '微信公众号大盘真实数据',
      subtitle: '利用红狐 API 双引擎探测公众号爆款流量密码'
    }
  };

  function switchPage(pageId) {
    state.activePage = pageId;

    // 切换按钮状态
    navItems.forEach(item => {
      if (item.getAttribute('data-page') === pageId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // 切换页面展示
    subpages.forEach(page => {
      if (page.id === `page-${pageId}`) {
        page.classList.add('active');
      } else {
        page.classList.remove('active');
      }
    });

    // 切换标题与子标题
    if (pageHeaders[pageId]) {
      pageTitle.innerText = pageHeaders[pageId].title;
      pageSubtitle.innerText = pageHeaders[pageId].subtitle;
    }

    // 顶部操作按钮只在「榜单挖掘」页面显示
    const headerGithubActions = document.getElementById('header-github-actions');
    if (headerGithubActions) {
      headerGithubActions.style.display = (pageId === 'github') ? 'flex' : 'none';
    }


    // 触发对应页面的加载逻辑
    if (pageId === 'hub') {
      loadSocialMonitorData();
    } else if (pageId === 'github') {
      loadExplorerData();
    } else if (pageId === 'operations') {
      // 只有当没有待跳转目标且从未加载过时才自动加载，保留用户的生成结果和状态
      if (!state.targetSelectRepoUrl && !state.targetSelectRepoId) {
        if (state.allOpReposPool.length === 0) {
          if (typeof loadOperationsData === 'function') loadOperationsData();
        }
      }
    } else if (pageId === 'settings') {
      loadSettingsData();
      loadBackupsData();
    }
  }

  // ==================== 运营中心导航逻辑 ====================
  // 如果有 media-ops-drawer（旧版本），隐藏它（已迁移为独立页面）
  const oldDrawer = document.getElementById('media-ops-drawer');
  if (oldDrawer) oldDrawer.classList.add('hidden');

  // 打开自媒体运营中心（现在是独立子页面）
  window.openMediaOpsDrawer = function(repoUrl = null) {
    if (repoUrl) {
      state.targetSelectRepoUrl = repoUrl;
    }
    switchPage('operations');
    // 延迟调用，确保页面已切换完毕
    setTimeout(() => {
      if (typeof loadOperationsData === 'function') {
        loadOperationsData();
      }
    }, 100);
  };

  // 假如有旧版关闭按钮（兼容性）
  const closeDrawerBtn = document.getElementById('btn-close-media-ops');
  const drawer = oldDrawer;

  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => {
      if (drawer) drawer.classList.add('hidden');
    });
  }

  // 点击抽屉外部背景也可关闭
  if (drawer) {
    drawer.addEventListener('click', (e) => {
      if (e.target === drawer) {
        drawer.classList.add('hidden');
      }
    });
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const pageId = item.getAttribute('data-page');
      switchPage(pageId);
    });
  });

  // ==================== 吐司通知工具 (Toast) ====================
  const toastContainer = document.getElementById('toast-container');

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'check-circle-2';
    if (type === 'error') icon = 'x-circle';
    if (type === 'info') icon = 'info';

    toast.innerHTML = `
      <i data-lucide="${icon}"></i>
      <div class="toast-text">${message}</div>
    `;

    toastContainer.appendChild(toast);
    lucide.createIcons();

    // 3.5秒后自动淡出销毁
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease-out forwards';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3500);
  }

  // ==================== 页面一：概览控制台数据处理 (已移除) ====================

  // ==================== 页面二：代码评估 (Analyze) 处理 ====================
  let currentPackageKitData = null;
  const filterSearch = document.getElementById('filter-search');
  const filterCategory = document.getElementById('filter-category');
  const filterLanguage = document.getElementById('filter-language');
  const filterSort = document.getElementById('filter-sort');
  const reposGrid = document.getElementById('repos-grid');
  const explorerLoading = document.getElementById('explorer-loading');
  const explorerEmpty = document.getElementById('explorer-empty');

  // 防画检索
  let searchTimeout = null;
  filterSearch.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadExplorerData();
    }, 450);
  });

  [filterCategory, filterLanguage, filterSort].forEach(select => {
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
      const sortBy = filterSort ? filterSort.value : 'fetched_at';

      // 组装 API 查询参数
      let url = `/api/repositories?limit=60`;
      if (query) url += `&query=${encodeURIComponent(query)}`;
      if (category) url += `&category=${category}`;
      if (language) url += `&language=${language}`;
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



  // ==================== Slide Drawer 详情抽屉控制 ====================
  const drawerOverlay = document.getElementById('detail-drawer-overlay');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const drawerRepoName = document.getElementById('drawer-repo-name');
  const drawerRepoDesc = document.getElementById('drawer-repo-desc');
  const drawerRepoLang = document.getElementById('drawer-repo-lang');
  const drawerRepoCategory = document.getElementById('drawer-repo-category');
  const drawerRepoStars = document.getElementById('drawer-repo-stars').querySelector('span');
  const drawerRepoForks = document.getElementById('drawer-repo-forks').querySelector('span');
  const btnDrawerFav = document.getElementById('btn-drawer-fav');

  // 打包助手 DOM
  const packageKitDivider = document.getElementById('package-kit-divider');
  const drawerPackageKit = document.getElementById('drawer-package-kit');
  const btnGeneratePackageKit = document.getElementById('btn-generate-package-kit');
  const packageKitLoading = document.getElementById('package-kit-loading');
  const packageKitResult = document.getElementById('package-kit-result');

  btnCloseDrawer.addEventListener('click', closeDetailDrawer);
  drawerOverlay.addEventListener('click', (e) => {
    if (e.target === drawerOverlay) closeDetailDrawer();
  });

  function closeDetailDrawer() {
    drawerOverlay.style.animation = 'fadeOut 0.25s ease-out forwards';
    drawerOverlay.querySelector('.detail-drawer').style.animation = 'slideOutDrawer 0.25s ease-out forwards';
    
    setTimeout(() => {
      drawerOverlay.classList.add('hidden');
      // 清理动画残留
      drawerOverlay.style.animation = '';
      drawerOverlay.querySelector('.detail-drawer').style.animation = '';
    }, 250);
  }

  function openDetailDrawer(repo) {
    state.currentSelectedRepo = repo;
    drawerOverlay.classList.remove('hidden');

    // 填充项目基础元数据
    drawerRepoName.innerText = repo.name;
    
    let drawerDesc = repo.description || '暂无项目描述';
    let descriptionZh = repo.description_zh || '';
    if (!descriptionZh && repo.commercial_score !== null && repo.commercial_score >= 0 && repo.ai_report) {
      try {
        const report = typeof repo.ai_report === 'string' ? JSON.parse(repo.ai_report) : repo.ai_report;
        if (report && report.summary) {
          descriptionZh = report.summary;
        }
      } catch (e) {}
    }
    if (descriptionZh) {
      drawerDesc = `【中文简介】${descriptionZh}\n\n【英文描述】${repo.description || '暂无项目描述'}`;
    }
    
    drawerRepoDesc.innerText = drawerDesc;
    drawerRepoLang.innerText = repo.language || '其他';
    drawerRepoStars.innerText = repo.stars || 0;
    drawerRepoForks.innerText = repo.forks || 0;

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
    drawerRepoCategory.innerText = categoriesMap[repo.category] || repo.category;

    // 绑定收藏状态
    if (repo.is_starred === 1) {
      btnDrawerFav.classList.add('active');
    } else {
      btnDrawerFav.classList.remove('active');
    }

    // 显示打包助手区域
    if (packageKitDivider) packageKitDivider.style.display = '';
    if (drawerPackageKit) drawerPackageKit.style.display = '';
    if (packageKitLoading) packageKitLoading.classList.add('hidden');
    
    // 如果这个 repo 之前生成过 package kit，我们就复用它，防止关闭抽屉后丢失！
    if (repo.packageKitData) {
      if (packageKitResult) {
        packageKitResult.classList.remove('hidden');
        currentPackageKitData = repo.packageKitData;
        renderPackageKit(repo.packageKitData, packageKitResult);
      }
      if (btnGeneratePackageKit) {
        btnGeneratePackageKit.disabled = false;
        btnGeneratePackageKit.innerHTML = '<i data-lucide="wand-2"></i> 重新生成';
      }
    } else {
      if (packageKitResult) {
        packageKitResult.classList.add('hidden');
        packageKitResult.innerHTML = '';
      }
      if (btnGeneratePackageKit) {
        btnGeneratePackageKit.disabled = false;
        btnGeneratePackageKit.innerHTML = '<i data-lucide="wand-2"></i> 生成打包套件';
      }
    }
    
    lucide.createIcons();

    // 恢复物理打包状态（防止重新打开抽屉时丢失按钮）
    if (state.currentSelectedRepo && state.currentSelectedRepo.physicalPackageData) {
      const resultDiv = document.getElementById('physical-result');
      if (resultDiv) {
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = `
          <div class="success-message">
            <i data-lucide="check-circle" style="color:#10b981;width:20px;height:20px"></i>
            <div>
              <strong>打包成功</strong><br>
              <span class="path-text">${state.currentSelectedRepo.physicalPackageData.absolutePath}</span>
            </div>
          </div>
          <button class="btn-open-folder" onclick="openPhysicalFolder('${state.currentSelectedRepo.physicalPackageData.absolutePath.replace(/\\/g, '\\\\')}')">
            <i data-lucide="folder-open"></i> 在本地打开
          </button>
        `;
        lucide.createIcons();
        const inlineBtn = document.getElementById('btn-open-folder-inline');
        if (inlineBtn) inlineBtn.classList.remove('hidden');
      }
    }
  }

  // 抽屉内部收藏按钮绑定
  btnDrawerFav.addEventListener('click', async () => {
    if (!state.currentSelectedRepo) return;
    const repo = state.currentSelectedRepo;
    const isCurrentlyStarred = btnDrawerFav.classList.contains('active');

    try {
      const res = await fetch(`/api/repositories/${repo.id}/star`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: !isCurrentlyStarred })
      });
      const jsonRes = await res.json();
      if (jsonRes.success) {
        btnDrawerFav.classList.toggle('active');
        showToast(jsonRes.isStarred ? '收藏成功，已加为监控' : '已移出收藏监控', 'success');
        repo.is_starred = jsonRes.isStarred ? 1 : 0;

        // 同步更新 state.repositories（热点发现器）
        const localRepo = state.repositories.find(r => r.id === repo.id);
        if (localRepo) localRepo.is_starred = repo.is_starred;

        // 同步更新 state.allOpReposPool（自媒体中心），使已收藏列表立即生效
        const opRepo = state.allOpReposPool ? state.allOpReposPool.find(r => r.id === repo.id) : null;
        if (opRepo) opRepo.is_starred = repo.is_starred;
        
        // 刷新当前激活页面
        if (state.activePage === 'explorer') {
          loadExplorerData();
        } else if (state.activePage === 'operations') {
          renderOperationsRepos();
        }
      }
    } catch (err) {
      showToast('修改收藏失败', 'error');
    }
  });

  // 打包助手按钮
  if (btnGeneratePackageKit) {
    btnGeneratePackageKit.addEventListener('click', async () => {
      if (!state.currentSelectedRepo) return;
      const repo = state.currentSelectedRepo;

      btnGeneratePackageKit.disabled = true;
      btnGeneratePackageKit.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 生成中...';
      lucide.createIcons();
      packageKitResult.classList.add('hidden');
      packageKitLoading.classList.remove('hidden');

      try {
        const res = await fetch(`/api/repositories/${repo.id}/package-kit`, {
          method: 'POST'
        });
        const result = await res.json();

        packageKitLoading.classList.add('hidden');

        if (result.success) {
          packageKitResult.classList.remove('hidden');
          currentPackageKitData = result.data;
          
          // 将生成的数据绑定到当前的 repo 对象上，这样关掉抽屉再打开也能恢复
          repo.packageKitData = result.data;
          
          renderPackageKit(result.data, packageKitResult);
          showToast('打包套件生成完成！', 'success');
        } else {
          throw new Error(result.message);
        }
      } catch (err) {
        packageKitLoading.classList.add('hidden');
        showToast('打包套件生成失败: ' + err.message, 'error');
      } finally {
        btnGeneratePackageKit.disabled = false;
        btnGeneratePackageKit.innerHTML = '<i data-lucide="wand-2"></i> 重新生成';
        lucide.createIcons();
      }
    });
  }

  async function selectRepoInOperations(repoId) {
    state.targetSelectRepoId = repoId;

    // 判断该项目是否已收藏，决定用哪个过滤模式展示
    const targetRepo = state.repositories.find(r => r.id === repoId) ||
                       (state.allOpReposPool ? state.allOpReposPool.find(r => r.id === repoId) : null);
    const isTargetStarred = targetRepo && targetRepo.is_starred === 1;

    // 若已收藏则留在已收藏模式，否则切换到全部模式以便能找到该项目
    state.opFilterStarred = isTargetStarred;
    if (opFilterAllBtn && opFilterStarredBtn) {
      if (isTargetStarred) {
        opFilterStarredBtn.classList.add('active');
        opFilterAllBtn.classList.remove('active');
      } else {
        opFilterAllBtn.classList.add('active');
        opFilterStarredBtn.classList.remove('active');
      }
    }
    switchPage('operations');
  }


  function renderPackageKit(data, container) {
    const typeClass = data.projectType || 'other';
    const difficultyEmoji = data.packagingDifficulty === '简单' ? '🟢' : data.packagingDifficulty === '中等' ? '🟡' : '🔴';

    const scripts = [
      { title: '<i data-lucide="play-circle" class="icon-sm"></i> 双击启动.bat', key: 'startupBat', desc: '小白用户双击此文件即可运行' },
      { title: '<i data-lucide="settings" class="icon-sm"></i> 安装环境.bat', key: 'envSetupBat', desc: '首次运行前执行，自动配置运行环境' },
      { title: '<i data-lucide="book-open" class="icon-sm"></i> 使用说明.txt', key: 'userGuide', desc: '面向终端用户的简易教程' },
      { title: '<i data-lucide="wrench" class="icon-sm"></i> 打包教程', key: 'packagingTutorial', desc: '面向你自己的详细打包步骤' }
    ];

    let scriptCardsHtml = scripts.map(s => {
      const content = data[s.key] || '（未生成）';
      const escapedContent = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `
        <div class="script-card">
          <div class="script-card-header">
            <h4>${s.title}<span style="font-size:0.75rem;color:rgba(255,255,255,0.4);font-weight:400;margin-left:8px">${s.desc}</span></h4>
            <button class="btn-copy-script" onclick="copyScriptContent(this, '${s.key}')">
              <i data-lucide="copy" style="width:14px;height:14px"></i> 复制
            </button>
          </div>
          <div class="script-card-body">
            <pre id="script-content-${s.key}">${escapedContent}</pre>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <!-- 项目类型检测卡片 -->
      <div class="package-type-card">
        <span class="package-type-badge ${typeClass}">${data.projectTypeChinese || data.projectType}</span>
        <div class="package-type-info">
          <div style="font-weight:600;font-size:0.95rem">项目类型已自动检测</div>
          <div class="meta-row">
            <span><i data-lucide="info" class="icon-sm"></i> 打包难度: ${data.packagingDifficulty || '未知'}</span>
            <span><i data-lucide="package" class="icon-sm"></i> 预估体积: ${data.estimatedPackageSize || '未知'}</span>
          </div>
        </div>
      </div>

      <!-- 脚本卡片 -->
      ${scriptCardsHtml}

      <!-- 文件夹结构 -->
      <div class="folder-tree-card">
        <h4><i data-lucide="folder" class="icon-sm"></i> 推荐的发布文件夹结构</h4>
        <pre>${(data.folderStructure || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      </div>

      <!-- 注意事项 -->
      ${data.keyNotes && data.keyNotes.length > 0 ? `
      <div class="package-notes">
        <h4><i data-lucide="alert-triangle" class="icon-sm"></i> 注意事项</h4>
        <ul>
          ${data.keyNotes.map(n => `<li>${n}</li>`).join('')}
        </ul>
      </div>` : ''}

      <!-- 卖点提炼 -->
      ${data.sellingPoints && data.sellingPoints.length > 0 ? `
      <div class="package-notes selling-points">
        <h4>💰 小红书/闲鱼卖点提炼</h4>
        <ul>
          ${data.sellingPoints.map(s => `<li>✅ ${s}</li>`).join('')}
        </ul>
      </div>` : ''}

      <!-- 自动组装实物文件夹区域 -->
      <div class="physical-package-area">
        <div style="display:flex;gap:12px;align-items:center;">
          <button id="btn-build-physical" class="btn-action btn-build-physical" onclick="buildPhysicalPackage()">
          <i data-lucide="download-cloud"></i> 自动组装实物包
        </button>
          <button id="btn-open-folder-inline" class="hidden btn-open-folder" onclick="openPhysicalFolderInline()" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;padding:0.75rem 1.5rem;border-radius:12px;font-weight:600;display:flex;align-items:center;gap:0.5rem;cursor:pointer;transition:all 0.2s;">
            <i data-lucide="folder-open"></i> 打开文件夹
          </button>
        </div>
        <div id="physical-loading" class="hidden physical-loading-state">
          <i data-lucide="loader-2" class="spin"></i> 正在拉取源码并组装，请稍候 (约需10-30秒)...
        </div>
        <div id="physical-result" class="hidden physical-result-state">
          <!-- 结果展示 -->
        </div>
      </div>
    `;

    lucide.createIcons();
  }

  // 全局复制脚本内容函数
  window.openPhysicalFolderInline = function() {
    if (state.currentSelectedRepo && state.currentSelectedRepo.physicalPackageData) {
      openPhysicalFolder(state.currentSelectedRepo.physicalPackageData.absolutePath.replace(/\\/g, '\\\\'));
    }
  };

  window.copyScriptContent = function(btn, key) {
    const pre = document.getElementById('script-content-' + key);
    if (!pre) return;
    const text = pre.textContent;
    navigator.clipboard.writeText(text).then(() => {
      btn.classList.add('copied');
      btn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px"></i> 已复制';
      lucide.createIcons();
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<i data-lucide="copy" style="width:14px;height:14px"></i> 复制';
        lucide.createIcons();
      }, 2000);
    }).catch(() => {
      // fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      btn.classList.add('copied');
      btn.innerHTML = '✅ 已复制';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<i data-lucide="copy" style="width:14px;height:14px"></i> 复制';
        lucide.createIcons();
      }, 2000);
    });
  };

  window.buildPhysicalPackage = async function() {
    if (!state.currentSelectedRepo || !currentPackageKitData) return;
    const repo = state.currentSelectedRepo;

    const btn = document.getElementById('btn-build-physical');
    const loading = document.getElementById('physical-loading');
    const resultDiv = document.getElementById('physical-result');

    btn.disabled = true;
    loading.classList.remove('hidden');
    resultDiv.classList.add('hidden');

    try {
      const res = await fetch(`/api/repositories/${repo.id}/build-physical-package`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ packageKit: currentPackageKitData })
      });
      
      const result = await res.json();
      loading.classList.add('hidden');
      
      if (result.success) {
        repo.physicalPackageData = result.data;
        resultDiv.classList.remove('hidden');
        const inlineBtn = document.getElementById('btn-open-folder-inline');
        if (inlineBtn) inlineBtn.classList.remove('hidden');
        resultDiv.innerHTML = `
          <div class="success-message">
            <i data-lucide="check-circle" style="color:#10b981;width:20px;height:20px"></i>
            <div>
              <strong>组装成功！</strong><br>
              <span class="path-text">${result.data.absolutePath}</span>
            </div>
          </div>
          <button class="btn-open-folder" onclick="openPhysicalFolder('${result.data.absolutePath.replace(/\\/g, '\\\\')}')">
            <i data-lucide="folder-open"></i> 在电脑中打开
          </button>
        `;
        showToast('实物包组装完成！', 'success');
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      loading.classList.add('hidden');
      showToast('组装实物包失败: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      lucide.createIcons();
    }
  };

  window.openPhysicalFolder = async function(targetPath) {
    try {
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath })
      });
    } catch (e) {
      console.error('打开文件夹失败:', e);
    }
  };

  // ==================== 页面四：系统配置 (Settings) 处理 ====================
  const setDeepseekKey = document.getElementById('set-deepseek-key');
  const setVolcKey = document.getElementById('set-volc-key');
  const setGithubToken = document.getElementById('set-github-token');
  const setWechatName = document.getElementById('set-wechat-name');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  async function loadSettingsData() {
    try {
      const res = await fetch('/api/settings');
      const result = await res.json();
      if (result.success) {
        const s = result.data;
        if (setDeepseekKey) setDeepseekKey.value = s.deepseekApiKey || '';
        if (setVolcKey) setVolcKey.value = s.volcApiKey || '';
        setGithubToken.value = s.githubToken;
        if (setWechatName) setWechatName.value = s.wechatAccountName || '';
      }
    } catch (err) {
      showToast('获取系统配置失败: ' + err.message, 'error');
    }
  }

  btnSaveSettings.addEventListener('click', async () => {
    const config = {
      deepseekApiKey: setDeepseekKey ? setDeepseekKey.value.trim() : '',
      volcApiKey: setVolcKey ? setVolcKey.value.trim() : '',
      githubToken: setGithubToken.value.trim(),
      wechatAccountName: setWechatName ? setWechatName.value.trim() : ''
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const result = await res.json();
      if (result.success) {
        showToast('系统参数保存生效成功，微服务热加载完成！', 'success');
        loadSettingsData(); // 重新加载掩码值
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      showToast('保存配置失败: ' + err.message, 'error');
    }
  });

  // ==================== 系统备份与回滚 (Backup & Rollback) 处理 ====================
  const btnCreateBackup = document.getElementById('btn-create-backup');
  const backupListEmpty = document.getElementById('backup-list-empty');
  const backupListWrapper = document.getElementById('backup-list-wrapper');

  async function loadBackupsData() {
    if (!backupListEmpty || !backupListWrapper) return;
    try {
      const res = await fetch('/api/backups');
      const result = await res.json();
      if (result.success) {
        renderBackupList(result.data);
      }
    } catch (err) {
      showToast('获取备份版本列表失败: ' + err.message, 'error');
    }
  }

  function renderBackupList(backups) {
    if (!backups || backups.length === 0) {
      backupListEmpty.classList.remove('hidden');
      backupListWrapper.classList.add('hidden');
      return;
    }

    backupListEmpty.classList.add('hidden');
    backupListWrapper.classList.remove('hidden');

    backupListWrapper.innerHTML = backups.map(b => {
      const badgeClass = b.isSafety ? 'backup-badge-safety' : 'backup-badge-normal';
      const badgeText = b.isSafety ? '安全防线' : '手动备份';
      const itemClass = b.isSafety ? 'backup-item safety' : 'backup-item';
      
      return `
        <div class="${itemClass}">
          <div class="backup-info-meta">
            <div class="backup-name-row">
              <span class="backup-badge ${badgeClass}">${badgeText}</span>
              <span style="font-family: monospace; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;" title="${b.name}">${b.name}</span>
            </div>
            <div class="backup-time-row">
              <span><i data-lucide="clock" style="width: 10px; height: 10px; display: inline-block; vertical-align: middle;"></i> ${b.time}</span>
              <span><i data-lucide="hard-drive" style="width: 10px; height: 10px; display: inline-block; vertical-align: middle;"></i> ${b.size}</span>
            </div>
          </div>
          <div class="backup-item-actions">
            <button class="btn-rollback-action" data-id="${b.id}" title="回滚到此版本">
              <i data-lucide="rotate-ccw" style="width: 12px; height: 12px;"></i>
            </button>
            <button class="btn-delete-action" data-id="${b.id}" title="删除备份">
              <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // 初始化新的 lucide 图标
    lucide.createIcons({
      attrs: {
        class: 'lucide-icon'
      },
      nameAttr: 'data-lucide'
    });

    // 绑定回滚按钮事件
    const rollbackButtons = backupListWrapper.querySelectorAll('.btn-rollback-action');
    rollbackButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.getAttribute('data-id');
        const confirmRestore = confirm(`【严重警告】您确定要回滚到备份版本 [${id}] 吗？\n\n回滚将会：\n1. 覆盖您现有的全部源代码（src、public 文件夹）。\n2. 覆盖您当前的系统配置文件（.env）。\n3. 覆盖您当前的 SQLite 数据库。\n\n系统会自动备份您当前的现场作为“后悔药”。确定回滚吗？`);
        
        if (confirmRestore) {
          showToast('正在执行回滚并自动生成恢复防线，请勿关闭系统...', 'info');
          try {
            const res = await fetch(`/api/backups/${id}/rollback`, { method: 'POST' });
            const result = await res.json();
            if (result.success) {
              alert('回滚数据已全部恢复！后台 Node 服务进程正在重启以应用版本，网页即将关闭。请在终端重新运行项目后刷新此页面。');
              location.reload();
            } else {
              throw new Error(result.message);
            }
          } catch (err) {
            showToast('回滚执行失败: ' + err.message, 'error');
          }
        }
      });
    });

    // 绑定删除按钮事件
    const deleteButtons = backupListWrapper.querySelectorAll('.btn-delete-action');
    deleteButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.getAttribute('data-id');
        if (confirm(`确定要永久删除备份包 [${id}] 吗？删除后将无法通过此包恢复。`)) {
          try {
            const res = await fetch(`/api/backups/${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) {
              showToast('备份已成功删除', 'success');
              loadBackupsData();
            } else {
              throw new Error(result.message);
            }
          } catch (err) {
            showToast('删除备份失败: ' + err.message, 'error');
          }
        }
      });
    });
  }

  if (btnCreateBackup) {
    btnCreateBackup.addEventListener('click', async () => {
      showToast('正在创建系统备份包...', 'info');
      btnCreateBackup.disabled = true;
      try {
        const res = await fetch('/api/backups', { method: 'POST' });
        const result = await res.json();
        if (result.success) {
          showToast('系统当前版本及数据库备份创建成功！', 'success');
          loadBackupsData();
        } else {
          throw new Error(result.message);
        }
      } catch (err) {
        showToast('创建备份失败: ' + err.message, 'error');
      } finally {
        btnCreateBackup.disabled = false;
      }
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
  state.activeOpPlatform = 'xiaohongshu';
  state.generatedCopy = '';
  state.allOpReposPool = [];
  state.opFilterStarred = true;

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
    if(viewportImageGen) viewportImageGen.classList.add('hidden');
    
    if (state.activeOpPlatform === 'xiaohongshu') {
      if(viewportXiaohongshu) viewportXiaohongshu.classList.remove('hidden');
      if (state.generatedCopy) {
        btnDownloadPoster.classList.remove('hidden');
      }
    } else if (state.activeOpPlatform === 'wechat') {
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

    try {
      let response;
      if (count === 1) {
        // 单个文案生成接口
        const payload = {
          id: state.selectedOpRepos[0],
          platform: state.activeOpPlatform,
          customPrompt: document.getElementById('op-custom-prompt') ? document.getElementById('op-custom-prompt').value.trim() : '',
          cta: cta
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
    
    // 微信段落及换行美化
    html = html.replace(/\n\n/g, '<p style="margin: 0.8rem 0; line-height: 1.65; color: #3f3f3f;"></p>');
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

  // ==================== 页面六：社媒热点监控 (Social Monitor) ====================
  const sspaiTrendsList = document.getElementById('sspai-trends-list');
  const redditTrendsList = document.getElementById('reddit-trends-list');
  const youtubeTrendsList = document.getElementById('youtube-trends-list');
  const bilibiliTrendsList = document.getElementById('bilibili-trends-list');
  const v2exTrendsList = document.getElementById('v2ex-trends-list');
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

    topPicksCards.innerHTML = hotItems.map(s => `
      <div class="top-pick-card" style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1.5rem; margin-bottom: 1.5rem;">
        <div class="top-pick-header" style="margin-bottom: 0.5rem;">
          <span class="top-pick-name">${s.repo_name || '未知项目'} ${s.verdict === '强推' ? '<span class="badge" style="background:#f59e0b;color:#fff;margin-left:8px">强推</span>' : ''}</span>
          ${renderTrendArrow(s.trend_direction)}
        </div>
        <div class="top-pick-match" style="margin-bottom: 0.8rem; color: #cbd5e1; font-size: 0.95rem; line-height: 1.4;">${s.social_match || ''}</div>
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
        <div class="info-gap-section" style="margin: 0.5rem 0 0 0; padding: 0.6rem; background: rgba(245,158,11,0.1); border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.85rem; color: #f59e0b; font-weight: 600;"><i data-lucide="trending-up" class="icon-sm"></i> 信息差指数: ${s.info_gap > 0 ? '+' : ''}${s.info_gap || 0}</span>
          <div style="display: flex; gap: 0.4rem;">
            ${s.xhs_copy ? `<button class="btn btn-sm copy-xhs-btn" data-copy="${encodeURIComponent(s.xhs_copy)}" style="background: #ff2442; color: #fff; padding: 0.2rem 0.6rem; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;"><i data-lucide="clipboard-copy" class="icon-sm"></i> 复制文案</button>` : ''}
            <button class="btn btn-sm btn-open-ops" data-repo-url="${s.repo_name || ''}" style="background: #6366f1; color: #fff; padding: 0.2rem 0.6rem; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;"><i data-lucide="megaphone" class="icon-sm"></i> 发文排版</button>
          </div>
        </div>
      </div>
    `).join('');

    // 绑定复制事件
    document.querySelectorAll('.copy-xhs-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const text = decodeURIComponent(e.currentTarget.getAttribute('data-copy'));
        navigator.clipboard.writeText(text).then(() => {
          showToast('✨ 小红书爆款文案已复制到剪贴板！', 'success');
        });
      });
    });

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

    lucide.createIcons();
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
    const bilibiliTrends = trends.filter(t => t.platform === 'bilibili');
    const v2exTrends = trends.filter(t => t.platform === 'v2ex');

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
          showToast('社媒热点抓取与 AI 比对报告成功更新！', 'success');
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

  // ==================== 小红书大盘真实数据查询 ====================
  if (btnSearchXhs) {
    btnSearchXhs.addEventListener('click', async () => {
      const keyword = xhsKeywordInput.value.trim();
      if (!keyword) {
        showToast('请输入赛道关键词进行查询', 'warning');
        return;
      }
      
      xhsLoadingSkeleton.classList.remove('hidden');
      xhsResultsContainer.innerHTML = '';
      btnSearchXhs.disabled = true;
      btnSearchXhs.innerHTML = '<i data-lucide="loader" class="spin"></i> 查询中...';
      lucide.createIcons();

      try {
        const response = await fetch('/api/xhs/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword })
        });
        const result = await response.json();
        
        if (result.success) {
          renderXhsData(result.data);
        } else {
          throw new Error(result.message);
        }
      } catch (err) {
        showToast('小红书数据拉取失败: ' + err.message, 'error');
        xhsResultsContainer.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 2rem 0;">拉取失败: ${err.message}</div>`;
      } finally {
        xhsLoadingSkeleton.classList.add('hidden');
        btnSearchXhs.disabled = false;
        btnSearchXhs.innerHTML = '<i data-lucide="search"></i> 查询爆款';
        lucide.createIcons();
      }
    });
  }

  function renderXhsData(data) {
    let html = '';
    const items = data.items || [];
    
    if (items.length === 0) {
      html = '<div style="text-align: center; color: #6b7280; padding: 2rem 0;">未查询到相关爆款笔记，请尝试更换更泛的赛道词（如：前端、副业）。</div>';
    } else {
      items.forEach((item, idx) => {
        const link = item.noteLink || '#';
        const title = item.title || '无标题';
        const author = item.authorNickname || '未知作者';
        const authorLink = item.authorLink || '#';
        const interaction = item.interactiveCount || '--';
        const pubTime = item.createTime ? item.createTime.substring(5, 10) : '--';
        
        html += `
          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; transition: transform 0.2s, box-shadow 0.2s; cursor: pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.05)'" onmouseout="this.style.transform='none'; this.style.boxShadow='none'">
            <div style="display: flex; gap: 8px; align-items: flex-start;">
              <span style="font-weight: bold; color: #ef4444; min-width: 20px;">${idx + 1}.</span>
              <a href="${link}" target="_blank" style="color: #111827; font-weight: 600; text-decoration: none; flex: 1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5;">${title}</a>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #6b7280; align-items: center; margin-top: 4px;">
              <div>
                <a href="${authorLink}" target="_blank" style="color: #6b7280; text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#6b7280'">${author}</a>
                <span style="margin: 0 6px;">·</span> ${pubTime}
              </div>
              <div style="color: #ef4444; font-weight: 600; background: #fef2f2; padding: 2px 8px; border-radius: 12px; font-size: 12px;">
                🔥 ${interaction}互动
              </div>
            </div>
          </div>
        `;
      });
    }
    
    xhsResultsContainer.innerHTML = html;
  }

  // ==========================================================================
  // 页面六：微信公众号大盘数据 (WeChat Data) 交互控制器
  // ==========================================================================
  const tabWxSearch = document.getElementById('tab-wx-search');
  const tabWxHot10w = document.getElementById('tab-wx-hot10w');
  const wxPanelSearch = document.getElementById('wx-panel-search');
  const wxPanelHot10w = document.getElementById('wx-panel-hot10w');
  
  const wxKeywordInput = document.getElementById('wx-keyword-input');
  const btnSearchWx = document.getElementById('btn-search-wx');
  const wxCategorySelect = document.getElementById('wx-category-select');
  const btnFetchWxHot10w = document.getElementById('btn-fetch-wx-hot10w');
  const wxLoadingSkeleton = document.getElementById('wx-loading-skeleton');
  const wxResultsContainer = document.getElementById('wx-results-container');

  if (tabWxSearch && tabWxHot10w) {
    tabWxSearch.addEventListener('click', () => {
      tabWxSearch.classList.add('active');
      tabWxHot10w.classList.remove('active');
      wxPanelSearch.classList.remove('hidden');
      wxPanelHot10w.classList.add('hidden');
    });

    tabWxHot10w.addEventListener('click', () => {
      tabWxHot10w.classList.add('active');
      tabWxSearch.classList.remove('active');
      wxPanelHot10w.classList.remove('hidden');
      wxPanelSearch.classList.add('hidden');
    });
  }

  function renderWxData(data) {
    let html = '';
    const items = data.items || [];
    
    if (items.length === 0) {
      html = '<div style="text-align: center; color: #6b7280; padding: 2rem 0;">未查询到相关公众号爆文数据，请尝试更换关键词。</div>';
    } else {
      items.forEach((item, idx) => {
        const link = item.noteLink || '#';
        const title = item.title || '无标题';
        const author = item.authorNickname || '未知公众号';
        const authorLink = item.authorLink || '#';
        const interaction = item.interactiveCount || '--';
        const pubTime = item.createTime ? item.createTime.substring(0, 10) : '--';
        
        html += `
          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 8px; transition: transform 0.2s, box-shadow 0.2s; cursor: pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.05)'" onmouseout="this.style.transform='none'; this.style.boxShadow='none'">
            <div style="display: flex; gap: 8px; align-items: flex-start;">
              <span style="font-weight: bold; color: #10b981; min-width: 24px; font-size: 1.1rem;">${idx + 1}.</span>
              <a href="${link}" target="_blank" style="color: #111827; font-weight: 600; font-size: 1.1rem; text-decoration: none; flex: 1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5;">${title}</a>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #6b7280; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #f3f4f6;">
              <div>
                <a href="${authorLink}" target="_blank" style="color: #6b7280; text-decoration: none; font-weight: 500; transition: color 0.2s;" onmouseover="this.style.color='#10b981'" onmouseout="this.style.color='#6b7280'">${author}</a>
                <span style="margin: 0 6px;">·</span> 发布于 ${pubTime}
              </div>
              <div style="color: #10b981; font-weight: 600; background: #ecfdf5; padding: 4px 10px; border-radius: 12px; font-size: 13px;">
                🔥 ${interaction} 互动/阅读
              </div>
            </div>
          </div>
        `;
      });
    }
    
    wxResultsContainer.innerHTML = html;
  }

  if (btnSearchWx) {
    btnSearchWx.addEventListener('click', async () => {
      const keyword = wxKeywordInput.value.trim();
      if (!keyword) {
        showToast('请输入赛道关键词', 'error');
        return;
      }
      
      wxLoadingSkeleton.classList.remove('hidden');
      wxResultsContainer.innerHTML = '';
      btnSearchWx.disabled = true;
      btnSearchWx.innerHTML = '<i data-lucide="loader" class="spin"></i> 探测中...';
      lucide.createIcons();

      try {
        const response = await fetch('/api/wechat/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword })
        });
        const result = await response.json();
        
        if (result.success) {
          renderWxData(result.data);
        } else {
          throw new Error(result.message || '查询失败');
        }
      } catch (err) {
        showToast('微信公众号数据拉取失败: ' + err.message, 'error');
        wxResultsContainer.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 2rem 0;">拉取失败: ${err.message}</div>`;
      } finally {
        wxLoadingSkeleton.classList.add('hidden');
        btnSearchWx.disabled = false;
        btnSearchWx.innerHTML = '<i data-lucide="search"></i> 探测近期爆款';
        lucide.createIcons();
      }
    });
  }

  if (btnFetchWxHot10w) {
    btnFetchWxHot10w.addEventListener('click', async () => {
      const category = wxCategorySelect.value;
      
      wxLoadingSkeleton.classList.remove('hidden');
      wxResultsContainer.innerHTML = '';
      btnFetchWxHot10w.disabled = true;
      btnFetchWxHot10w.innerHTML = '<i data-lucide="loader" class="spin"></i> 拉取中...';
      lucide.createIcons();

      try {
        const response = await fetch('/api/wechat/hot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category })
        });
        const result = await response.json();
        
        if (result.success) {
          renderWxData(result.data);
        } else {
          throw new Error(result.message || '拉取失败');
        }
      } catch (err) {
        showToast('10w+天花板榜单拉取失败: ' + err.message, 'error');
        wxResultsContainer.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 2rem 0;">拉取失败: ${err.message}</div>`;
      } finally {
        wxLoadingSkeleton.classList.add('hidden');
        btnFetchWxHot10w.disabled = false;
        btnFetchWxHot10w.innerHTML = '<i data-lucide="award"></i> 拉取 10w+ 榜单';
        lucide.createIcons();
      }
    });
  }

  // ==================== 初始化启动加载 ====================
  // 默认加载变现情报中枢（触发全量加载）
  switchPage('hub');
});
