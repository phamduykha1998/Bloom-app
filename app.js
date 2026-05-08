/* ============================================
   BLOOM — S&M Tracker
   app.js — main application logic
   Sections:
   1. State & storage
   2. Helpers (date, format)
   3. Smart Insights engine (Health, Forecast, Alerts)
   4. Splash & navigation
   5. Activity CRUD
   6. Day / Week / Month / Dashboard render
   7. Events
   8. Kanban
   ============================================ */

'use strict';

/* ============================================
   1. STATE & STORAGE
   ============================================ */

var STATE = {
  entries: [],   // {id, date, type:'s'|'m', name, result, note}
  events: [],    // {id, name, date, organizer, location, status, cost, type, note}
  goals: {},     // {YYYY-MM: {sale: n, mkt: n, total: n}}
  todos: {},     // {YYYY-MM-DD or wk_X or mo_X: [{id, text, done, ts}]}
};

var SAVE_KEY = 'bloom_v2_data';
var saveTimer = null;
var saveDirty = false;

function loadData(){
  try{
    var raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    var d = JSON.parse(raw);
    STATE.entries = d.entries || [];
    STATE.events = d.events || [];
    STATE.goals = d.goals || {};
    STATE.todos = d.todos || {};
    return true;
  }catch(e){
    console.warn('Load err',e);
    return false;
  }
}

function saveData(){
  try{
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      entries: STATE.entries,
      events: STATE.events,
      goals: STATE.goals,
      todos: STATE.todos,
      ts: new Date().toISOString()
    }));
    saveDirty = false;
    setSavedDot(true);
    return true;
  }catch(e){
    console.error('Save err',e);
    return false;
  }
}

function markDirty(){
  saveDirty = true;
  setSavedDot(false);
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveData, 800);
}

function setSavedDot(saved){
  var dot = document.getElementById('sdot');
  var lbl = document.getElementById('slb');
  var lblSide = document.getElementById('slb-side');
  if(saved){
    if(dot) dot.style.background = 'var(--ok)';
    if(lbl) lbl.textContent = 'Saved';
    if(lblSide) lblSide.textContent = 'Đã lưu';
  } else {
    if(dot) dot.style.background = 'var(--wn)';
    if(lbl) lbl.textContent = 'Saving...';
    if(lblSide) lblSide.textContent = 'Đang lưu...';
  }
}

function saveNow(){ saveData(); toast('Đã lưu ✓'); }

function uid(){ return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }

/* ============================================
   2. HELPERS
   ============================================ */

var VND = ['CN','T2','T3','T4','T5','T6','T7'];
var VNDF = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
var VNM = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

