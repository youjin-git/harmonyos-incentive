// 创建侧边栏元素
function createSidebar() {
  // 检查是否已经存在侧边栏
  if (document.getElementById('my-extension-sidebar')) {
    return;
  }

  // 创建侧边栏容器
  const sidebar = document.createElement('div');
  sidebar.id = 'my-extension-sidebar';
  sidebar.className = 'my-sidebar';

  // 创建标题
  const title = document.createElement('div');
  title.className = 'sidebar-title';
  title.textContent = '信息面板';

  // 创建内容区域
  const content = document.createElement('div');
  content.className = 'sidebar-content';
  
  // 添加一些示例信息
  const info = document.createElement('div');
  info.innerHTML = `
    <h3>欢迎使用!</h3>
    <p>这是一个简单的侧边栏插件</p>
    <hr>
    <p><strong>当前时间：</strong></p>
    <p id="current-time"></p>
    <hr>
    <p><strong>页面标题：</strong></p>
    <p>${document.title}</p>
    <hr>
    <p><strong>页面URL：</strong></p>
    <p style="word-break: break-all; font-size: 12px;">${window.location.href}</p>
  `;
  
  content.appendChild(info);

  // 创建关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'sidebar-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = function() {
    sidebar.style.right = '-350px';
  };

  // 创建打开按钮（当侧边栏关闭时显示）
  const openBtn = document.createElement('button');
  openBtn.className = 'sidebar-open';
  openBtn.textContent = '📋';
  openBtn.onclick = function() {
    sidebar.style.right = '0';
  };

  // 组装侧边栏
  sidebar.appendChild(closeBtn);
  sidebar.appendChild(title);
  sidebar.appendChild(content);
  
  // 添加到页面
  document.body.appendChild(sidebar);
  document.body.appendChild(openBtn);

  // 更新时间
  updateTime();
  setInterval(updateTime, 1000);
}

// 更新时间显示
function updateTime() {
  const timeElement = document.getElementById('current-time');
  if (timeElement) {
    const now = new Date();
    timeElement.textContent = now.toLocaleString('zh-CN');
  }
}

// 页面加载完成后创建侧边栏
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createSidebar);
} else {
  createSidebar();
}

