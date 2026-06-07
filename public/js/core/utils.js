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
