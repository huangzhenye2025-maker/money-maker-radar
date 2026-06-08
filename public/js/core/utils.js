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
      <i data-lucide="${icon}"></i>
      <div class="toast-text">${message}</div>
    `;

    toastContainer.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease-out forwards';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, duration);
  }
