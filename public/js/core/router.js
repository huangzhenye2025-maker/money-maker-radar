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

    }
  }

  // ==================== 初始化启动加载 ====================
  // 默认加载变现情报中枢（触发全量加载）
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const pageId = item.getAttribute('data-page');
      switchPage(pageId);
    });
  });

  switchPage('hub');