function pad(n){ return n<10?'0'+n:''+n; }
function ds(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function fmtD(s){ var p=s.split('-'); return p[2]+'/'+p[1]; }
function fmtDLong(s){ var p=s.split('-'); var d=new Date(p[0],p[1]-1,p[2]); return VNDF[d.getDay()]+', '+p[2]+'/'+p[1]+'/'+p[0]; }

function parseD(s){ var p=s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }

function wkStart(d){
  var x = new Date(d);
  var day = x.getDay();
  var diff = day === 0 ? -6 : 1 - day; // Monday-start week
  x.setDate(x.getDate() + diff);
  x.setHours(0,0,0,0);
  return x;
}

function wkDates(weekOffset){
  var s = wkStart(new Date());
  s.setDate(s.getDate() + weekOffset*7);
  var arr = [];
  for(var i=0;i<7;i++){
    var d = new Date(s);
    d.setDate(s.getDate()+i);
    arr.push(d);
  }
  return arr;
}

function moRange(monthOffset){
  var n = new Date();
  var y = n.getFullYear(), m = n.getMonth()+monthOffset;
  while(m<0){m+=12;y--;}
  while(m>11){m-=12;y++;}
  var first = new Date(y,m,1);
  var last = new Date(y,m+1,0);
  return {y:y, m:m, first:first, last:last, key:y+'-'+pad(m+1)};
}

function entFor(dateStr){
  return STATE.entries.filter(function(e){return entryOnDate(e, dateStr);});
}

function entWk(weekOffset){
  var ds_ = wkDates(weekOffset).map(ds);
  return STATE.entries.filter(function(e){
    return ds_.some(function(d){return entryOnDate(e, d);});
  });
}

function entMo(monthOffset){
  var r = moRange(monthOffset);
  var firstStr = ds(r.first);
  var lastStr = ds(r.last);
  return STATE.entries.filter(function(e){
    var s = e.dateStart || e.date;
    var en = e.dateEnd || s;
    if(!s) return false;
    // overlap if range [s,en] intersects [firstStr,lastStr]
    return !(en < firstStr || s > lastStr);
  });
}

function countByType(ents){
  var s=0,m=0,e=0;
  ents.forEach(function(en){
    if(en.type==='s') s++;
    else if(en.type==='m') m++;
    else if(en.type==='e') e++;
  });
  return {s:s,m:m,e:e,total:s+m+e};
}

function countByResult(ents){
  var c = {done:0,ongoing:0,success:0,fail:0,none:0};
  ents.forEach(function(e){
    if(e.result && c[e.result]!==undefined) c[e.result]++;
    else c.none++;
  });
  return c;
}

var RES_MAP = {
  done:'Hoàn thành',
  ongoing:'Đang làm',
  success:'Thành công',
  fail:'Không đạt'
};
var RES_CLS = {
  done:'tdn',
  ongoing:'twt',
  success:'tac',
  fail:'tna'
};

function toast(msg){
  var t = document.getElementById('toast');
  var m = document.getElementById('toastMsg');
  if(!t) return;
  m.textContent = msg;
  t.classList.add('on');
  setTimeout(function(){t.classList.remove('on');}, 2200);
}

function icn(name, cls){
  return '<svg class="icn '+(cls||'')+'"><use href="#i-'+name+'"/></svg>';
}

/**
 * Format number with VN-style thousand separator (dots): 100000 → "100.000"
 */
function fmtMoney(n){
  if(!n && n!==0) return '';
  n = parseInt(n, 10);
  if(isNaN(n)) return '';
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Parse currency string back to number: "100.000" → 100000
 */
function parseMoney(s){
  if(!s) return 0;
  return parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0;
}

/**
 * Live-format currency input as user types
 */
function formatCurrency(input){
  var caretPos = input.selectionStart;
  var oldLen = input.value.length;
  var n = parseMoney(input.value);
  input.value = n > 0 ? fmtMoney(n) : '';
  var newLen = input.value.length;
  var newPos = caretPos + (newLen - oldLen);
  if(newPos < 0) newPos = 0;
  try{ input.setSelectionRange(newPos, newPos); }catch(e){}
}

/**
 * Get all dates between dateStart and dateEnd (inclusive) as YYYY-MM-DD strings
 */
function dateRange(start, end){
  if(!start) return [];
  if(!end || end === start) return [start];
  var s = parseD(start), e = parseD(end);
  if(e < s) return [start];
  var arr = [];
  var cur = new Date(s);
  while(cur <= e){
    arr.push(ds(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return arr;
}

/**
 * Check if entry occurs on a given date (handles range)
 */
function entryOnDate(entry, dateStr){
  var start = entry.dateStart || entry.date;
  var end = entry.dateEnd || start;
  if(!start) return false;
  return dateStr >= start && dateStr <= end;
}

/* ============================================
   3. SMART INSIGHTS ENGINE
   Connects user input → meaningful signals
   ============================================ */

/**
 * Compute a 0-100 health score for a period
 * Considers:
 * - Activity volume (40 pts) — Are you doing enough?
 * - Sale/Mkt balance (25 pts) — Is it lopsided?
 * - Result quality (25 pts) — Are activities yielding success?
 * - Consistency (10 pts) — Showing up regularly?
 */
function computeHealth(ents, opts){
  opts = opts || {};
  var period = opts.period || 'day'; // day, week, month
  var dayCount = opts.dayCount || 1;

  if(!ents.length){
    return {
      score: 0,
      status: 'warn',
      label: 'Chưa có hoạt động',
      breakdown: {volume:0, balance:0, quality:0, consistency:0},
      msg: 'Hãy bắt đầu bằng cách thêm hoạt động đầu tiên!'
    };
  }

  var c = countByType(ents);
  var r = countByResult(ents);

  // Target volumes per period (tunable)
  var targetPerDay = 3;
  var targetVolume = targetPerDay * dayCount;

  // 1. VOLUME (40 pts)
  var volRatio = Math.min(c.total / targetVolume, 1);
  var volPts = Math.round(volRatio * 40);

  // 2. BALANCE (25 pts) — best when sale & mkt are both present
  var balPts = 0;
  if(c.total > 0){
    var ratio = c.total < 2 ? 0.5 : Math.min(c.s, c.m) / Math.max(c.s, c.m, 1);
    // ratio 0 means lopsided, 1 means balanced
    if(c.s === 0 || c.m === 0){
      balPts = 8; // single-channel still some value
    } else {
      balPts = Math.round(ratio * 25);
    }
  }

  // 3. QUALITY (25 pts) — based on positive vs negative results
  var positives = r.done + r.success;
  var negatives = r.fail;
  var withResult = positives + negatives + r.ongoing;
  var qualPts = 0;
  if(withResult > 0){
    var qRatio = (positives + r.ongoing*0.5) / withResult;
    qualPts = Math.round(qRatio * 25);
  } else {
    qualPts = 12; // neutral if no results recorded
  }

  // 4. CONSISTENCY (10 pts) — only meaningful for week/month
  var consPts = 10;
  if(period !== 'day' && dayCount > 1){
    var dayMap = {};
    ents.forEach(function(e){ dayMap[e.date] = true; });
    var activeDays = Object.keys(dayMap).length;
    consPts = Math.round((activeDays / dayCount) * 10);
  }

  var score = volPts + balPts + qualPts + consPts;
  score = Math.max(0, Math.min(100, score));

  var status, label, msg;
  if(score >= 80){
    status = 'excellent'; label = 'Xuất sắc';
    msg = 'Đang đi rất tốt — duy trì nhịp này nhé.';
  } else if(score >= 60){
    status = 'good'; label = 'Ổn';
    msg = 'Đang trên đà. Tăng nhẹ một chút sẽ tới mức xuất sắc.';
  } else if(score >= 40){
    status = 'fair'; label = 'Cần đẩy';
    msg = 'Cần tăng hoạt động hoặc cân bằng lại Sale/Marketing.';
  } else {
    status = 'warn'; label = 'Báo động';
    msg = 'Hoạt động đang quá thấp — cần action ngay hôm nay.';
  }

  return {
    score: score,
    status: status,
    label: label,
    breakdown: {volume:volPts, balance:balPts, quality:qualPts, consistency:consPts, max:{volume:40,balance:25,quality:25,consistency:10}},
    counts: c,
    results: r,
    msg: msg
  };
}

/**
 * Forecast: project end-of-month based on current pace
 */
function computeForecast(){
  var now = new Date();
  var r = moRange(0);
  var moEnts = entMo(0);
  var dayOfMonth = now.getDate();
  var totalDaysInMonth = r.last.getDate();
  var daysRemaining = totalDaysInMonth - dayOfMonth + 1;

  var c = countByType(moEnts);
  var avgPerDay = dayOfMonth > 0 ? c.total / dayOfMonth : 0;
  var projected = c.total + Math.round(avgPerDay * (daysRemaining - 1));

  var goal = STATE.goals[r.key] || {};
  var goalTotal = goal.total || 0;

  var status = 'on-track';
  var statusMsg = '';
  if(goalTotal > 0){
    var projectedPct = projected / goalTotal;
    if(projectedPct >= 1){
      status = 'on-track';
      statusMsg = 'Theo nhịp hiện tại sẽ đạt mục tiêu.';
    } else if(projectedPct >= 0.85){
      status = 'close';
      statusMsg = 'Sát mục tiêu — cần đẩy thêm '+ (goalTotal - projected) +' hoạt động.';
    } else {
      status = 'off-track';
      statusMsg = 'Khả năng không đạt — cần thêm '+ (goalTotal - projected) +' hoạt động.';
    }
  }

  // Sale/Mkt projection
  var avgSPerDay = dayOfMonth > 0 ? c.s / dayOfMonth : 0;
  var avgMPerDay = dayOfMonth > 0 ? c.m / dayOfMonth : 0;
  var projS = c.s + Math.round(avgSPerDay * (daysRemaining - 1));
  var projM = c.m + Math.round(avgMPerDay * (daysRemaining - 1));

  return {
    current: c.total,
    currentS: c.s,
    currentM: c.m,
    projected: projected,
    projectedS: projS,
    projectedM: projM,
    avgPerDay: avgPerDay.toFixed(1),
    dayOfMonth: dayOfMonth,
    totalDays: totalDaysInMonth,
    daysRemaining: daysRemaining - 1,
    goal: goalTotal,
    status: status,
    statusMsg: statusMsg
  };
}

/**
 * Generate alert messages based on current data
 * Returns array of {level: 'warn'|'danger'|'info'|'success', title, body}
 */
function generateAlerts(opts){
  opts = opts || {};
  var alerts = [];
  var now = new Date();
  var todayStr = ds(now);

  // 1. No activity today
  var todayEnts = entFor(todayStr);
  if(todayEnts.length === 0){
    var hour = now.getHours();
    if(hour >= 11){
      alerts.push({
        level: 'warn',
        title: 'Chưa có hoạt động hôm nay',
        body: 'Đã ' + hour + 'h rồi — thêm ít nhất 1 việc để giữ momentum nhé.'
      });
    }
  }

  // 2. Heavy imbalance over recent week
  var weekEnts = entWk(0);
  var wc = countByType(weekEnts);
  if(wc.total >= 5){
    if(wc.s === 0){
      alerts.push({
        level: 'warn',
        title: 'Bỏ quên Sales tuần này',
        body: 'Đã '+wc.m+' marketing nhưng 0 sale. Cần action ngay với khách hàng.'
      });
    } else if(wc.m === 0){
      alerts.push({
        level: 'warn',
        title: 'Bỏ quên Marketing tuần này',
        body: 'Đã '+wc.s+' sale nhưng 0 marketing. Funnel sẽ cạn nếu không build mới.'
      });
    } else {
      var ratio = Math.min(wc.s,wc.m) / Math.max(wc.s,wc.m);
      if(ratio < 0.25){
        var weak = wc.s < wc.m ? 'Sales' : 'Marketing';
        alerts.push({
          level: 'info',
          title: weak + ' đang yếu hơn nhiều',
          body: 'Tỉ lệ '+wc.s+':'+wc.m+' (Sale:Mkt). Cân bằng lại sẽ tốt hơn.'
        });
      }
    }
  }

  // 3. High fail rate
  var weekRes = countByResult(weekEnts);
  var totalRated = weekRes.done + weekRes.success + weekRes.fail;
  if(totalRated >= 5){
    var failRate = weekRes.fail / totalRated;
    if(failRate >= 0.5){
      alerts.push({
        level: 'danger',
        title: 'Tỉ lệ "Không đạt" cao',
        body: weekRes.fail+'/'+totalRated+' hoạt động không đạt. Xem lại approach hoặc target.'
      });
    } else if(weekRes.success >= 3 && failRate < 0.2){
      alerts.push({
        level: 'success',
        title: 'Đang có streak tốt',
        body: weekRes.success+' thành công tuần này — đang trong vùng năng suất cao.'
      });
    }
  }

  // 4. Forecast warning
  var fc = computeForecast();
  if(fc.goal > 0 && fc.status === 'off-track' && fc.dayOfMonth >= 7){
    alerts.push({
      level: 'danger',
      title: 'Có khả năng không đạt mục tiêu tháng',
      body: 'Đang '+fc.current+'/'+fc.goal+', dự kiến cuối tháng: '+fc.projected+'. '+fc.statusMsg
    });
  } else if(fc.goal > 0 && fc.status === 'on-track' && fc.dayOfMonth >= 7){
    alerts.push({
      level: 'success',
      title: 'Đang on-track',
      body: 'Theo pace hiện tại, dự kiến đạt '+fc.projected+'/'+fc.goal+' cuối tháng.'
    });
  }

  // 5. Inactivity streak (3+ days no activity)
  var inactiveDays = 0;
  for(var i=0;i<7;i++){
    var d = new Date(now);
    d.setDate(now.getDate() - i);
    var dStr = ds(d);
    if(entFor(dStr).length === 0){
      inactiveDays++;
    } else {
      break; // streak broken
    }
  }
  if(inactiveDays >= 3){
    alerts.push({
      level: 'danger',
      title: 'Đã '+inactiveDays+' ngày không có hoạt động',
      body: 'Momentum đang mất. Bắt đầu lại với 1 việc nhỏ hôm nay.'
    });
  }

  // 6. Pending events soon
  var soonEvents = STATE.events.filter(function(e){
    if(e.status === 'Cancelled' || e.status === 'Attended') return false;
    if(!e.date) return false;
    var ed = parseD(e.date);
    var diff = Math.ceil((ed - now) / (1000*60*60*24));
    return diff >= 0 && diff <= 3;
  });
  if(soonEvents.length > 0){
    alerts.push({
      level: 'info',
      title: soonEvents.length + ' event sắp diễn ra (≤3 ngày)',
      body: soonEvents.slice(0,2).map(function(e){return e.name;}).join(', ') + (soonEvents.length>2?'...':'')
    });
  }

  return alerts;
}

/**
 * Helper: render circular progress for health score
 */
function renderHealthCircle(score, status){
  var colorMap = {
    excellent: 'var(--ok)',
    good: 'var(--info)',
    fair: 'var(--wn)',
    warn: 'var(--dg)'
  };
  var color = colorMap[status] || 'var(--mu)';
  var radius = 36;
  var circ = 2 * Math.PI * radius;
  var offset = circ - (score/100) * circ;
  return ''+
    '<svg viewBox="0 0 100 100">'+
      '<circle class="hs-track" cx="50" cy="50" r="'+radius+'"/>'+
      '<circle class="hs-prog" cx="50" cy="50" r="'+radius+'" '+
        'stroke="'+color+'" '+
        'stroke-dasharray="'+circ.toFixed(2)+'" '+
        'stroke-dashoffset="'+offset.toFixed(2)+'"/>'+
    '</svg>'+
    '<div class="hs-num">'+
      '<div class="hs-num-v">'+score+'</div>'+
      '<div class="hs-num-l">/ 100</div>'+
    '</div>';
}

function renderHealthCard(health, title, sub){
  if(!health || !health.counts){
    return '<div class="hs-card">'+
      '<div class="hs-head">'+
        '<div class="hs-icn-wrap">'+icn('shield')+'</div>'+
        '<div><div class="hs-title">'+(title||'Health Score')+'</div>'+
        '<div class="hs-sub">'+(sub||'')+'</div></div>'+
      '</div>'+
      '<div class="hs-body">'+
        '<div class="hs-circle">'+renderHealthCircle(0,'warn')+'</div>'+
        '<div class="hs-detail">'+
          '<span class="hs-status warn">Chưa có data</span>'+
          '<div class="hs-msg">Hãy thêm hoạt động đầu tiên để bắt đầu tracking.</div>'+
        '</div>'+
      '</div>'+
    '</div>';
  }
  return '<div class="hs-card">'+
    '<div class="hs-head">'+
      '<div class="hs-icn-wrap">'+icn('shield')+'</div>'+
      '<div><div class="hs-title">'+(title||'Health Score')+'</div>'+
      '<div class="hs-sub">'+(sub||'Tổng hợp từ volume, cân bằng, kết quả & nhịp')+'</div></div>'+
    '</div>'+
    '<div class="hs-body">'+
      '<div class="hs-circle">'+renderHealthCircle(health.score, health.status)+'</div>'+
      '<div class="hs-detail">'+
        '<span class="hs-status '+health.status+'">'+icn('pulse','icn-sm')+health.label+'</span>'+
        '<div class="hs-msg">'+health.msg+'</div>'+
      '</div>'+
    '</div>'+
  '</div>';
}

function renderForecastCard(fc){
  var statusColor = fc.status === 'on-track' ? 'var(--ok)' :
                    fc.status === 'close' ? 'var(--wn)' : 'var(--dg)';
  return '<div class="fc-card">'+
    '<div class="fc-head">'+
      '<div class="fc-icn-wrap">'+icn('trend-up')+'</div>'+
      '<div><div class="fc-title">Dự báo cuối tháng</div>'+
      '<div class="fc-sub">'+(fc.daysRemaining)+' ngày còn lại · pace '+fc.avgPerDay+'/ngày</div></div>'+
    '</div>'+
    '<div class="fc-grid">'+
      '<div class="fc-cell">'+
        '<div class="fc-cell-l">Hiện tại</div>'+
        '<div class="fc-cell-v">'+fc.current+'</div>'+
        '<div class="fc-cell-s">ngày '+fc.dayOfMonth+'/'+fc.totalDays+'</div>'+
      '</div>'+
      '<div class="fc-cell now">'+
        '<div class="fc-cell-l">Dự kiến</div>'+
        '<div class="fc-cell-v">'+fc.projected+'</div>'+
        '<div class="fc-cell-s">cuối tháng</div>'+
      '</div>'+
      '<div class="fc-cell">'+
        '<div class="fc-cell-l">Mục tiêu</div>'+
        '<div class="fc-cell-v" style="color:'+(fc.goal>0?statusColor:'var(--mu)')+'">'+(fc.goal||'—')+'</div>'+
        '<div class="fc-cell-s">'+(fc.goal>0?(fc.status==='on-track'?'On track ✓':fc.status==='close'?'Sát':'Off-track'):'Chưa đặt')+'</div>'+
      '</div>'+
    '</div>'+
    (fc.statusMsg ? '<div class="alert '+(fc.status==='on-track'?'success':fc.status==='close'?'warn':'danger')+'" style="margin-top:12px;margin-bottom:0">'+
      icn(fc.status==='on-track'?'check':'alert-tri')+
      '<div><div class="alert-title">'+(fc.status==='on-track'?'Tốt!':'Cần chú ý')+'</div>'+
      '<div class="alert-body">'+fc.statusMsg+'</div></div>'+
    '</div>' : '')+
  '</div>';
}

function renderAlerts(alerts){
  if(!alerts || !alerts.length) return '';
  var levelIcon = {
    warn:'alert-tri', danger:'alert-tri',
    success:'check', info:'info'
  };
  var html = '<div class="sec">'+icn('zap','icn-sm')+'Cảnh báo & gợi ý</div><div class="alerts">';
  alerts.forEach(function(a){
    html += '<div class="alert '+a.level+'">'+
      icn(levelIcon[a.level]||'info')+
      '<div><div class="alert-title">'+a.title+'</div>'+
      '<div class="alert-body">'+a.body+'</div></div>'+
    '</div>';
  });
  html += '</div>';
  return html;
}


/* ============================================
   4. SPLASH & NAVIGATION
   ============================================ */

function splashInit(){
  var sp = document.getElementById('splash');
  var info = document.getElementById('sp-info');
  var bar = document.querySelector('.sp-b');

  // Check for existing data
  var has = loadData();
  var bw = document.querySelector('.sp-bw');
  var status = document.getElementById('sp-status');

  if(has){
    var n = STATE.entries.length;
    var ne = STATE.events.length;
    info.innerHTML = '✨ Tìm thấy <strong>'+n+'</strong> hoạt động và <strong>'+ne+'</strong> events đã lưu.';
    if(bar) setTimeout(function(){bar.style.width='100%';}, 200);
  } else {
    info.innerHTML = 'Chưa có dữ liệu. Bấm <strong>Tiếp tục</strong> để bắt đầu hoặc khôi phục từ file backup.';
    if(bar) setTimeout(function(){bar.style.width='30%';}, 200);
  }
}

function splashContinue(){
  var sp = document.getElementById('splash');
  sp.classList.add('hide');
  setTimeout(function(){
    sp.style.display = 'none';
    initApp();
  }, 500);
}

function splashRestore(ev){
  var f = ev.target.files[0];
  if(!f) return;
  var fr = new FileReader();
  fr.onload = function(e){
    try{
      var d = JSON.parse(e.target.result);
      STATE.entries = d.entries || [];
      STATE.events = d.events || [];
      STATE.goals = d.goals || {};
      STATE.todos = d.todos || {};
      saveData();
      document.getElementById('sp-status').textContent = '✓ Đã khôi phục '+STATE.entries.length+' hoạt động';
      setTimeout(splashContinue, 700);
    }catch(err){
      document.getElementById('sp-status').textContent = '✗ File không hợp lệ';
    }
  };
  fr.readAsText(f);
}

function splashClear(){
  if(!confirm('Xoá toàn bộ data và bắt đầu mới?')) return;
  STATE.entries = [];
  STATE.events = [];
  STATE.goals = {};
  STATE.todos = {};
  localStorage.removeItem(SAVE_KEY);
  splashContinue();
}

/* ============================================
   PAGE NAVIGATION
   ============================================ */

var currentPage = 'day';
var dayOffset = 0;
var weekOffset = 0;
var monthOffset = 0;

function goPage(name, btn, isSidebar){
  // Hide all pages
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('on');});
  var target = document.getElementById('page-'+name);
  if(target) target.classList.add('on');

  // Update mobile nav
  document.querySelectorAll('.nb').forEach(function(b){b.classList.remove('on');});
  // Update sidebar nav
  document.querySelectorAll('.sb-link').forEach(function(b){b.classList.remove('on');});

  // Set active on both nav systems
  var navIdx = {day:0,week:1,month:2,kanban:3,dashboard:4}[name];
  if(navIdx !== undefined){
    var nb = document.getElementById('nb'+navIdx);
    if(nb) nb.classList.add('on');
  }
  if(btn) btn.classList.add('on');

  // Match sidebar button if not clicked from there
  if(!isSidebar){
    var sbLinks = document.querySelectorAll('.sb-link');
    sbLinks.forEach(function(l){
      var onclickAttr = l.getAttribute('onclick') || '';
      if(onclickAttr.indexOf("'"+name+"'") >= 0) l.classList.add('on');
    });
  }

  currentPage = name;
  renderPage(name);
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderPage(name){
  if(name==='day') renderDay();
  else if(name==='week') renderWeek();
  else if(name==='month') renderMonth();
  else if(name==='kanban') renderKanban();
  else if(name==='dashboard') renderDashboard();
}

function initApp(){
  renderDay();
  // Setup PWA
  if('serviceWorker' in navigator){
    // Optional: register service worker for offline (would need separate sw.js file)
  }
}

/* ============================================
   5. ACTIVITY CRUD (unified Sale/Mkt/Event)
   ============================================ */

var modalState = {type:null, result:null, editId:null};

function openModal(editId){
  modalState = {type:null, result:null, editId:editId||null};

  // Reset form
  document.getElementById('iName').value = '';
  document.getElementById('iNote').value = '';
  document.getElementById('iOrg').value = '';
  document.getElementById('iLoc').value = '';
  document.getElementById('iCost').value = '';
  document.getElementById('iStatus').value = 'Planned';
  document.querySelectorAll('#mbg .to').forEach(function(b){b.classList.remove('ts','tm','on');});
  document.querySelectorAll('#mbg .ro').forEach(function(b){b.classList.remove('on');});

  // Default dates: today + dayOffset (or entry's date when editing)
  var d = new Date();
  d.setDate(d.getDate() + dayOffset);
  var defaultDate = ds(d);
  document.getElementById('iDateStart').value = defaultDate;
  document.getElementById('iDateEnd').value = defaultDate;

  document.getElementById('mTitle').innerHTML = icn('plus') + (editId ? ' Sửa hoạt động' : ' Thêm hoạt động');
  document.getElementById('delBtn').style.display = editId ? 'flex' : 'none';

  // If editing, populate
  if(editId){
    var entry = STATE.entries.find(function(e){return e.id === editId;});
    if(entry){
      modalState.type = entry.type;
      modalState.result = entry.result;
      document.getElementById('iName').value = entry.name || '';
      document.getElementById('iNote').value = entry.note || '';
      document.getElementById('iDateStart').value = entry.dateStart || entry.date || defaultDate;
      document.getElementById('iDateEnd').value = entry.dateEnd || entry.dateStart || entry.date || defaultDate;
      document.getElementById('iOrg').value = entry.organizer || '';
      document.getElementById('iLoc').value = entry.location || '';
      document.getElementById('iCost').value = entry.cost ? fmtMoney(entry.cost) : '';
      document.getElementById('iStatus').value = entry.status || 'Planned';
      // Activate type button
      if(entry.type === 's') selT('s');
      else if(entry.type === 'm') selT('m');
      else if(entry.type === 'e') selT('e');
      // Activate result
      if(entry.result){
        document.querySelectorAll('#mbg .ro').forEach(function(b){
          if(b.getAttribute('data-r') === entry.result) b.classList.add('on');
        });
      }
    }
  }

  toggleEventFields(modalState.type === 'e');
  renderSuggW();
  document.getElementById('mbg').classList.add('on');
}

function closeModal(){
  document.getElementById('mbg').classList.remove('on');
}

function bgClk(e){ if(e.target.id==='mbg') closeModal(); }

function selT(t){
  modalState.type = t;
  document.getElementById('toS').classList.toggle('ts', t==='s');
  document.getElementById('toS').classList.toggle('on', t==='s');
  document.getElementById('toM').classList.toggle('tm', t==='m');
  document.getElementById('toM').classList.toggle('on', t==='m');
  document.getElementById('toE').classList.toggle('on', t==='e');
  toggleEventFields(t === 'e');
  renderSuggW();
}

function toggleEventFields(isEvent){
  document.querySelectorAll('.event-only').forEach(function(el){
    el.classList.toggle('on', isEvent);
  });
  // Hide result picker for events (use status instead)
  var resWrap = document.getElementById('resWrap');
  if(resWrap) resWrap.style.display = isEvent ? 'none' : 'block';
}

function selR(btn){
  document.querySelectorAll('#mbg .ro').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  modalState.result = btn.getAttribute('data-r');
}

function renderSuggW(){
  var sw = document.getElementById('suggW');
  if(!sw) return;
  var sales = ['Gọi khách','Gặp khách','Demo sản phẩm','Follow up','Báo giá','Chốt deal'];
  var mkt = ['Đăng Facebook','Quay TikTok','Viết blog','Email marketing','Chạy ads','Phân tích đối thủ'];
  var events = ['Networking','Workshop','Conference','Webinar','Trade Show','Meet-up'];
  var arr = modalState.type==='s' ? sales : modalState.type==='m' ? mkt : modalState.type==='e' ? events : [];
  sw.innerHTML = arr.map(function(s){
    return '<button class="sc2" onclick="document.getElementById(\'iName\').value=\''+s+'\'">'+s+'</button>';
  }).join('');
}

function saveAct(){
  var name = document.getElementById('iName').value.trim();
  var note = document.getElementById('iNote').value.trim();
  var dateStart = document.getElementById('iDateStart').value;
  var dateEnd = document.getElementById('iDateEnd').value || dateStart;

  if(!modalState.type){ toast('Chọn Sales / Marketing / Event'); return; }
  if(!name){ toast('Nhập tên hoạt động'); return; }
  if(!dateStart){ toast('Chọn ngày bắt đầu'); return; }
  if(dateEnd < dateStart){ toast('Ngày kết thúc phải sau ngày bắt đầu'); return; }

  var data = {
    type: modalState.type,
    name: name,
    dateStart: dateStart,
    dateEnd: dateEnd,
    date: dateStart, // for backward compat
    note: note
  };

  if(modalState.type === 'e'){
    data.organizer = document.getElementById('iOrg').value.trim();
    data.location = document.getElementById('iLoc').value.trim();
    data.cost = parseMoney(document.getElementById('iCost').value);
    data.status = document.getElementById('iStatus').value;
    data.result = null;
  } else {
    data.result = modalState.result;
  }

  if(modalState.editId){
    var idx = STATE.entries.findIndex(function(e){return e.id === modalState.editId;});
    if(idx >= 0){
      STATE.entries[idx] = Object.assign(STATE.entries[idx], data);
      toast('Đã cập nhật ✓');
    }
  } else {
    data.id = uid();
    data.ts = new Date().toISOString();
    STATE.entries.push(data);
    toast('Đã thêm ✓');
  }

  markDirty();
  closeModal();
  renderPage(currentPage);
}

function delCurrent(){
  if(!modalState.editId) return;
  if(!confirm('Xoá hoạt động này?')) return;
  STATE.entries = STATE.entries.filter(function(e){return e.id !== modalState.editId;});
  markDirty();
  closeModal();
  toast('Đã xoá');
  renderPage(currentPage);
}

function delEntry(id){
  if(!confirm('Xoá hoạt động này?')) return;
  STATE.entries = STATE.entries.filter(function(e){return e.id !== id;});
  markDirty();
  renderPage(currentPage);
}

/* ============================================
   6A. DAY PAGE
   ============================================ */

function shiftDay(n){
  dayOffset += n;
  renderDay();
}

function renderDay(){
  var d = new Date();
  d.setDate(d.getDate() + dayOffset);
  var dStr = ds(d);
  var ents = entFor(dStr);

  // Title
  document.getElementById('dayT').textContent =
    dayOffset===0 ? 'Hôm nay' :
    dayOffset===-1 ? 'Hôm qua' :
    dayOffset===1 ? 'Ngày mai' :
    fmtD(dStr);
  document.getElementById('dayS').textContent = fmtDLong(dStr);

  // Stats — 3 columns now (Sale/Mkt/Event)
  var c = countByType(ents);
  var sgEl = document.getElementById('daySg');
  sgEl.innerHTML = ''+
    '<div class="sg" style="grid-template-columns:repeat(3,1fr)">'+
      '<div class="sc sale">'+
        '<div class="sc-head">'+
          '<div class="sc-l">'+icn('heart')+'Sales</div>'+
        '</div>'+
        '<div class="sc-n pk">'+c.s+'</div>'+
        '<div class="sc-s">sales</div>'+
      '</div>'+
      '<div class="sc mkt">'+
        '<div class="sc-head">'+
          '<div class="sc-l">'+icn('megaphone')+'Mkt</div>'+
        '</div>'+
        '<div class="sc-n pu">'+c.m+'</div>'+
        '<div class="sc-s">marketing</div>'+
      '</div>'+
      '<div class="sc" style="background:linear-gradient(135deg,#F0FDF8,#E8F8F5);border-color:#A8D8C8">'+
        '<div class="sc-head">'+
          '<div class="sc-l" style="color:#0E7869">'+icn('events')+'Events</div>'+
        '</div>'+
        '<div class="sc-n" style="color:#0E7869">'+c.e+'</div>'+
        '<div class="sc-s">events</div>'+
      '</div>'+
    '</div>';

  // Counts
  var doneCount = ents.filter(function(e){return e.result==='done'||e.result==='success';}).length;
  document.getElementById('dayCnt').innerHTML = '<strong>'+ents.length+'</strong> hoạt động · '+
    '<strong>'+doneCount+'</strong> hoàn thành';

  // List — entries clickable to edit
  var listEl = document.getElementById('dayList');
  if(ents.length === 0){
    listEl.innerHTML = '<div class="empty">'+
      '<div class="ei">'+icn('flower')+'</div>'+
      '<h4>Chưa có hoạt động</h4>'+
      '<p>Bấm "Thêm hoạt động" để bắt đầu</p>'+
    '</div>';
  } else {
    listEl.innerHTML = ents.map(function(e){
      var typeTag, dotCls;
      if(e.type === 's'){
        typeTag = '<span class="tg ts">'+icn('heart')+'Sales</span>';
        dotCls = 's';
      } else if(e.type === 'm'){
        typeTag = '<span class="tg tm">'+icn('megaphone')+'Mkt</span>';
        dotCls = 'm';
      } else {
        typeTag = '<span class="tg tev">'+icn('events')+'Event</span>';
        dotCls = 'e';
      }
      var resTag = '';
      if(e.type === 'e' && e.status){
        var statusCls = {Planned:'twt',Registered:'tpj',Attended:'tac',Cancelled:'tna'}[e.status] || 'tno';
        resTag = '<span class="tg '+statusCls+'">'+e.status+'</span>';
      } else if(e.result){
        resTag = '<span class="tg '+(RES_CLS[e.result]||'tno')+'">'+RES_MAP[e.result]+'</span>';
      } else if(e.type !== 'e'){
        resTag = '<span class="tg tno">Chưa rõ</span>';
      }
      // Multi-day indicator
      var rangeTag = '';
      if(e.dateEnd && e.dateEnd !== e.dateStart && e.dateEnd !== e.date){
        rangeTag = '<span class="tg tno">'+icn('calendar')+fmtD(e.dateStart||e.date)+' → '+fmtD(e.dateEnd)+'</span>';
      }
      var costTag = '';
      if(e.type === 'e' && e.cost){
        costTag = '<span class="tg tno">'+icn('dollar')+fmtMoney(e.cost)+'</span>';
      }
      return '<div class="wi" onclick="openModal(\''+e.id+'\')" style="cursor:pointer">'+
        '<div class="wd '+dotCls+'" style="'+(e.type==='e'?'background:#0E7869;box-shadow:0 0 7px rgba(14,120,105,.4)':'')+'"></div>'+
        '<div class="wb">'+
          '<div class="wn">'+escapeHtml(e.name)+'</div>'+
          '<div class="wts">'+typeTag+resTag+rangeTag+costTag+'</div>'+
          (e.note ? '<div class="wnote">'+escapeHtml(e.note)+'</div>' : '')+
        '</div>'+
        '<button class="wdel" onclick="event.stopPropagation();delEntry(\''+e.id+'\')" title="Xoá">'+icn('trash')+'</button>'+
      '</div>';
    }).join('');
  }

  // Health card (day only — small day count)
  var dayHealth = computeHealth(ents, {period:'day', dayCount:1});
  document.getElementById('dayHealthCard').innerHTML =
    renderHealthCard(dayHealth, 'Health hôm nay', 'Đo lường nhịp ngày');

  // Tip
  var tipEl = document.getElementById('dayTip');
  if(ents.length === 0){
    tipEl.innerHTML = '<div class="insight">'+
      '<div class="ins-head">'+icn('sparkle')+'<div class="ins-t">Gợi ý</div></div>'+
      '<div class="ins-x">Bắt đầu ngày bằng 1 hoạt động Sales (gọi khách, follow up) sẽ tạo momentum tốt cho cả ngày.</div>'+
    '</div>';
  } else if(c.s === 0 && c.m > 0){
    tipEl.innerHTML = '<div class="insight">'+
      '<div class="ins-head">'+icn('sparkle')+'<div class="ins-t">Gợi ý</div></div>'+
      '<div class="ins-x">Hôm nay đã có '+c.m+' marketing nhưng chưa có sale. Thử gọi 1-2 khách trước khi hết ngày.</div>'+
    '</div>';
  } else if(c.m === 0 && c.s > 0){
    tipEl.innerHTML = '<div class="insight">'+
      '<div class="ins-head">'+icn('sparkle')+'<div class="ins-t">Gợi ý</div></div>'+
      '<div class="ins-x">Đã có '+c.s+' sale hôm nay. Thêm 1 marketing nhỏ (bài đăng, story) để duy trì funnel.</div>'+
    '</div>';
  } else {
    tipEl.innerHTML = '';
  }

  // Alerts
  document.getElementById('dayAlerts').innerHTML = renderAlerts(generateAlerts());
}

/* ============================================
   6B. WEEK PAGE
   ============================================ */

function shiftWeek(n){
  weekOffset += n;
  renderWeek();
}

function renderWeek(){
  var dates = wkDates(weekOffset);
  var ents = entWk(weekOffset);
  var c = countByType(ents);

  // Title
  document.getElementById('wkT').textContent =
    weekOffset===0 ? 'Tuần này' :
    weekOffset===-1 ? 'Tuần trước' :
    weekOffset===1 ? 'Tuần sau' :
    'Tuần';
  document.getElementById('wkR').textContent = fmtD(ds(dates[0]))+' – '+fmtD(ds(dates[6]));

  // Health
  var wkHealth = computeHealth(ents, {period:'week', dayCount:7});
  document.getElementById('wkHealth').innerHTML =
    renderHealthCard(wkHealth, 'Health tuần', 'Tổng hợp 7 ngày');

  // Forecast (only for current week → show monthly forecast)
  if(weekOffset === 0){
    document.getElementById('wkForecast').innerHTML = renderForecastCard(computeForecast());
    document.getElementById('wkAlerts').innerHTML = renderAlerts(generateAlerts());
  } else {
    document.getElementById('wkForecast').innerHTML = '';
    document.getElementById('wkAlerts').innerHTML = '';
  }

  // Ratio bar
  var rbEl = document.getElementById('wkRb');
  var sPct = c.total>0 ? Math.round(c.s/c.total*100) : 0;
  var mPct = c.total>0 ? 100-sPct : 0;
  rbEl.innerHTML = '<div class="rb">'+
    '<div class="rb-top">'+
      '<div class="rb-tag" style="color:var(--p2)">'+icn('heart')+'Sales</div>'+
      '<div class="rb-tag" style="color:var(--m2)">Marketing'+icn('megaphone')+'</div>'+
    '</div>'+
    '<div class="rb-tr">'+
      '<div class="rb-s" style="width:'+sPct+'%"></div>'+
      '<div class="rb-m" style="width:'+mPct+'%"></div>'+
    '</div>'+
    '<div class="rb-bot">'+
      '<div class="rb-pct" style="color:var(--p)">'+sPct+'%</div>'+
      '<div class="rb-pct" style="color:var(--m)">'+mPct+'%</div>'+
    '</div>'+
  '</div>';

  // Stats
  document.getElementById('wkSg').innerHTML =
    '<div class="sc sale"><div class="sc-l">'+icn('heart')+'Sales</div><div class="sc-n pk">'+c.s+'</div><div class="sc-s">hoạt động</div></div>'+
    '<div class="sc mkt"><div class="sc-l">'+icn('megaphone')+'Marketing</div><div class="sc-n pu">'+c.m+'</div><div class="sc-s">hoạt động</div></div>'+
    '<div class="sc" style="background:linear-gradient(135deg,#F0FDF8,#E8F8F5);border-color:#A8D8C8"><div class="sc-l" style="color:#0E7869">'+icn('events')+'Events</div><div class="sc-n" style="color:#0E7869">'+c.e+'</div><div class="sc-s">events</div></div>';

  // Compare with last week
  var prevEnts = entWk(weekOffset - 1);
  var pc = countByType(prevEnts);
  var diffS = c.s - pc.s;
  var diffM = c.m - pc.m;
  var diffT = c.total - pc.total;

  document.getElementById('wkCmp').innerHTML =
    '<div class="cc"><div class="cc-l">Tuần trước</div>'+
      '<div class="cc-row"><span class="cc-k">Sales</span><span class="cc-v">'+pc.s+'</span></div>'+
      '<div class="cc-row"><span class="cc-k">Mkt</span><span class="cc-v">'+pc.m+'</span></div>'+
      '<div class="cc-row"><span class="cc-k">Total</span><span class="cc-v">'+pc.total+'</span></div>'+
    '</div>'+
    '<div class="cc now"><div class="cc-l pk">'+(weekOffset===0?'Tuần này':'Tuần đang xem')+'</div>'+
      '<div class="cc-row"><span class="cc-k">Sales</span><span class="cc-v '+(diffS>0?'up':diffS<0?'dn':'')+'">'+c.s+(diffS!==0?' ('+(diffS>0?'+':'')+diffS+')':'')+'</span></div>'+
      '<div class="cc-row"><span class="cc-k">Mkt</span><span class="cc-v '+(diffM>0?'up':diffM<0?'dn':'')+'">'+c.m+(diffM!==0?' ('+(diffM>0?'+':'')+diffM+')':'')+'</span></div>'+
      '<div class="cc-row"><span class="cc-k">Total</span><span class="cc-v '+(diffT>0?'up':diffT<0?'dn':'')+'">'+c.total+(diffT!==0?' ('+(diffT>0?'+':'')+diffT+')':'')+'</span></div>'+
    '</div>';

  // Daily breakdown
  var maxDay = 0;
  dates.forEach(function(d){
    var dEnts = entFor(ds(d));
    if(dEnts.length > maxDay) maxDay = dEnts.length;
  });
  if(maxDay === 0) maxDay = 1;

  var daysHtml = dates.map(function(d){
    var dEnts = entFor(ds(d));
    var dC = countByType(dEnts);
    var sW = (dC.s / maxDay) * 100;
    var mW = (dC.m / maxDay) * 100;
    var isToday = ds(d) === ds(new Date());
    return '<div class="dbr">'+
      '<div class="dbn"'+(isToday?' style="color:var(--p2)"':'')+'>'+VND[d.getDay()]+'</div>'+
      '<div class="dbt">'+
        (sW>0?'<div class="dbs s" style="width:'+sW+'%"></div>':'')+
        (mW>0?'<div class="dbs m" style="width:'+mW+'%"></div>':'')+
        (dC.total===0?'<div class="dbe"></div>':'')+
      '</div>'+
      '<div class="dbc">'+dC.total+'</div>'+
    '</div>';
  }).join('');
  document.getElementById('wkDays').innerHTML = daysHtml;

  // Tip
  var tipEl = document.getElementById('wkTip');
  if(c.total > 0 && weekOffset === 0){
    tipEl.innerHTML = '<div class="insight">'+
      '<div class="ins-head">'+icn('sparkle')+'<div class="ins-t">Insight tuần</div></div>'+
      '<div class="ins-x">'+wkHealth.msg+'</div>'+
    '</div>';
  } else {
    tipEl.innerHTML = '';
  }
}

/* ============================================
   6C. MONTH PAGE
   ============================================ */

function shiftMonth(n){
  monthOffset += n;
  renderMonth();
}

function renderMonth(){
  var r = moRange(monthOffset);
  var ents = entMo(monthOffset);
  var c = countByType(ents);
  var dayCount = r.last.getDate();

  document.getElementById('moT').textContent = VNM[r.m]+' '+r.y;

  // Calendar grid
  renderCalendarGrid(r);
  // Clear day detail when switching month
  if(selectedCalDate && selectedCalDate.indexOf(r.key) !== 0){
    selectedCalDate = null;
    document.getElementById('moDayDetail').innerHTML = '';
  }

  // Achievement
  var goal = STATE.goals[r.key] || {};
  var goalT = goal.total || 0;
  var pct = goalT>0 ? Math.min(Math.round(c.total/goalT*100), 999) : 0;

  var bestDayCount = 0;
  var dayMap = {};
  ents.forEach(function(e){
    dayMap[e.date] = (dayMap[e.date]||0) + 1;
    if(dayMap[e.date] > bestDayCount) bestDayCount = dayMap[e.date];
  });

  document.getElementById('moAch').innerHTML = '<div class="ach">'+
    '<div class="ach-t">'+icn('flag')+'Tháng '+(r.m+1)+'/'+r.y+'</div>'+
    '<div class="ach-3">'+
      '<div class="ai"><div class="ai-n">'+c.total+'</div><div class="ai-l">tổng</div></div>'+
      '<div class="ai"><div class="ai-n">'+(goalT>0?pct+'%':'—')+'</div><div class="ai-l">đạt mục tiêu</div></div>'+
      '<div class="ai"><div class="ai-n">'+bestDayCount+'</div><div class="ai-l">đỉnh ngày</div></div>'+
    '</div>'+
  '</div>';

  // Health
  var moHealth = computeHealth(ents, {period:'month', dayCount:dayCount});
  document.getElementById('moHealth').innerHTML =
    renderHealthCard(moHealth, 'Health tháng', 'Tổng hợp '+dayCount+' ngày');

  // Forecast (only current month)
  if(monthOffset === 0){
    document.getElementById('moForecast').innerHTML = renderForecastCard(computeForecast());
  } else {
    document.getElementById('moForecast').innerHTML = '';
  }

  // Weekly breakdown
  var wkBuckets = [[],[],[],[],[],[]];
  ents.forEach(function(e){
    var d = parseD(e.date);
    var weekIdx = Math.floor((d.getDate()-1)/7);
    if(wkBuckets[weekIdx]) wkBuckets[weekIdx].push(e);
  });
  var maxWk = 1;
  wkBuckets.forEach(function(wk){ if(wk.length>maxWk) maxWk = wk.length; });

  var wksHtml = '';
  wkBuckets.forEach(function(wk, i){
    if(i >= 5 || (i===4 && wk.length===0 && i+1>=wkBuckets.length)) return;
    var wPct = (wk.length / maxWk) * 100;
    var isBest = wk.length === maxWk && wk.length > 0;
    wksHtml += '<div class="wb2'+(isBest?' best':'')+'">'+
      '<div class="wb2-n">W'+(i+1)+'</div>'+
      '<div class="wb2-m">'+
        '<div class="wb2-b" style="width:'+wPct+'%"></div>'+
        '<div class="wb2-s">'+wk.length+' hoạt động</div>'+
      '</div>'+
      '<div class="wb2-v">'+wk.length+(isBest?'<span class="btag">BEST</span>':'')+'</div>'+
    '</div>';
  });
  document.getElementById('moWks').innerHTML = wksHtml || '<div class="empty"><h4>Chưa có data</h4></div>';

  // Pattern: best day-of-week
  var dowCount = [0,0,0,0,0,0,0];
  ents.forEach(function(e){
    var d = parseD(e.date);
    dowCount[d.getDay()]++;
  });
  var bestDow = 0;
  for(var i=1;i<7;i++) if(dowCount[i]>dowCount[bestDow]) bestDow = i;

  document.getElementById('moPat').innerHTML = c.total>0 ? '<div class="insight">'+
    '<div class="ins-head">'+icn('sparkle')+'<div class="ins-t">Pattern</div></div>'+
    '<div class="ins-x">Ngày năng suất nhất: <strong>'+VNDF[bestDow]+'</strong> ('+dowCount[bestDow]+' hoạt động). '+moHealth.msg+'</div>'+
  '</div>' : '';

  // Goal input
  document.getElementById('moGoal').innerHTML = '<div class="gbox">'+
    '<div class="gt">'+icn('target')+'Mục tiêu '+VNM[r.m]+' '+r.y+'</div>'+
    '<input type="number" class="gi" id="goalInp" placeholder="VD: 60 hoạt động" value="'+(goalT||'')+'" min="0">'+
    '<button class="gsv" onclick="saveGoal(\''+r.key+'\')">'+icn('save')+'Lưu mục tiêu</button>'+
  '</div>';
}

function saveGoal(key){
  var v = parseInt(document.getElementById('goalInp').value, 10);
  if(isNaN(v) || v < 0) v = 0;
  STATE.goals[key] = STATE.goals[key] || {};
  STATE.goals[key].total = v;
  markDirty();
  toast('Đã lưu mục tiêu ✓');
  renderMonth();
}

/* Calendar grid render */
var selectedCalDate = null;

function renderCalendarGrid(r){
  // Day-of-week headers (Mon-Sun)
  var dows = ['T2','T3','T4','T5','T6','T7','CN'];
  var dowsHtml = dows.map(function(d){return '<div>'+d+'</div>';}).join('');

  // Calculate first cell offset (Monday-start week)
  var firstDay = new Date(r.y, r.m, 1);
  var dayOfWeek = firstDay.getDay(); // 0=Sun, 1=Mon...
  var leadEmpty = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  var totalDays = r.last.getDate();
  var todayStr = ds(new Date());

  var cellsHtml = '';
  // Empty leading cells
  for(var i = 0; i < leadEmpty; i++){
    cellsHtml += '<div class="cal-cell empty"></div>';
  }

  // Day cells
  for(var d = 1; d <= totalDays; d++){
    var dateStr = r.y + '-' + pad(r.m+1) + '-' + pad(d);
    var dayEnts = entFor(dateStr);
    var dc = countByType(dayEnts);
    var dayDate = new Date(r.y, r.m, d);
    var isToday = dateStr === todayStr;
    var isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
    var classes = 'cal-cell';
    if(isToday) classes += ' today';
    if(isWeekend) classes += ' weekend';
    if(dayEnts.length > 0) classes += ' has-data';

    // Dots: max 3 per type, capped
    var dotsHtml = '';
    var dotCount = 0;
    var maxDots = 6;
    for(var k = 0; k < Math.min(dc.s, 3); k++){
      if(dotCount < maxDots){ dotsHtml += '<div class="cal-dot s"></div>'; dotCount++; }
    }
    for(var k = 0; k < Math.min(dc.m, 3); k++){
      if(dotCount < maxDots){ dotsHtml += '<div class="cal-dot m"></div>'; dotCount++; }
    }
    for(var k = 0; k < Math.min(dc.e, 3); k++){
      if(dotCount < maxDots){ dotsHtml += '<div class="cal-dot e"></div>'; dotCount++; }
    }

    var cntHtml = dayEnts.length > 0 ? '<div class="cal-cnt">'+dayEnts.length+'</div>' : '';

    cellsHtml += '<div class="'+classes+'" onclick="showCalDay(\''+dateStr+'\')">'+
      '<div class="cal-d">'+d+'</div>'+
      (dotsHtml ? '<div class="cal-dots">'+dotsHtml+'</div>' : '')+
      cntHtml+
    '</div>';
  }

  document.getElementById('moCalendar').innerHTML = '<div class="cal-wrap">'+
    '<div class="cal-dow">'+dowsHtml+'</div>'+
    '<div class="cal-grid">'+cellsHtml+'</div>'+
    '<div class="cal-legend">'+
      '<div class="cal-leg"><div class="cal-dot s"></div>Sales</div>'+
      '<div class="cal-leg"><div class="cal-dot m"></div>Marketing</div>'+
      '<div class="cal-leg"><div class="cal-dot e"></div>Event</div>'+
    '</div>'+
  '</div>';
}

function showCalDay(dateStr){
  selectedCalDate = dateStr;
  var ents = entFor(dateStr);
  var detail = document.getElementById('moDayDetail');

  if(ents.length === 0){
    detail.innerHTML = '<div class="cal-detail">'+
      '<div class="cal-det-head">'+
        '<div class="cal-det-title">'+fmtDLong(dateStr)+'</div>'+
        '<button class="cal-det-close" onclick="closeCalDay()">'+icn('x')+'</button>'+
      '</div>'+
      '<div style="text-align:center;padding:10px;color:var(--mu);font-size:13px">Không có hoạt động</div>'+
    '</div>';
    detail.scrollIntoView({behavior:'smooth', block:'nearest'});
    return;
  }

  var listHtml = ents.map(function(e){
    var iconName = e.type === 's' ? 'heart' : e.type === 'm' ? 'megaphone' : 'events';
    var typeText = e.type === 's' ? 'Sale' : e.type === 'm' ? 'Mkt' : 'Event';
    return '<div class="cal-det-item '+e.type+'" onclick="openModal(\''+e.id+'\')" style="cursor:pointer">'+
      icn(iconName)+
      '<div style="flex:1">'+
        '<div style="font-weight:600;color:var(--ink)">'+escapeHtml(e.name)+'</div>'+
        '<div style="font-size:11px;color:var(--mu);margin-top:1px">'+typeText+
        (e.type === 'e' && e.cost ? ' · '+fmtMoney(e.cost)+' VND' : '')+
        (e.dateEnd && e.dateEnd !== e.dateStart && e.dateEnd !== e.date ? ' · '+fmtD(e.dateStart||e.date)+' → '+fmtD(e.dateEnd) : '')+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');

  detail.innerHTML = '<div class="cal-detail">'+
    '<div class="cal-det-head">'+
      '<div class="cal-det-title">'+fmtDLong(dateStr)+' · '+ents.length+' hoạt động</div>'+
      '<button class="cal-det-close" onclick="closeCalDay()">'+icn('x')+'</button>'+
    '</div>'+
    '<div class="cal-det-list">'+listHtml+'</div>'+
  '</div>';
  detail.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function closeCalDay(){
  selectedCalDate = null;
  document.getElementById('moDayDetail').innerHTML = '';
}

/* ============================================
   6D. DASHBOARD (Insights)
   ============================================ */

function renderDashboard(){
  var todayStr = ds(new Date());
  var todayEnts = entFor(todayStr);
  var weekEnts = entWk(0);
  var moEnts = entMo(0);
  var dayHealth = computeHealth(todayEnts, {period:'day', dayCount:1});
  var wkHealth = computeHealth(weekEnts, {period:'week', dayCount:7});
  var moRangeC = moRange(0);
  var moHealth = computeHealth(moEnts, {period:'month', dayCount:moRangeC.last.getDate()});
  var fc = computeForecast();
  var alerts = generateAlerts();

  var html = '';

  // 3 health cards in a row (desktop) / stacked (mobile)
  html += '<div class="sec">'+icn('shield','icn-sm')+'Health Score · 3 chiều thời gian</div>';
  html += '<div class="sg" style="grid-template-columns:repeat(3,1fr)">';

  [['Hôm nay', dayHealth, 'Đo lường ngày hôm nay'],
   ['Tuần này', wkHealth, '7 ngày gần nhất'],
   ['Tháng này', moHealth, VNM[moRangeC.m]]].forEach(function(p){
    var h = p[1];
    var statusColor = {excellent:'var(--ok)',good:'var(--info)',fair:'var(--wn)',warn:'var(--dg)'}[h.status]||'var(--mu)';
    html += '<div class="sc" style="border-color:'+statusColor+';background:linear-gradient(135deg,#fff,var(--cr))">'+
      '<div class="sc-l">'+p[0]+'</div>'+
      '<div class="sc-n" style="color:'+statusColor+'">'+h.score+'</div>'+
      '<div class="sc-s">'+h.label+'</div>'+
    '</div>';
  });
  html += '</div>';

  // Forecast (full)
  html += '<div class="sec">'+icn('trend-up','icn-sm')+'Dự báo</div>';
  html += renderForecastCard(fc);

  // Health breakdown table for current month
  html += '<div class="sec">'+icn('pie-chart','icn-sm')+'Phân tích chi tiết — Tháng này</div>';
  html += '<div class="card"><div class="cb">';
  html += renderBreakdown(moHealth);
  html += '</div></div>';

  // Alerts
  html += renderAlerts(alerts);

  // Recommendations
  html += '<div class="sec">'+icn('zap','icn-sm')+'Gợi ý hành động</div>';
  html += renderRecommendations(dayHealth, wkHealth, moHealth, fc);

  document.getElementById('dashContent').innerHTML = html;
}

function renderBreakdown(h){
  if(!h.breakdown) return '<div class="empty"><h4>Chưa có data</h4></div>';
  var b = h.breakdown;
  var max = b.max || {volume:40,balance:25,quality:25,consistency:10};

  var rows = [
    ['Volume — Khối lượng', b.volume, max.volume, 'Số hoạt động so với target'],
    ['Balance — Cân bằng S&M', b.balance, max.balance, 'Tỉ lệ Sales vs Marketing'],
    ['Quality — Chất lượng', b.quality, max.quality, 'Kết quả tích cực vs tiêu cực'],
    ['Consistency — Đều đặn', b.consistency, max.consistency, 'Số ngày active']
  ];

  return rows.map(function(row){
    var pct = (row[1] / row[2]) * 100;
    var color = pct >= 75 ? 'var(--ok)' : pct >= 50 ? 'var(--info)' : pct >= 25 ? 'var(--wn)' : 'var(--dg)';
    return '<div style="margin-bottom:14px">'+
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">'+
        '<div style="font-size:13px;font-weight:600;color:var(--ink)">'+row[0]+'</div>'+
        '<div style="font-family:var(--dp);font-size:14px;font-weight:700;color:'+color+'">'+row[1]+'/'+row[2]+'</div>'+
      '</div>'+
      '<div style="height:8px;border-radius:99px;background:var(--bd);overflow:hidden">'+
        '<div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:99px;transition:width .8s"></div>'+
      '</div>'+
      '<div style="font-size:11px;color:var(--mu);margin-top:4px">'+row[3]+'</div>'+
    '</div>';
  }).join('');
}

function renderRecommendations(day, wk, mo, fc){
  var recs = [];

  // Based on day health
  if(day.score < 40){
    recs.push({
      icon:'zap',
      title:'Hành động ngay hôm nay',
      body:'Health hôm nay '+day.score+'/100. Thêm tối thiểu 2 hoạt động để đẩy score lên trên 60.'
    });
  }

  // Based on weekly balance
  if(wk.counts && wk.counts.total > 0){
    var ratio = wk.counts.s / Math.max(wk.counts.total, 1);
    if(ratio < 0.3){
      recs.push({
        icon:'heart',
        title:'Tăng Sales tuần này',
        body:'Sales chỉ chiếm '+Math.round(ratio*100)+'% tuần. Đặt mục tiêu '+(Math.ceil(wk.counts.total*0.5) - wk.counts.s)+' sale nữa.'
      });
    } else if(ratio > 0.7){
      recs.push({
        icon:'megaphone',
        title:'Build pipeline marketing',
        body:'Marketing chỉ '+Math.round((1-ratio)*100)+'%. Nguy cơ cạn lead, cần thêm hoạt động marketing.'
      });
    }
  }

  // Based on forecast
  if(fc.goal > 0 && fc.status === 'off-track'){
    var needed = fc.goal - fc.current;
    var perDay = fc.daysRemaining > 0 ? Math.ceil(needed / fc.daysRemaining) : needed;
    recs.push({
      icon:'target',
      title:'Đẩy pace lên '+perDay+'/ngày',
      body:'Để đạt mục tiêu '+fc.goal+' tháng này, cần '+perDay+' hoạt động/ngày trong '+fc.daysRemaining+' ngày còn lại.'
    });
  }

  // Quality-based
  if(mo.results){
    var totalRated = mo.results.done + mo.results.success + mo.results.fail;
    if(totalRated >= 5 && mo.results.fail/totalRated > 0.4){
      recs.push({
        icon:'alert-tri',
        title:'Cải thiện chất lượng',
        body:'Tỉ lệ "Không đạt" cao ('+mo.results.fail+'/'+totalRated+'). Xem lại approach hoặc target khách hàng.'
      });
    }
  }

  // Default success
  if(recs.length === 0){
    recs.push({
      icon:'check',
      title:'Đang đi đúng hướng',
      body:'Các chỉ số đang ở mức tốt. Duy trì nhịp này và đẩy thêm 10% nếu muốn breakout.'
    });
  }

  return '<div class="alerts">'+recs.map(function(r){
    return '<div class="alert info">'+icn(r.icon)+
      '<div><div class="alert-title">'+r.title+'</div>'+
      '<div class="alert-body">'+r.body+'</div></div>'+
    '</div>';
  }).join('')+'</div>';
}

function escapeHtml(s){
  if(!s) return '';
  return String(s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}


/* ============================================
   7. EVENTS
   ============================================ */

var evState = {editId:null};

function openEvModal(id){
  evState.editId = id || null;
  var ev = id ? STATE.events.find(function(e){return e.id===id;}) : null;
  document.getElementById('evMTitle').innerHTML = icn('events') + (id?'Sửa event':'Thêm event');

  document.getElementById('evMBody').innerHTML = ''+
    '<div class="fg">'+
      '<label>Tên event</label>'+
      '<input type="text" id="evName" placeholder="VD: TechFest 2025" value="'+escapeHtml(ev?ev.name:'')+'">'+
    '</div>'+
    '<div class="dr">'+
      '<div><div class="dr-l">Ngày</div><input type="date" id="evDate" value="'+(ev?ev.date:'')+'"></div>'+
      '<div><div class="dr-l">Loại</div>'+
        '<select id="evType" class="gi" style="padding:10px 12px;font-size:14px">'+
          ['Networking','Workshop','Conference','Webinar','Trade Show','Other'].map(function(t){
            return '<option value="'+t+'"'+(ev&&ev.type===t?' selected':'')+'>'+t+'</option>';
          }).join('')+
        '</select>'+
      '</div>'+
    '</div>'+
    '<div class="fg" style="margin-top:14px">'+
      '<label>Người tổ chức</label>'+
      '<input type="text" id="evOrg" placeholder="VD: VnExpress, FPT..." value="'+escapeHtml(ev?ev.organizer:'')+'">'+
    '</div>'+
    '<div class="fg">'+
      '<label>Địa điểm</label>'+
      '<input type="text" id="evLoc" placeholder="VD: GEM Center Q1" value="'+escapeHtml(ev?ev.location:'')+'">'+
    '</div>'+
    '<div class="dr">'+
      '<div><div class="dr-l">Chi phí (VND)</div><input type="number" id="evCost" placeholder="0" value="'+(ev?ev.cost||0:'')+'" min="0"></div>'+
      '<div><div class="dr-l">Trạng thái</div>'+
        '<select id="evStatus" class="gi" style="padding:10px 12px;font-size:14px">'+
          ['Planned','Registered','Attended','Cancelled'].map(function(s){
            return '<option value="'+s+'"'+(ev&&ev.status===s?' selected':(s==='Planned'&&!ev?' selected':''))+'>'+s+'</option>';
          }).join('')+
        '</select>'+
      '</div>'+
    '</div>'+
    '<div class="fg" style="margin-top:14px">'+
      '<label>Ghi chú</label>'+
      '<textarea id="evNote" rows="2" placeholder="Thêm chi tiết...">'+escapeHtml(ev?ev.note:'')+'</textarea>'+
    '</div>'+
    '<button class="sv2" onclick="saveEv()">'+icn('save')+(id?'Cập nhật':'Lưu event')+'</button>'+
    (id ? '<button class="sv2" style="background:var(--cr);color:var(--dg);box-shadow:none;border:1.5px solid var(--bd);margin-top:8px" onclick="delEv(\''+id+'\')">'+icn('trash')+'Xoá event</button>' : '');

  document.getElementById('evMbg').classList.add('on');
}

function closeEvModal(){ document.getElementById('evMbg').classList.remove('on'); }
function evBgClk(e){ if(e.target.id==='evMbg') closeEvModal(); }

function saveEv(){
  var name = document.getElementById('evName').value.trim();
  if(!name){ toast('Nhập tên event'); return; }

  var data = {
    name: name,
    date: document.getElementById('evDate').value,
    type: document.getElementById('evType').value,
    organizer: document.getElementById('evOrg').value.trim(),
    location: document.getElementById('evLoc').value.trim(),
    cost: parseInt(document.getElementById('evCost').value, 10) || 0,
    status: document.getElementById('evStatus').value,
    note: document.getElementById('evNote').value.trim()
  };

  if(evState.editId){
    var idx = STATE.events.findIndex(function(e){return e.id===evState.editId;});
    if(idx >= 0) STATE.events[idx] = Object.assign(STATE.events[idx], data);
  } else {
    data.id = uid();
    STATE.events.push(data);
  }

  markDirty();
  closeEvModal();
  toast(evState.editId?'Đã cập nhật ✓':'Đã thêm event ✓');
  renderEvents();
}

function delEv(id){
  if(!confirm('Xoá event này?')) return;
  STATE.events = STATE.events.filter(function(e){return e.id !== id;});
  markDirty();
  closeEvModal();
  toast('Đã xoá');
  renderEvents();
}

function renderEvents(){
  var search = (document.getElementById('evSearch').value || '').toLowerCase();
  var filterStatus = document.getElementById('evFilter').value;
  var sortBy = document.getElementById('evSort').value;

  var list = STATE.events.slice();
  if(search){
    list = list.filter(function(e){
      return (e.name||'').toLowerCase().indexOf(search) >= 0 ||
             (e.organizer||'').toLowerCase().indexOf(search) >= 0 ||
             (e.location||'').toLowerCase().indexOf(search) >= 0;
    });
  }
  if(filterStatus) list = list.filter(function(e){return e.status === filterStatus;});

  list.sort(function(a,b){
    if(sortBy === 'date-asc') return (a.date||'').localeCompare(b.date||'');
    if(sortBy === 'cost-desc') return (b.cost||0) - (a.cost||0);
    return (b.date||'').localeCompare(a.date||'');
  });

  // Stats
  var totalEv = STATE.events.length;
  var attendedEv = STATE.events.filter(function(e){return e.status==='Attended';}).length;
  var totalCost = STATE.events.reduce(function(sum,e){return sum + (e.cost||0);}, 0);
  var attendPct = totalEv>0 ? Math.round(attendedEv/totalEv*100) : 0;

  document.getElementById('evStats').innerHTML =
    '<div class="ev-sc e-plan"><div class="ev-sc-l">'+icn('list')+'Tổng</div><div class="ev-sc-n co">'+totalEv+'</div><div class="ev-sc-s">events</div></div>'+
    '<div class="ev-sc e-att"><div class="ev-sc-l">'+icn('check')+'Đã tham dự</div><div class="ev-sc-n gr">'+attendedEv+'</div><div class="ev-sc-s">events</div></div>'+
    '<div class="ev-sc e-cost"><div class="ev-sc-l">'+icn('dollar')+'Chi phí</div><div class="ev-sc-n pk">'+(totalCost>=1000000?(totalCost/1000000).toFixed(1)+'M':totalCost>=1000?(totalCost/1000).toFixed(0)+'K':totalCost)+'</div><div class="ev-sc-s">VND</div></div>'+
    '<div class="ev-sc e-pct"><div class="ev-sc-l">'+icn('target')+'Tỉ lệ tham dự</div><div class="ev-sc-n pu">'+attendPct+'%</div><div class="ev-sc-s">attended</div></div>';

  if(list.length === 0){
    document.getElementById('evList').innerHTML = '<div class="empty">'+
      '<div class="ei">'+icn('events','icn-xl')+'</div>'+
      '<h4>Chưa có event</h4>'+
      '<p>Thêm event để theo dõi networking, workshop, conference...</p>'+
    '</div>';
    return;
  }

  var statusTagCls = {Planned:'twt',Registered:'tpj',Attended:'tac',Cancelled:'tna'};

  document.getElementById('evList').innerHTML = list.map(function(e){
    return '<div class="ev-card">'+
      '<div class="ev-card-head">'+
        '<div class="ev-card-name">'+escapeHtml(e.name)+'</div>'+
        '<div class="ev-card-act">'+
          '<button class="ev-act-btn" onclick="openEvModal(\''+e.id+'\')" title="Sửa">'+icn('edit')+'</button>'+
        '</div>'+
      '</div>'+
      '<div class="ev-card-meta">'+
        (e.date ? '<div class="ev-meta-row">'+icn('calendar')+fmtDLong(e.date)+'</div>' : '')+
        (e.location ? '<div class="ev-meta-row">'+icn('map-pin')+escapeHtml(e.location)+'</div>' : '')+
        (e.organizer ? '<div class="ev-meta-row">'+icn('users')+escapeHtml(e.organizer)+'</div>' : '')+
        (e.cost ? '<div class="ev-meta-row">'+icn('dollar')+(e.cost>=1000?(e.cost/1000).toFixed(0)+'K':e.cost)+' VND</div>' : '')+
      '</div>'+
      '<div class="ev-card-tags">'+
        '<span class="tg '+(statusTagCls[e.status]||'tno')+'">'+(e.status||'—')+'</span>'+
        (e.type ? '<span class="tg tev">'+e.type+'</span>' : '')+
      '</div>'+
      (e.note ? '<div class="ev-card-note">'+escapeHtml(e.note)+'</div>' : '')+
    '</div>';
  }).join('');
}

/* ============================================
   8. KANBAN
   ============================================ */

var kbMode = 'day';

function kbSwitch(mode, btn){
  kbMode = mode;
  document.querySelectorAll('.kb-tab').forEach(function(t){t.classList.remove('on');});
  if(btn) btn.classList.add('on');
  renderKanban();
}

function kbAddForm(colKey){
  var existing = document.getElementById('kbForm_'+colKey);
  if(existing){ existing.remove(); return; }
  var btn = document.getElementById('kbAddBtn_'+colKey);
  if(!btn) return;
  var form = document.createElement('div');
  form.className = 'kb-inline-form';
  form.id = 'kbForm_'+colKey;
  form.innerHTML = '<input type="text" id="kbInp_'+colKey+'" placeholder="Tên việc..." maxlength="80">'+
    '<div class="kb-inline-actions">'+
      '<button class="kb-save-btn" onclick="kbSaveItem(\''+colKey+'\')">Thêm ✓</button>'+
      '<button class="kb-cancel-btn" onclick="document.getElementById(\'kbForm_'+colKey+'\').remove()">Huỷ</button>'+
    '</div>';
  btn.parentNode.insertBefore(form, btn.nextSibling);
  setTimeout(function(){
    var inp = document.getElementById('kbInp_'+colKey);
    if(inp) inp.focus();
  }, 100);
}

function kbSaveItem(colKey){
  var inp = document.getElementById('kbInp_'+colKey);
  if(!inp || !inp.value.trim()) return;
  if(!STATE.todos[colKey]) STATE.todos[colKey] = [];
  STATE.todos[colKey].push({
    id: uid(),
    text: inp.value.trim(),
    done: false,
    ts: new Date().toISOString()
  });
  markDirty();
  renderKanban();
  toast('Đã thêm ✓');
}

function kbToggle(colKey, id){
  if(!STATE.todos[colKey]) return;
  var item = STATE.todos[colKey].find(function(t){return t.id===id;});
  if(item) item.done = !item.done;
  markDirty();
  renderKanban();
}

function kbDel(colKey, id){
  if(!STATE.todos[colKey]) return;
  STATE.todos[colKey] = STATE.todos[colKey].filter(function(t){return t.id !== id;});
  markDirty();
  renderKanban();
}

function kbBuildCol(title, titleCls, headCls, cntCls, colKey, dateLabel, smEntries, todos){
  var done = todos.filter(function(t){return t.done;}).length;
  var total = todos.length + smEntries.length;
  var html = '<div class="kb-col">'+
    '<div class="kb-col-head">'+
      '<div><div class="kb-col-title '+titleCls+'">'+title+'</div><div class="kb-col-date">'+dateLabel+'</div></div>'+
      '<span class="kb-cnt-badge '+cntCls+'">'+total+'</span>'+
    '</div>';

  if(smEntries.length){
    html += '<div class="kb-from-sm">— Hoạt động đã thêm —</div>';
    smEntries.forEach(function(e){
      var tt;
      var cardCls;
      if(e.type === 's'){
        tt = '<span class="tg ts">'+icn('heart')+'S</span>';
        cardCls = 'sale-card';
      } else if(e.type === 'm'){
        tt = '<span class="tg tm">'+icn('megaphone')+'M</span>';
        cardCls = 'mkt-card';
      } else {
        tt = '<span class="tg tev">'+icn('events')+'E</span>';
        cardCls = 'mkt-card'; // reuse styling, override border below
      }
      var res = '';
      if(e.type === 'e' && e.status){
        var sc = {Planned:'twt',Registered:'tpj',Attended:'tac',Cancelled:'tna'}[e.status]||'tno';
        res = '<span class="tg '+sc+'">'+e.status+'</span>';
      } else if(e.result){
        res = '<span class="tg '+(RES_CLS[e.result]||'tno')+'">'+RES_MAP[e.result]+'</span>';
      }
      var rangeIndicator = '';
      if(e.dateEnd && e.dateEnd !== e.dateStart && e.dateEnd !== e.date){
        rangeIndicator = '<span class="tg tno" style="font-size:9.5px">'+fmtD(e.dateStart||e.date)+'→'+fmtD(e.dateEnd)+'</span>';
      }
      var customStyle = e.type === 'e' ? 'style="border-left-color:#0E7869"' : '';
      html += '<div class="kb-card '+cardCls+'" '+customStyle+' onclick="openModal(\''+e.id+'\')" style="cursor:pointer'+(e.type==='e'?';border-left-color:#0E7869':'')+'">'+
        '<div class="kb-card-row"><div style="flex:1">'+
          '<div class="kb-card-name">'+escapeHtml(e.name)+'</div>'+
          '<div class="kb-card-tags">'+tt+res+rangeIndicator+'</div>'+
          (e.note ? '<div class="kb-card-note">'+escapeHtml(e.note)+'</div>' : '')+
        '</div></div>'+
      '</div>';
    });
  }

  if(todos.length){
    html += '<div class="kb-from-sm">— To-do —</div>';
    todos.forEach(function(t){
      html += '<div class="kb-card todo-card'+(t.done?' done':'')+'">'+
        '<div class="kb-card-row">'+
          '<button class="kb-check-btn'+(t.done?' done-btn':'')+'" onclick="kbToggle(\''+colKey+'\',\''+t.id+'\')">'+(t.done?'✓':'')+'</button>'+
          '<div class="kb-card-name'+(t.done?' done-txt':'')+'">'+escapeHtml(t.text)+'</div>'+
        '</div>'+
        '<button class="kb-del-btn" onclick="kbDel(\''+colKey+'\',\''+t.id+'\')">×</button>'+
      '</div>';
    });
    if(done > 0){
      html += '<div style="font-size:10.5px;color:var(--ok);font-weight:600;padding:2px 4px">✓ Xong '+done+'/'+todos.length+'</div>';
    }
  }

  if(!total) html += '<div class="kb-empty">Chưa có gì ở đây</div>';
  html += '<button class="kb-add-todo" id="kbAddBtn_'+colKey+'" onclick="kbAddForm(\''+colKey+'\')">'+icn('plus')+'Thêm to-do</button>';
  html += '</div>';
  return html;
}

function renderKanban(){
  var now = new Date();
  var todayStr = ds(now);
  var lbl = document.getElementById('kbPeriodLabel');
  var board = document.getElementById('kbBoard');
  var html = '';

  if(kbMode === 'day'){
    var yd = new Date(now); yd.setDate(now.getDate()-1);
    var tm = new Date(now); tm.setDate(now.getDate()+1);
    var ydStr = ds(yd), tmStr = ds(tm);
    if(lbl) lbl.textContent = 'Hôm nay: '+fmtD(todayStr);

    var ydEnts = entFor(ydStr), twEnts = entFor(todayStr), tmEnts = entFor(tmStr);
    var ydTd = STATE.todos[ydStr]||[], twTd = STATE.todos[todayStr]||[], tmTd = STATE.todos[tmStr]||[];

    html += kbBuildCol('Hôm qua','past','past','',ydStr,VND[yd.getDay()]+' '+fmtD(ydStr),ydEnts,ydTd);
    html += kbBuildCol('Hôm nay','now','now','now',todayStr,VND[now.getDay()]+' '+fmtD(todayStr),twEnts,twTd);
    html += kbBuildCol('Ngày mai','next','next','next',tmStr,VND[tm.getDay()]+' '+fmtD(tmStr),tmEnts,tmTd);
  } else if(kbMode === 'week'){
    var wkOffsets = [-1,0,1];
    var labels = ['Tuần trước','Tuần này','Tuần sau'];
    var hlsArr = ['past','now','next'];
    if(lbl){
      var d = wkDates(0);
      lbl.textContent = 'Tuần này: '+fmtD(ds(d[0]))+' – '+fmtD(ds(d[6]));
    }
    wkOffsets.forEach(function(off, i){
      var wDates = wkDates(off);
      var wEnts = entWk(off);
      var wKey = 'wk_'+ds(wDates[0]);
      var wTd = STATE.todos[wKey]||[];
      var wRange = fmtD(ds(wDates[0]))+' – '+fmtD(ds(wDates[6]));
      html += kbBuildCol(labels[i], hlsArr[i], hlsArr[i], i===1?'now':'', wKey, wRange, wEnts, wTd);
    });
  } else if(kbMode === 'month'){
    var offsets = [-1,0,1];
    var moLabels = ['Tháng trước','Tháng này','Tháng sau'];
    var moHls = ['past','now','next'];
    if(lbl) lbl.textContent = 'Tháng này: '+VNM[now.getMonth()]+' '+now.getFullYear();
    offsets.forEach(function(off, i){
      var mEnts = entMo(off);
      var r = moRange(off);
      var mKey = 'mo_'+r.key;
      var mTd = STATE.todos[mKey]||[];
      html += kbBuildCol(moLabels[i], moHls[i], moHls[i], i===1?'now':'', mKey, VNM[r.m]+' '+r.y, mEnts, mTd);
    });
  }

  board.innerHTML = html;
  // Only horizontal scroll-to-center on desktop tablet wide; vertical layout on mobile doesn't need it
  setTimeout(function(){
    if(window.innerWidth >= 1024) return;
    // Mobile: vertical layout — scroll to "now" column (middle one)
    var cols = board.querySelectorAll('.kb-col');
    if(cols.length >= 2){
      // Scroll to second column smoothly so user sees Today first
      var nowCol = cols[1];
      var rect = nowCol.getBoundingClientRect();
      var topbarH = 58 + 50; // topbar + nav
      // Don't auto-scroll if already in view
    }
  }, 80);
}

/* ============================================
   9. SETTINGS / IMPORT / EXPORT
   ============================================ */

function openSh(){ document.getElementById('sbg').classList.add('on'); }
function closeSh(){ document.getElementById('sbg').classList.remove('on'); }

function exportData(){
  var data = {
    entries: STATE.entries,
    events: STATE.events,
    goals: STATE.goals,
    todos: STATE.todos,
    exportedAt: new Date().toISOString(),
    version: '2.0'
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'bloom_backup_'+ds(new Date())+'.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Đã xuất file ✓');
  closeSh();
}

function importData(ev){
  var f = ev.target.files[0];
  if(!f) return;
  var fr = new FileReader();
  fr.onload = function(e){
    try{
      var d = JSON.parse(e.target.result);
      if(!confirm('Nhập file này sẽ ghi đè dữ liệu hiện tại. Tiếp tục?')) return;
      STATE.entries = d.entries || [];
      STATE.events = d.events || [];
      STATE.goals = d.goals || {};
      STATE.todos = d.todos || {};
      saveData();
      toast('Đã nhập '+STATE.entries.length+' hoạt động ✓');
      closeSh();
      renderPage(currentPage);
    } catch(err){
      toast('File không hợp lệ');
    }
  };
  fr.readAsText(f);
}

function exportCSV(){
  var rows = [['Ngày bắt đầu','Ngày kết thúc','Loại','Tên','Kết quả/Trạng thái','Tổ chức','Địa điểm','Chi phí','Ghi chú']];
  STATE.entries.forEach(function(e){
    var typeName = e.type==='s'?'Sales':e.type==='m'?'Marketing':e.type==='e'?'Event':'';
    var resultName = e.type === 'e' ? (e.status || '') : (RES_MAP[e.result] || '');
    rows.push([
      e.dateStart || e.date || '',
      e.dateEnd || e.dateStart || e.date || '',
      typeName,
      (e.name||'').replace(/"/g,'""'),
      resultName,
      (e.organizer||'').replace(/"/g,'""'),
      (e.location||'').replace(/"/g,'""'),
      e.cost ? fmtMoney(e.cost) : '',
      (e.note||'').replace(/"/g,'""')
    ]);
  });
  var csv = '\ufeff' + rows.map(function(r){
    return r.map(function(c){return '"'+String(c)+'"';}).join(',');
  }).join('\n');
  var blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'bloom_activities_'+ds(new Date())+'.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('Đã xuất CSV ✓');
  closeSh();
}

function clearAllData(){
  if(!confirm('Xoá TOÀN BỘ data? Không khôi phục được.')) return;
  if(!confirm('Chắc chắn xoá hết?')) return;
  STATE.entries = [];
  STATE.events = [];
  STATE.goals = {};
  STATE.todos = {};
  localStorage.removeItem(SAVE_KEY);
  toast('Đã xoá hết');
  closeSh();
  renderPage(currentPage);
}

/* ============================================
   INIT
   ============================================ */

document.addEventListener('DOMContentLoaded', function(){
  splashInit();
});

// Save on page hide (mobile background)
window.addEventListener('beforeunload', function(){
  if(saveDirty) saveData();
});
document.addEventListener('visibilitychange', function(){
  if(document.hidden && saveDirty) saveData();
});
