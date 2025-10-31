// 注入到页面上下文的脚本，用于拦截 fetch 和 XHR
(function() {
  // 目标API配置
  const TARGET_URL = 'svc-drcn.developer.huawei.com/codeserver/Common/v1/delegate';
  const TARGET_SVC = 'partnerActivityService/v1/developer/queryDeveloperRewardInfo';
  
  // 检查URL是否匹配目标API
  function isTargetRequest(url, body) {
    // 检查URL
    if (typeof url === 'string' && url.includes(TARGET_URL)) {
      // 如果有body，检查svc参数
      if (body) {
        try {
          const bodyObj = typeof body === 'string' ? JSON.parse(body) : body;
          if (bodyObj.svc === TARGET_SVC) {
            return true;
          }
        } catch (e) {
          // 如果body是字符串，直接检查
          if (typeof body === 'string' && body.includes(TARGET_SVC)) {
            return true;
          }
        }
      } else {
        // 如果没有body但URL匹配，也记录
        return true;
      }
    }
    return false;
  }
  
  // 拦截 fetch 请求
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    const requestBody = options.body;
    
    // 检查是否是目标请求
    if (!isTargetRequest(url, requestBody)) {
      return originalFetch.apply(this, args);
    }
    
    console.log('🎯 [插件] 拦截到目标 Fetch 请求:', url);
    console.log('📤 [插件] 请求参数:', requestBody);
    
    const requestInfo = {
      type: 'fetch',
      url: typeof url === 'string' ? url : url.url || url.toString(),
      method: options.method || 'GET',
      requestBody: requestBody,
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
              console.log('✅ [插件] 获取到目标数据:', requestInfo.response);
            } catch {
              requestInfo.response = text;
            }
            requestInfo.status = response.status;
            
            // 触发自定义事件通知 content script
            window.dispatchEvent(new CustomEvent('apiCaptured', { 
              detail: requestInfo 
            }));
          })
          .catch(() => {
            requestInfo.status = response.status;
            requestInfo.response = '(无法读取响应)';
            window.dispatchEvent(new CustomEvent('apiCaptured', { 
              detail: requestInfo 
            }));
          });
        
        return response;
      })
      .catch(error => {
        requestInfo.error = error.message;
        requestInfo.status = 'error';
        console.error('❌ [插件] 请求失败:', error);
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

