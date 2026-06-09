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

      <!-- 自动组装与下载区域 -->
      <div class="physical-package-area" style="margin-top: 1.5rem; padding: 1.5rem; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 12px;">
        <h4 style="margin-top: 0; margin-bottom: 1rem; color: #10b981; display: flex; align-items: center; gap: 0.5rem;">
          <i data-lucide="package-check"></i> 获取一键安装包 (用于网盘分享)
        </h4>
        <div style="display:flex;gap:12px;align-items:center; flex-wrap: wrap;">
          <button id="btn-download-full-zip" class="btn-action" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; cursor: pointer; transition: opacity 0.2s; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);" onclick="downloadZipPackage('full')">
            <i data-lucide="download"></i> 下载完整源码包及环境脚本 (.zip)
          </button>
          
          <div style="width: 1px; height: 36px; background: rgba(255,255,255,0.1); margin: 0 4px;"></div>
          
          <button id="btn-build-physical" class="btn-action btn-build-physical" style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa;" onclick="buildPhysicalPackage()">
            <i data-lucide="folder-output"></i> 生成本地测试文件夹
          </button>
          <button id="btn-open-folder-inline" class="hidden btn-open-folder" onclick="openPhysicalFolderInline()" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;padding:0.75rem 1.5rem;border-radius:8px;font-weight:600;display:flex;align-items:center;gap:0.5rem;cursor:pointer;transition:all 0.2s;">
            <i data-lucide="folder-open"></i> 打开文件夹
          </button>
        </div>
        <div id="physical-loading" class="hidden physical-loading-state" style="margin-top: 1rem;">
          <i data-lucide="loader-2" class="spin"></i> 正在处理中，请稍候 (视网络情况可能需要10-60秒)...
        </div>
        <div id="physical-result" class="hidden physical-result-state" style="margin-top: 1rem;">
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
              <strong>组装成功</strong><br>
              <span class="path-text">${result.data.absolutePath}</span>
            </div>
          </div>
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

  window.downloadZipPackage = async function(type) {
    if (!state.currentSelectedRepo || !currentPackageKitData) return;
    const repo = state.currentSelectedRepo;
    
    // UI Loading state
    const loading = document.getElementById('physical-loading');
    const resultDiv = document.getElementById('physical-result');
    const btnFull = document.getElementById('btn-download-full-zip');
    const originalFullHtml = btnFull.innerHTML;
    
    btnFull.disabled = true;
    btnFull.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 打包下载中...';
    
    loading.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    lucide.createIcons();

    try {
      const response = await fetch('/api/download-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kit: currentPackageKitData,
          repoUrl: repo.url,
          repoName: repo.name,
          type: type
        })
      });

      if (!response.ok) {
        let errMsg = '下载请求失败';
        try {
          const errData = await response.json();
          errMsg = errData.message || errMsg;
        } catch(e) {}
        throw new Error(errMsg);
      }

      // 处理文件流下载
      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'package.zip';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/);
        if (filenameMatch && filenameMatch.length === 2) {
          filename = decodeURIComponent(filenameMatch[1]);
        }
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      resultDiv.classList.remove('hidden');
      resultDiv.innerHTML = `
        <div class="success-message">
          <i data-lucide="check-circle" style="color:#10b981;width:20px;height:20px"></i>
          <div>
            <strong>下载成功</strong><br>
            <span class="path-text">请在浏览器的“下载”文件夹中查看：${filename}</span>
          </div>
        </div>
      `;
      showToast('整合包下载成功！', 'success');
      lucide.createIcons();
    } catch (err) {
      showToast('打包下载失败: ' + err.message, 'error');
    } finally {
      loading.classList.add('hidden');
      btnFull.disabled = false;
      btnFull.innerHTML = originalFullHtml;
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
