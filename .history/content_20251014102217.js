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

// 解析响应数据，提取应用列表
function extractAppsFromResponse(response) {
  try {
    if (!response || !response.resJson) return;
    
    // 第一层解析：resJson 是字符串
    const resJsonObj = JSON.parse(response.resJson);
    if (!resJsonObj.result || !resJsonObj.result.resultString) return;
    
    // 第二层解析：resultString 也是字符串
    const resultArray = JSON.parse(resJsonObj.result.resultString);
    if (!Array.isArray(resultArray) || resultArray.length === 0) return;
    
    const firstResult = resultArray[0];
    if (!firstResult.list || !Array.isArray(firstResult.list)) return;
    
    // 提取应用列表并根据appId去重
    firstResult.list.forEach(app => {
      if (app.appId) {
        appsMap.set(app.appId, app);
      }
    });
    
    // 提取截止时间
    if (firstResult.cutOffTime) {
      window.__cutOffTime = firstResult.cutOffTime;
    }
    
    console.log(`✅ [插件] 已提取 ${appsMap.size} 个应用（去重后）`);
  } catch (error) {
    console.error('❌ [插件] 解析应用数据失败:', error);
  }
}

// 更新侧边栏的API显示
function updateApiDisplay() {
  const apiListElement = document.getElementById('api-request-list');
  if (!apiListElement) return;
  
  // 如果没有应用数据，显示等待状态
  if (appsMap.size === 0) {
    if (apiRequests.length === 0) {
      return;
    } else {
      apiListElement.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 20px;">正在解析数据...</p>';
      return;
    }
  }
  
  // 显示应用列表
  const appsArray = Array.from(appsMap.values());
  
  let html = `
    <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 6px;">
      <div style="font-size: 13px; font-weight: bold;">📊 数据统计</div>
      <div style="font-size: 12px; margin-top: 5px;">应用总数: ${appsMap.size}</div>
      ${window.__cutOffTime ? `<div style="font-size: 11px; margin-top: 3px; opacity: 0.8;">截止时间: ${window.__cutOffTime}</div>` : ''}
    </div>
  `;
  
  html += appsArray.map((app, index) => {
    const statusIcon = app.status === '1' ? '✅' : '❌';
    const statusText = app.status === '1' ? '正常' : '异常';
    
    return `
      <div class="app-item" data-app-id="${app.appId}">
        <div class="app-header">
          <span class="app-name">${index + 1}. ${app.appName}</span>
          <span class="app-status">${statusIcon}</span>
        </div>
        <div class="app-info">
          <div class="app-info-row">
            <span class="label">类型:</span>
            <span class="value">${app.appType}</span>
          </div>
          <div class="app-info-row">
            <span class="label">首次上架:</span>
            <span class="value">${app.firstOnShelfDate}</span>
          </div>
          <div class="app-info-row">
            <span class="label">成熟应用:</span>
            <span class="value">${app.isMatureApp}</span>
          </div>
          <div class="app-info-row">
            <span class="label">第1月活跃用户:</span>
            <span class="value highlight">${app.firstMonthValidActiveUserNum}</span>
          </div>
          <div class="app-info-row">
            <span class="label">第2月活跃用户:</span>
            <span class="value highlight">${app.secondMonthValidActiveUserNum}</span>
          </div>
          <div class="app-info-row">
            <span class="label">第3月活跃用户:</span>
            <span class="value highlight">${app.thirdMonthValidActiveUserNum}</span>
          </div>
        </div>
        <div class="app-toggle-hint">点击查看AppID ▼</div>
        <div class="app-detail" id="app-detail-${app.appId}" style="display: none;">
          <div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px; margin-top: 8px;">
            <div style="font-size: 11px; opacity: 0.7; margin-bottom: 5px;">AppID:</div>
            <div style="font-size: 11px; word-break: break-all; font-family: monospace;">${app.appId}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  apiListElement.innerHTML = html;
  
  // 重新绑定点击事件
  attachAppClickEvents();
}

// 为应用项绑定点击事件
function attachAppClickEvents() {
  const appItems = document.querySelectorAll('.app-item');
  appItems.forEach(item => {
    // 移除旧的事件监听器（如果有）
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);
    
    // 添加新的事件监听器
    newItem.addEventListener('click', function() {
      const appId = this.getAttribute('data-app-id');
      const detailElement = document.getElementById(`app-detail-${appId}`);
      if (detailElement) {
        const isHidden = detailElement.style.display === 'none';
        detailElement.style.display = isHidden ? 'block' : 'none';
        
        // 更新提示文字
        const hintElement = this.querySelector('.app-toggle-hint');
        if (hintElement) {
          hintElement.textContent = isHidden ? '点击收起 ▲' : '点击查看AppID ▼';
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
  
  // 添加应用列表
  const info = document.createElement('div');
  info.innerHTML = `
    <div class="api-monitor">
      <h3>🎯 激励计划应用列表</h3>
      <p style="font-size: 12px; color: rgba(255,255,255,0.8);">
        已加载 <span id="api-count" style="color: #ffd700; font-weight: bold;">0</span> 个应用
      </p>
      <p style="font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 5px;">
        支持分页自动合并，根据AppID去重
      </p>
      <hr>
      <div id="api-request-list" class="api-list">
        <p style="text-align: center; color: rgba(255,255,255,0.6); padding: 20px;">
          等待数据加载...<br>
          <span style="font-size: 11px;">刷新页面或切换分页</span>
        </p>
      </div>
    </div>
  `;
  
  content.appendChild(info);
  
  // 更新应用计数
  setInterval(() => {
    const countElement = document.getElementById('api-count');
    if (countElement) {
      countElement.textContent = appsMap.size;
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

