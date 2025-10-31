// ========== API 拦截功能 ==========
// 注入脚本到页面上下文中，拦截 fetch 和 XHR
const injectScript = `
  (function() {
    // 存储拦截到的API请求
    window.__apiRequests = window.__apiRequests || [];
    
    // 拦截 fetch 请求
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0];
      const options = args[1] || {};
      
      console.log('🔍 [插件拦截] Fetch 请求:', url);
      
      const requestInfo = {
        type: 'fetch',
        url: typeof url === 'string' ? url : url.url || url.toString(),
        method: options.method || 'GET',
        time: new Date().toLocaleString('zh-CN'),
        timestamp: Date.now()
      };
      
      return originalFetch.apply(this, args)
        .then(response => {
          const clonedResponse = response.clone();
          
          clonedResponse.text()
            .then(text => {
              try {
                requestInfo.response = JSON.parse(text);
              } catch {
                requestInfo.response = text.substring(0, 200);
              }
              requestInfo.status = response.status;
              window.__apiRequests.push(requestInfo);
              console.log('✅ [插件拦截] API响应:', requestInfo);
              
              // 触发自定义事件通知 content script
              window.dispatchEvent(new CustomEvent('apiCaptured', { 
                detail: requestInfo 
              }));
            })
            .catch(() => {
              requestInfo.status = response.status;
              requestInfo.response = '(无法读取响应)';
              window.__apiRequests.push(requestInfo);
              window.dispatchEvent(new CustomEvent('apiCaptured', { 
                detail: requestInfo 
              }));
            });
          
          return response;
        })
        .catch(error => {
          requestInfo.error = error.message;
          requestInfo.status = 'error';
          window.__apiRequests.push(requestInfo);
          window.dispatchEvent(new CustomEvent('apiCaptured', { 
            detail: requestInfo 
          }));
          throw error;
        });
    };
    
    // 拦截 XMLHttpRequest 请求
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
      console.log('🔍 [插件拦截] XHR 请求:', method, url);
      return originalOpen.apply(this, arguments);
    };
    
    XMLHttpRequest.prototype.send = function() {
      const xhr = this;
      
      xhr.addEventListener('load', function() {
        if (xhr._requestInfo) {
          try {
            xhr._requestInfo.status = xhr.status;
            xhr._requestInfo.response = JSON.parse(xhr.responseText);
          } catch (e) {
            xhr._requestInfo.response = xhr.responseText.substring(0, 200);
          }
          window.__apiRequests.push(xhr._requestInfo);
          console.log('✅ [插件拦截] XHR响应:', xhr._requestInfo);
          
          window.dispatchEvent(new CustomEvent('apiCaptured', { 
            detail: xhr._requestInfo 
          }));
        }
      });
      
      xhr.addEventListener('error', function() {
        if (xhr._requestInfo) {
          xhr._requestInfo.error = 'Request failed';
          xhr._requestInfo.status = 'error';
          window.__apiRequests.push(xhr._requestInfo);
          window.dispatchEvent(new CustomEvent('apiCaptured', { 
            detail: xhr._requestInfo 
          }));
        }
      });
      
      return originalSend.apply(this, arguments);
    };
    
    console.log('✅ [插件] API拦截器已注入');
  })();
`;

// 注入脚本到页面
const script = document.createElement('script');
script.textContent = injectScript;
(document.head || document.documentElement).appendChild(script);
script.remove();

// Content Script 中接收拦截的数据
const apiRequests = [];

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
  title.textContent = '🚀 API监控';

  // 创建内容区域
  const content = document.createElement('div');
  content.className = 'sidebar-content';
  
  // 添加API请求列表
  const info = document.createElement('div');
  info.innerHTML = `
    <div class="api-monitor">
      <h3>API请求记录</h3>
      <p style="font-size: 12px; color: #666;">共拦截 <span id="api-count">0</span> 个请求</p>
      <hr>
      <div id="api-request-list" class="api-list">
        <p style="text-align: center; color: #999; padding: 20px;">等待API请求...</p>
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

