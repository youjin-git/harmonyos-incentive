// ========== API 拦截功能 ==========
// 存储拦截到的API请求
const apiRequests = [];

// 拦截 fetch 请求
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    console.log('🔍 拦截到 Fetch 请求:', url);
    
    // 记录请求信息
    const requestInfo = {
      type: 'fetch',
      url: url,
      method: options.method || 'GET',
      time: new Date().toLocaleString('zh-CN'),
      timestamp: Date.now()
    };
    
    return originalFetch.apply(this, args)
      .then(response => {
        // 克隆响应以便读取
        const clonedResponse = response.clone();
        
        // 尝试读取响应数据
        clonedResponse.json()
          .then(data => {
            requestInfo.response = data;
            requestInfo.status = response.status;
            apiRequests.push(requestInfo);
            console.log('✅ API响应数据:', data);
            
            // 更新侧边栏显示
            updateApiDisplay();
          })
          .catch(() => {
            // 如果不是JSON格式
            requestInfo.status = response.status;
            requestInfo.response = '(非JSON响应)';
            apiRequests.push(requestInfo);
            updateApiDisplay();
          });
        
        return response;
      })
      .catch(error => {
        requestInfo.error = error.message;
        apiRequests.push(requestInfo);
        updateApiDisplay();
        throw error;
      });
  };
})();

// 拦截 XMLHttpRequest 请求
(function() {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url) {
    this._requestInfo = {
      type: 'xhr',
      method: method,
      url: url,
      time: new Date().toLocaleString('zh-CN'),
      timestamp: Date.now()
    };
    console.log('🔍 拦截到 XHR 请求:', method, url);
    return originalOpen.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.send = function() {
    const xhr = this;
    
    xhr.addEventListener('load', function() {
      if (xhr._requestInfo) {
        try {
          xhr._requestInfo.status = xhr.status;
          xhr._requestInfo.response = JSON.parse(xhr.responseText);
          console.log('✅ XHR响应数据:', xhr._requestInfo.response);
        } catch (e) {
          xhr._requestInfo.response = xhr.responseText;
        }
        apiRequests.push(xhr._requestInfo);
        updateApiDisplay();
      }
    });
    
    xhr.addEventListener('error', function() {
      if (xhr._requestInfo) {
        xhr._requestInfo.error = 'Request failed';
        apiRequests.push(xhr._requestInfo);
        updateApiDisplay();
      }
    });
    
    return originalSend.apply(this, arguments);
  };
})();

// 更新侧边栏的API显示
function updateApiDisplay() {
  const apiListElement = document.getElementById('api-request-list');
  if (!apiListElement) return;
  
  // 只显示最近的10条记录
  const recentRequests = apiRequests.slice(-10).reverse();
  
  apiListElement.innerHTML = recentRequests.map((req, index) => `
    <div class="api-item" onclick="toggleApiDetail(${apiRequests.length - 1 - index})">
      <div class="api-header">
        <span class="api-method ${req.method}">${req.method}</span>
        <span class="api-status ${req.status >= 200 && req.status < 300 ? 'success' : 'error'}">${req.status || '...'}</span>
      </div>
      <div class="api-url">${truncateUrl(req.url)}</div>
      <div class="api-time">${req.time}</div>
      <div class="api-detail" id="api-detail-${apiRequests.length - 1 - index}" style="display: none;">
        <pre>${JSON.stringify(req.response, null, 2)}</pre>
      </div>
    </div>
  `).join('');
}

// 切换API详情显示
window.toggleApiDetail = function(index) {
  const detailElement = document.getElementById(`api-detail-${index}`);
  if (detailElement) {
    detailElement.style.display = detailElement.style.display === 'none' ? 'block' : 'none';
  }
};

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

