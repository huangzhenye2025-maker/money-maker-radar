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
