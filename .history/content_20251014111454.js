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
        // 计算时间段和激励
        const enrichedApp = enrichAppData(app);
        appsMap.set(app.appId, enrichedApp);
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

// 增强应用数据：计算时间段、截止天数、激励金额
function enrichAppData(app) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // 解析首次上架日期
  const onShelfDate = new Date(app.firstOnShelfDate);
  onShelfDate.setHours(0, 0, 0, 0);
  
  // 上架次日（阶段起始日）
  const startDate = new Date(onShelfDate);
  startDate.setDate(startDate.getDate() + 1);
  
  // 计算三个阶段的时间范围
  const phase1Start = new Date(startDate);
  const phase1End = new Date(startDate);
  phase1End.setDate(phase1End.getDate() + 29); // 第1-30天
  
  const phase2Start = new Date(startDate);
  phase2Start.setDate(phase2Start.getDate() + 30); // 第31天
  const phase2End = new Date(startDate);
  phase2End.setDate(phase2End.getDate() + 59); // 第31-60天
  
  const phase3Start = new Date(startDate);
  phase3Start.setDate(phase3Start.getDate() + 60); // 第61天
  const phase3End = new Date(startDate);
  phase3End.setDate(phase3End.getDate() + 89); // 第61-90天
  
  // 格式化日期
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // 判断当前在哪个阶段，计算截止天数
  let currentPhase = 0;
  let daysUntilDeadline = 0;
  let phaseStatus = '未开始';
  
  if (today < phase1Start) {
    currentPhase = 0;
    phaseStatus = '未开始';
    daysUntilDeadline = Math.ceil((phase1Start - today) / (1000 * 60 * 60 * 24));
  } else if (today <= phase1End) {
    currentPhase = 1;
    phaseStatus = '第一阶段';
    daysUntilDeadline = Math.ceil((phase1End - today) / (1000 * 60 * 60 * 24));
  } else if (today <= phase2End) {
    currentPhase = 2;
    phaseStatus = '第二阶段';
    daysUntilDeadline = Math.ceil((phase2End - today) / (1000 * 60 * 60 * 24));
  } else if (today <= phase3End) {
    currentPhase = 3;
    phaseStatus = '第三阶段';
    daysUntilDeadline = Math.ceil((phase3End - today) / (1000 * 60 * 60 * 24));
  } else {
    currentPhase = 4;
    phaseStatus = '已结束';
    daysUntilDeadline = 0;
  }
  
  // 根据官方激励标准计算激励金额
  const user1 = parseInt(app.firstMonthValidActiveUserNum) || 0;
  const user2 = parseInt(app.secondMonthValidActiveUserNum) || 0;
  const user3 = parseInt(app.thirdMonthValidActiveUserNum) || 0;
  
  const isMature = app.isMatureApp === '是';
  
  let baseReward = 0;      // 基础激励
  let phase1Reward = 0;    // 一阶段激励
  let phase2Reward = 0;    // 二阶段激励
  let totalReward = 0;
  
  // 1. 基础激励：5000元
  if (isMature) {
    // 成熟应用：正式上架即可获得
    baseReward = 5000;
  } else {
    // 新应用：首月有效月活 ≥ 50
    if (user1 >= 50) {
      baseReward = 5000;
    }
  }
  
  // 2. 活跃激励 - 一阶段：3000元
  if (isMature) {
    // 成熟应用：功能和HarmonyOS 4.x版本对齐（暂时假设都对齐）
    // 可以根据实际数据判断
    phase1Reward = 3000;
  } else {
    // 新应用：次月有效月活 ≥ 100
    if (user2 >= 100) {
      phase1Reward = 3000;
    }
  }
  
  // 3. 活跃激励 - 二阶段：2000元
  // 成熟应用/新应用：第三个月有效月活 ≥ 200
  if (user3 >= 200) {
    phase2Reward = 2000;
  }
  
  totalReward = baseReward + phase1Reward + phase2Reward;
  
  // 返回增强后的数据
  return {
    ...app,
    phases: {
      phase1: {
        range: `${formatDate(phase1Start)} ~ ${formatDate(phase1End)}`,
        start: formatDate(phase1Start),
        end: formatDate(phase1End),
        users: user1
      },
      phase2: {
        range: `${formatDate(phase2Start)} ~ ${formatDate(phase2End)}`,
        start: formatDate(phase2Start),
        end: formatDate(phase2End),
        users: user2
      },
      phase3: {
        range: `${formatDate(phase3Start)} ~ ${formatDate(phase3End)}`,
        start: formatDate(phase3Start),
        end: formatDate(phase3End),
        users: user3
      }
    },
    currentPhase,
    phaseStatus,
    daysUntilDeadline,
    totalUsers: user1 + user2 + user3,
    isMature,
    rewards: {
      base: baseReward,
      phase1: phase1Reward,
      phase2: phase2Reward,
      total: totalReward
    },
    estimatedReward: totalReward
  };
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
      apiListElement.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">正在解析数据...</p>';
      return;
    }
  }
  
  // 显示应用列表
  const appsArray = Array.from(appsMap.values());
  
  // 计算总激励和统计
  const totalReward = appsArray.reduce((sum, app) => sum + app.estimatedReward, 0);
  const totalUsers = appsArray.reduce((sum, app) => sum + app.totalUsers, 0);
  
  // 统计各阶段应用数量
  const phaseCount = {
    waiting: appsArray.filter(app => app.currentPhase === 0).length,
    phase1: appsArray.filter(app => app.currentPhase === 1).length,
    phase2: appsArray.filter(app => app.currentPhase === 2).length,
    phase3: appsArray.filter(app => app.currentPhase === 3).length,
    ended: appsArray.filter(app => app.currentPhase === 4).length
  };
  
  // 统计达标情况
  const baseCount = appsArray.filter(app => app.rewards.base > 0).length;
  const phase1Count = appsArray.filter(app => app.rewards.phase1 > 0).length;
  const phase2Count = appsArray.filter(app => app.rewards.phase2 > 0).length;
  
  let html = `
    <div style="margin-bottom: 20px; padding: 16px; background: #fff; border-radius: 10px; border: 1px solid #e0e0e0; box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
      <div style="font-size: 16px; font-weight: bold; margin-bottom: 12px; color: #ff6b35; display: flex; align-items: center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="margin-right: 6px;">
          <rect x="3" y="3" width="7" height="7" rx="1" fill="#ff6b35"/>
          <rect x="14" y="3" width="7" height="7" rx="1" fill="#1976d2"/>
          <rect x="3" y="14" width="7" height="7" rx="1" fill="#388e3c"/>
          <rect x="14" y="14" width="7" height="7" rx="1" fill="#f57c00"/>
        </svg>
        激励计划统计
      </div>
      <div style="font-size: 14px; margin-top: 8px; color: #666;">
        <div style="display: flex; justify-content: space-between; margin: 6px 0;">
          <span>应用总数:</span>
          <span style="font-weight: bold; color: #1976d2;">${appsMap.size} 个</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 6px 0;">
          <span>总活跃用户:</span>
          <span style="font-weight: bold; color: #388e3c;">${totalUsers}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 6px 0; padding-top: 8px; border-top: 1px solid #e0e0e0;">
          <span>累计总激励:</span>
          <span style="font-weight: bold; color: #ff6b35; font-size: 16px;">¥${totalReward}</span>
        </div>
      </div>
      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 13px; color: #666;">
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>基础激励达标:</span>
          <span style="color: #388e3c; font-weight: bold;">${baseCount}/${appsMap.size}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>一阶段达标:</span>
          <span style="color: #1976d2; font-weight: bold;">${phase1Count}/${appsMap.size}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
          <span>二阶段达标:</span>
          <span style="color: #f57c00; font-weight: bold;">${phase2Count}/${appsMap.size}</span>
        </div>
      </div>
      ${window.__cutOffTime ? `<div style="font-size: 12px; margin-top: 10px; opacity: 0.7; text-align: center; color: #999;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 6px;">
          <rect x="3" y="4" width="18" height="18" rx="2" stroke="#999" stroke-width="2" fill="none"/>
          <line x1="3" y1="9" x2="21" y2="9" stroke="#999" stroke-width="2"/>
          <circle cx="8" cy="14" r="1" fill="#999"/>
          <circle cx="12" cy="14" r="1" fill="#999"/>
          <circle cx="16" cy="14" r="1" fill="#999"/>
        </svg>
        截止: ${window.__cutOffTime}
      </div>` : ''}
    </div>
  `;
  
  html += appsArray.map((app, index) => {
    const statusIcon = app.status === '1' 
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#4caf50"/><path d="M8 12l3 3 5-6" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#f44336"/><path d="M8 8l8 8M16 8l-8 8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>';
    
    // 阶段状态样式
    let phaseClass = '';
    let phaseIcon = '';
    switch(app.currentPhase) {
      case 0:
        phaseClass = 'phase-waiting';
        phaseIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10" stroke="#999" stroke-width="2" fill="none"/><path d="M12 6v6l4 4" stroke="#999" stroke-width="2" stroke-linecap="round"/></svg>';
        break;
      case 1:
        phaseClass = 'phase-1';
        phaseIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10" fill="#1976d2"/></svg>';
        break;
      case 2:
        phaseClass = 'phase-2';
        phaseIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10" fill="#388e3c"/></svg>';
        break;
      case 3:
        phaseClass = 'phase-3';
        phaseIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10" fill="#f57c00"/></svg>';
        break;
      case 4:
        phaseClass = 'phase-end';
        phaseIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10" fill="#666"/><path d="M8 12l3 3 5-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        break;
    }
    
    return `
      <div class="app-item" data-app-id="${app.appId}">
        <div class="app-header">
          <span class="app-name">${index + 1}. ${app.appName}</span>
          <span class="app-status">${statusIcon}</span>
        </div>
        
        <div class="phase-status ${phaseClass}">
          ${phaseIcon} ${app.phaseStatus}
          ${app.daysUntilDeadline > 0 ? ` - 还剩 ${app.daysUntilDeadline} 天` : ''}
        </div>
        
        <div class="app-info">
          <div class="app-info-row">
            <span class="label">应用类型:</span>
            <span class="value" style="color: ${app.isMature ? '#1976d2' : '#f57c00'};">
              ${app.isMature 
                ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 3px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#1976d2"/></svg>成熟应用' 
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 3px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#f57c00"/><circle cx="12" cy="9" r="2" fill="white"/></svg>新应用'
              }
            </span>
          </div>
          <div class="app-info-row">
            <span class="label">上架日期:</span>
            <span class="value">${app.firstOnShelfDate}</span>
          </div>
          <div class="app-info-row">
            <span class="label">总活跃用户:</span>
            <span class="value highlight">${app.totalUsers}</span>
          </div>
          <div class="app-info-row">
            <span class="label">已获激励:</span>
            <span class="value reward">¥${app.estimatedReward}</span>
          </div>
        </div>
        
        <div class="app-toggle-hint">点击查看详细信息 ▼</div>
        
        <div class="app-detail" id="app-detail-${app.appId}" style="display: none;">
          <div style="padding: 14px; background: #f9f9f9; border-radius: 8px; margin-top: 10px; border: 1px solid #e0e0e0;">
            <div style="margin-bottom: 14px;">
              <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #1976d2; display: flex; align-items: center;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="margin-right: 8px;">
                  <rect x="3" y="4" width="18" height="18" rx="2" stroke="#1976d2" stroke-width="2" fill="none"/>
                  <line x1="3" y1="9" x2="21" y2="9" stroke="#1976d2" stroke-width="2"/>
                  <circle cx="8" cy="14" r="1.5" fill="#1976d2"/>
                  <circle cx="12" cy="14" r="1.5" fill="#1976d2"/>
                  <circle cx="16" cy="14" r="1.5" fill="#1976d2"/>
                </svg>
                阶段时间表
              </div>
              
              <div style="margin-bottom: 10px; padding: 8px; background: #e3f2fd; border-radius: 6px; border: 1px solid #2196f3;">
                <div style="font-size: 13px; font-weight: bold; margin-bottom: 4px; color: #1976d2;">
                  第一阶段 (1-30天) ${app.currentPhase === 1 ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align: middle;"><circle cx="12" cy="12" r="8" fill="#1976d2"/></svg> 进行中' : ''}
                </div>
                <div style="font-size: 11px; opacity: 0.7; color: #555;">${app.phases.phase1.range}</div>
                <div style="font-size: 12px; margin-top: 4px; color: #333;">活跃用户: ${app.phases.phase1.users}</div>
              </div>
              
              <div style="margin-bottom: 10px; padding: 8px; background: #e8f5e9; border-radius: 6px; border: 1px solid #4caf50;">
                <div style="font-size: 13px; font-weight: bold; margin-bottom: 4px; color: #388e3c;">
                  第二阶段 (31-60天) ${app.currentPhase === 2 ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align: middle;"><circle cx="12" cy="12" r="8" fill="#388e3c"/></svg> 进行中' : ''}
                </div>
                <div style="font-size: 11px; opacity: 0.7; color: #555;">${app.phases.phase2.range}</div>
                <div style="font-size: 12px; margin-top: 4px; color: #333;">活跃用户: ${app.phases.phase2.users}</div>
              </div>
              
              <div style="margin-bottom: 10px; padding: 8px; background: #fff3e0; border-radius: 6px; border: 1px solid #ff9800;">
                <div style="font-size: 13px; font-weight: bold; margin-bottom: 4px; color: #f57c00;">
                  第三阶段 (61-90天) ${app.currentPhase === 3 ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align: middle;"><circle cx="12" cy="12" r="8" fill="#f57c00"/></svg> 进行中' : ''}
                </div>
                <div style="font-size: 11px; opacity: 0.7; color: #555;">${app.phases.phase3.range}</div>
                <div style="font-size: 12px; margin-top: 4px; color: #333;">活跃用户: ${app.phases.phase3.users}</div>
              </div>
            </div>
            
            <div style="margin-bottom: 10px; padding: 10px; background: #fff; border-radius: 6px; border: 1px solid #ff6b35;">
              <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px; color: #ff6b35; display: flex; align-items: center;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="margin-right: 8px;">
                  <circle cx="12" cy="12" r="10" stroke="#ff6b35" stroke-width="2" fill="none"/>
                  <path d="M12 6v6l4 2" stroke="#ff6b35" stroke-width="2" stroke-linecap="round"/>
                  <text x="12" y="14" text-anchor="middle" font-size="10" fill="#ff6b35" font-weight="bold">¥</text>
                </svg>
                激励明细
              </div>
              <div style="font-size: 13px; line-height: 2;">
                <div style="display: flex; justify-content: space-between;">
                  <span>基础激励:</span>
                  <span style="color: ${app.rewards.base > 0 ? '#4caf50' : '#999'}; font-weight: bold;">
                    ${app.rewards.base > 0 
                      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align: middle;"><circle cx="12" cy="12" r="10" fill="#4caf50"/><path d="M8 12l3 3 5-6" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> ¥' + app.rewards.base 
                      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align: middle;"><circle cx="12" cy="12" r="10" fill="#999"/><path d="M8 8l8 8M16 8l-8 8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg> ¥0'}
                  </span>
                </div>
                ${!app.isMature && app.rewards.base === 0 ? `
                  <div style="font-size: 11px; opacity: 0.7; margin-left: 10px; margin-top: 2px; color: #ff9800;">
                    需要：首月活跃 ≥ 50（当前: ${app.phases.phase1.users}）
                  </div>
                ` : ''}
                
                <div style="display: flex; justify-content: space-between;">
                  <span>一阶段激励:</span>
                  <span style="color: ${app.rewards.phase1 > 0 ? '#4caf50' : '#999'}; font-weight: bold;">
                    ${app.rewards.phase1 > 0 
                      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align: middle;"><circle cx="12" cy="12" r="10" fill="#4caf50"/><path d="M8 12l3 3 5-6" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> ¥' + app.rewards.phase1 
                      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align: middle;"><circle cx="12" cy="12" r="10" fill="#999"/><path d="M8 8l8 8M16 8l-8 8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg> ¥0'}
                  </span>
                </div>
                ${!app.isMature && app.rewards.phase1 === 0 ? `
                  <div style="font-size: 11px; opacity: 0.7; margin-left: 10px; margin-top: 2px; color: #ff9800;">
                    需要：次月活跃 ≥ 100（当前: ${app.phases.phase2.users}）
                  </div>
                ` : ''}
                
                <div style="display: flex; justify-content: space-between;">
                  <span>二阶段激励:</span>
                  <span style="color: ${app.rewards.phase2 > 0 ? '#4caf50' : '#999'}; font-weight: bold;">
                    ${app.rewards.phase2 > 0 
                      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align: middle;"><circle cx="12" cy="12" r="10" fill="#4caf50"/><path d="M8 12l3 3 5-6" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> ¥' + app.rewards.phase2 
                      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align: middle;"><circle cx="12" cy="12" r="10" fill="#999"/><path d="M8 8l8 8M16 8l-8 8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg> ¥0'}
                  </span>
                </div>
                ${app.rewards.phase2 === 0 ? `
                  <div style="font-size: 11px; opacity: 0.7; margin-left: 10px; margin-top: 2px; color: #ff9800;">
                    需要：第三月活跃 ≥ 200（当前: ${app.phases.phase3.users}）
                  </div>
                ` : ''}
                
                <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e0e0e0;">
                  <span style="font-weight: bold;">预估总激励:</span>
                  <span style="font-weight: bold; color: #ff6b35; font-size: 15px;">¥${app.estimatedReward}</span>
                </div>
              </div>
            </div>
            
            <div>
              <div style="font-size: 12px; opacity: 0.7; margin-bottom: 6px; color: #666;">AppID:</div>
              <div style="font-size: 11px; word-break: break-all; font-family: monospace; color: #555; line-height: 1.5;">${app.appId}</div>
            </div>
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
  title.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 8px;">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="#ff6b35" stroke="#ff6b35" stroke-width="2" stroke-linejoin="round"/>
    </svg>
    <span>鸿蒙激励计划</span>
  `;

  // 创建内容区域
  const content = document.createElement('div');
  content.className = 'sidebar-content';
  
  // 添加应用列表
  const info = document.createElement('div');
  info.innerHTML = `
    <div class="api-monitor">
      <h3 style="color: #ff6b35; display: flex; align-items: center; font-size: 18px; margin-bottom: 16px;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="margin-right: 8px;">
          <rect x="3" y="3" width="18" height="4" rx="1" fill="#ff6b35"/>
          <rect x="3" y="10" width="18" height="4" rx="1" fill="#ff6b35" opacity="0.7"/>
          <rect x="3" y="17" width="18" height="4" rx="1" fill="#ff6b35" opacity="0.4"/>
        </svg>
        激励计划应用列表
      </h3>
      <div id="api-request-list" class="api-list">
        <p style="text-align: center; color: #999; padding: 20px;">
          等待数据加载...<br>
          <span style="font-size: 11px;">刷新页面或切换分页</span>
        </p>
      </div>
    </div>
  `;
  
  content.appendChild(info);
  

  // 创建关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'sidebar-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = function() {
    sidebar.style.right = '-480px';
  };

  // 创建打开按钮（当侧边栏关闭时显示）
  const openBtn = document.createElement('button');
  openBtn.className = 'sidebar-open';
  openBtn.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="4" rx="1" fill="white"/>
      <rect x="3" y="10" width="18" height="4" rx="1" fill="white" opacity="0.8"/>
      <rect x="3" y="17" width="18" height="4" rx="1" fill="white" opacity="0.6"/>
    </svg>
  `;
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

