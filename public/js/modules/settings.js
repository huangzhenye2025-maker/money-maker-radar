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

  