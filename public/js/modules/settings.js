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

