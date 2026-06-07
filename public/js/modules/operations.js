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
