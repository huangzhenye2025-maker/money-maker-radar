  // ==================== 吐司通知工具 (Toast) ====================
  const toastContainer = document.getElementById('toast-container');

  function showToast(message, type = 'success', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'check-circle-2';
    if (type === 'error') icon = 'x-circle';
    if (type === 'warning') icon = 'alert-triangle'; // added warning
    if (type === 'info') icon = 'info';

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.8rem; width: 100%;">
        <i data-lucide="${icon}"></i>
        <div class="toast-text" style="flex-grow: 1;">${message}</div>
        <button class="toast-close-btn" style="background: none; border: none; color: inherit; opacity: 0.7; cursor: pointer; padding: 2px; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s;">
          <i data-lucide="x" style="width: 16px; height: 16px;"></i>
        </button>
      </div>
    `;

    toastContainer.appendChild(toast);
    
    const closeBtn = toast.querySelector('.toast-close-btn');
    closeBtn.addEventListener('click', () => {
      toast.style.animation = 'fadeOut 0.3s ease-out forwards';
      setTimeout(() => toast.remove(), 300);
    });

    if (window.lucide) {
      lucide.createIcons();
    }

    if (duration > 0) {
      setTimeout(() => {
        if (toast.parentElement) {
          toast.style.animation = 'fadeOut 0.3s ease-out forwards';
          setTimeout(() => {
            if (toast.parentElement) toast.remove();
          }, 300);
        }
      }, duration);
    }
  }
