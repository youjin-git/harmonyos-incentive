// 注入到页面上下文的脚本，用于拦截 fetch 和 XHR
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

