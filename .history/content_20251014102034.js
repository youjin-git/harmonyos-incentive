// ========== API 拦截功能 ==========
// 通过加载外部文件的方式注入脚本，避免 CSP 限制
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
  this.remove();
  console.log('📦 [Content Script] 注入脚本已加载');
};
(document.head || document.documentElement).appendChild(script);

// Content Script 中接收拦截的数据
const apiRequests = [];
// 存储所有应用数据（根据appId去重）
const appsMap = new Map();

// 监听页面上下文发来的API数据
window.addEventListener('apiCaptured', function(event) {
  const requestInfo = event.detail;
  apiRequests.push(requestInfo);
  console.log('📝 [Content Script] 收到API数据:', requestInfo);
  
  // 解析并提取应用列表
  extractAppsFromResponse(requestInfo.response);
  
  updateApiDisplay();
});

// 更新侧边栏的API显示
function updateApiDisplay() {
  const apiListElement = document.getElementById('api-request-list');
  if (!apiListElement) return;
  
  if (apiRequests.length === 0) {
    return;
  }
  
  // 显示最新的请求（倒序）
  const recentRequests = apiRequests.slice(-10).reverse();
  
  apiListElement.innerHTML = recentRequests.map((req, index) => {
    const actualIndex = apiRequests.length - 1 - index;
    const statusClass = req.status >= 200 && req.status < 300 ? 'success' : 'error';
    
    // 提取关键数据
    let summaryHtml = '';
    if (req.response && req.response.data) {
      const data = req.response.data;
      summaryHtml = `
        <div class="api-summary">
          ${data.developerName ? `<div>👤 开发者: ${data.developerName}</div>` : ''}
          ${data.rewardAmount !== undefined ? `<div>💰 奖励金额: ${data.rewardAmount}</div>` : ''}
          ${data.status ? `<div>📊 状态: ${data.status}</div>` : ''}
        </div>
      `;
    }
    
    return `
      <div class="api-item" data-index="${actualIndex}">
        <div class="api-header">
          <span class="api-method ${req.method}">${req.method}</span>
          <span class="api-status ${statusClass}">${req.status || '...'}</span>
        </div>
        <div class="api-time">⏰ ${req.time}</div>
        ${summaryHtml}
        <div class="api-toggle-hint">点击查看完整数据 ▼</div>
        <div class="api-detail" id="api-detail-${actualIndex}" style="display: none;">
          <div style="margin-bottom: 10px;">
            <strong>📤 请求URL:</strong>
            <div style="font-size: 10px; word-break: break-all; margin-top: 5px; opacity: 0.8;">
              ${req.url}
            </div>
          </div>
          ${req.requestBody ? `
            <div style="margin-bottom: 10px;">
              <strong>📝 请求参数:</strong>
              <pre style="margin-top: 5px;">${JSON.stringify(
                typeof req.requestBody === 'string' ? JSON.parse(req.requestBody) : req.requestBody, 
                null, 2
              )}</pre>
            </div>
          ` : ''}
          <div>
            <strong>📥 响应数据:</strong>
            <pre style="margin-top: 5px;">${JSON.stringify(req.response, null, 2)}</pre>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // 重新绑定点击事件
  attachClickEvents();
}

// 为API项绑定点击事件
function attachClickEvents() {
  const apiItems = document.querySelectorAll('.api-item');
  apiItems.forEach(item => {
    // 移除旧的事件监听器（如果有）
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);
    
    // 添加新的事件监听器
    newItem.addEventListener('click', function() {
      const index = this.getAttribute('data-index');
      const detailElement = document.getElementById(`api-detail-${index}`);
      if (detailElement) {
        const isHidden = detailElement.style.display === 'none';
        detailElement.style.display = isHidden ? 'block' : 'none';
        
        // 更新提示文字
        const hintElement = this.querySelector('.api-toggle-hint');
        if (hintElement) {
          hintElement.textContent = isHidden ? '点击收起 ▲' : '点击查看完整数据 ▼';
        }
      }
    });
  });
}

// 截断URL显示
function truncateUrl(url) {
  if (typeof url !== 'string') return String(url);
  const maxLength = 50;
  if (url.length > maxLength) {
    return url.substring(0, maxLength) + '...';
  }
  return url;
}

// ========== 侧边栏UI ==========
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
  title.textContent = '🚀 API监控';

  // 创建内容区域
  const content = document.createElement('div');
  content.className = 'sidebar-content';
  
  // 添加API请求列表
  const info = document.createElement('div');
  info.innerHTML = `
    <div class="api-monitor">
      <h3>🎯 激励计划数据监控</h3>
      <p style="font-size: 12px; color: rgba(255,255,255,0.8);">监听目标: queryDeveloperRewardInfo</p>
      <p style="font-size: 12px; color: rgba(255,255,255,0.7);">已拦截 <span id="api-count">0</span> 次请求</p>
      <hr>
      <div id="api-request-list" class="api-list">
        <p style="text-align: center; color: rgba(255,255,255,0.6); padding: 20px;">
          等待API请求...<br>
          <span style="font-size: 11px;">刷新页面触发数据请求</span>
        </p>
      </div>
    </div>
  `;
  
  content.appendChild(info);
  
  // 更新API计数
  setInterval(() => {
    const countElement = document.getElementById('api-count');
    if (countElement) {
      countElement.textContent = apiRequests.length;
    }
  }, 500);

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
}

// 页面加载完成后创建侧边栏
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createSidebar);
} else {
  createSidebar();
}

