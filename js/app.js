/* ===========================================================
   AIGC 工具导航 —— 前端逻辑
   -----------------------------------------------------------
   已可用（纯前端）：浏览、搜索、多关键词、分类筛选、收费筛选、
                     排序、分页加载、工具详情、跳转官网
   待接入（需云服务后端）：注册登录、收藏、评论、工具投稿

   说明：需要账号的功能在后端开通前会明确提示「服务暂不可用」，
        不会用 localStorage 冒充成功，避免让你误以为数据已保存。
   =========================================================== */
(function () {
  'use strict';

  var TOOLS  = window.AIGC_TOOLS || [];
  var CATS   = window.AIGC_CATEGORIES || [];
  var PRICES = window.AIGC_PRICES || {};

  var catMap = {};
  CATS.forEach(function (c) { catMap[c.id] = c; });

  /* ---------------------------------------------------------
     云服务状态
     后端开通成功后，这里会拿到 publicConfig 并把 ready 置为 true，
     同时填充 user / favCounts / myFavs / comments。
     --------------------------------------------------------- */
  var cloud = {
    ready: false,
    user: null,
    favCounts: {},      // toolId -> 收藏数
    myFavs: {},         // toolId -> true
    comments: {},       // toolId -> [comment]
    submissions: []
  };

  var state = {
    q: '',
    cat: 'all',
    price: 'all',
    sort: 'featured',
    favOnly: false,
    page: 1,
    pageSize: 24
  };

  var QUICK_TAGS = ['视频生成', '抠图', 'PPT', '配音', '代码补全', '数字人', '论文', '免费'];

  /* ========================= 工具函数 ========================= */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch (e) { return ''; }
  }

  /* 由字符串稳定地生成一组渐变色，保证同一工具颜色永远一致 */
  function hashHue(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return h;
  }
  function gradOf(str) {
    var h = hashHue(str);
    return 'linear-gradient(135deg,hsl(' + h + ' 72% 58%),hsl(' + ((h + 42) % 360) + ' 76% 50%))';
  }

  function initialOf(name) {
    var n = String(name || '?').trim();
    // 中文取首字，英文取首字母
    return /[\u4e00-\u9fa5]/.test(n.charAt(0)) ? n.charAt(0) : n.charAt(0).toUpperCase();
  }

  function faviconOf(url) {
    var h = hostOf(url);
    if (!h) return '';
    return 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(h);
  }

  function logoHTML(tool, cls) {
    return '<span class="logo ' + (cls || '') + '" style="background:' + gradOf(tool.name) + '">' +
             '<span class="logo-letter">' + esc(initialOf(tool.name)) + '</span>' +
             (faviconOf(tool.url)
               ? '<img src="' + faviconOf(tool.url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">'
               : '') +
           '</span>';
  }

  function timeAgo(ts) {
    var d = Date.now() - Number(ts || 0);
    if (!isFinite(d) || d < 0) return '';
    var m = Math.floor(d / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    var day = Math.floor(h / 24);
    if (day < 30) return day + ' 天前';
    var dt = new Date(Number(ts));
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function toast(msg, kind, ms) {
    var stack = $('toastStack');
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s ease,transform .25s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(function () { el.remove(); }, 260);
    }, ms || 2600);
  }

  /* 需要账号的功能统一走这里，后端没就绪时明确提示 */
  function requireCloud(actionLabel) {
    if (cloud.ready) return true;
    toast('账号服务正在开通中，' + actionLabel + '暂不可用，请稍后再试', 'err', 3200);
    return false;
  }

  /* ========================= 数据查询 ========================= */

  function matchesQuery(tool, keywords) {
    if (!keywords.length) return true;
    var hay = [
      tool.name, tool.desc, tool.cat,
      (catMap[tool.cat] ? catMap[tool.cat].name : ''),
      (tool.tags || []).join(' '),
      (PRICES[tool.price] ? PRICES[tool.price].label : '')
    ].join(' ').toLowerCase();
    return keywords.every(function (k) { return hay.indexOf(k) > -1; });
  }

  function getFiltered() {
    var keywords = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    var list = TOOLS.filter(function (t) {
      if (state.cat !== 'all' && t.cat !== state.cat) return false;
      if (state.price !== 'all' && t.price !== state.price) return false;
      if (state.favOnly && !cloud.myFavs[t.id]) return false;
      return matchesQuery(t, keywords);
    });

    if (state.sort === 'name') {
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hans-CN'); });
    } else if (state.sort === 'fav') {
      list.sort(function (a, b) {
        var d = (cloud.favCounts[b.id] || 0) - (cloud.favCounts[a.id] || 0);
        if (d) return d;
        return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      });
    } else {
      list.sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); });
    }
    return list;
  }

  /* ========================= 渲染 ========================= */

  function renderCatBar() {
    var html = '<button class="cat-chip' + (state.cat === 'all' && !state.favOnly ? ' active' : '') +
               '" data-cat="all" role="tab">全部<span class="n">' + TOOLS.length + '</span></button>';

    CATS.forEach(function (c) {
      var n = TOOLS.filter(function (t) { return t.cat === c.id; }).length;
      html += '<button class="cat-chip' + (state.cat === c.id && !state.favOnly ? ' active' : '') +
              '" data-cat="' + c.id + '" role="tab" title="' + esc(c.desc) + '">' +
              esc(c.name) + '<span class="n">' + n + '</span></button>';
    });

    var favN = Object.keys(cloud.myFavs).length;
    html += '<button class="cat-chip' + (state.favOnly ? ' active' : '') + '" data-fav="1" role="tab">' +
            '我的收藏<span class="n">' + favN + '</span></button>';

    $('catBar').innerHTML = html;
  }

  function renderQuickTags() {
    var row = $('quickRow');
    var html = '<span class="quick-label">热门搜索</span>';
    QUICK_TAGS.forEach(function (t) {
      html += '<button class="quick-tag" data-quick="' + esc(t) + '" type="button">' + esc(t) + '</button>';
    });
    row.innerHTML = html;
  }

  function priceBadge(tool) {
    var p = PRICES[tool.price];
    if (!p) return '';
    return '<span class="badge" style="color:' + p.color + '">' + esc(p.label) + '</span>';
  }

  function cardHTML(tool) {
    var cat = catMap[tool.cat];
    var faved = !!cloud.myFavs[tool.id];
    var cnt = cloud.favCounts[tool.id] || 0;
    var tags = (tool.tags || []).slice(0, 3).map(function (t) {
      return '<span class="tag">' + esc(t) + '</span>';
    }).join('');

    return '' +
      '<article class="card" data-id="' + esc(tool.id) + '">' +
        '<div class="card-top">' +
          logoHTML(tool) +
          '<div class="card-head">' +
            '<div class="card-title"><h3>' + esc(tool.name) + '</h3>' + priceBadge(tool) + '</div>' +
            '<div class="card-cat">' + esc(cat ? cat.name : '其他') + '</div>' +
          '</div>' +
        '</div>' +
        '<p class="card-desc">' + esc(tool.desc) + '</p>' +
        '<div class="tag-row">' + tags + '</div>' +
        '<div class="card-foot">' +
          '<button class="fav-btn' + (faved ? ' on' : '') + '" data-fav-id="' + esc(tool.id) + '" type="button" title="收藏">' +
            '<svg viewBox="0 0 24 24" fill="none"><path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7 3.1C19 15.6 12 20 12 20Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' +
            '<span class="fav-count">' + cnt + '</span>' +
          '</button>' +
          '<button class="card-more" data-more-id="' + esc(tool.id) + '" type="button">详情</button>' +
          '<a class="go" href="' + esc(tool.url) + '" target="_blank" rel="noopener noreferrer">' +
            '访问官网' +
            '<svg viewBox="0 0 24 24" fill="none"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</a>' +
        '</div>' +
      '</article>';
  }

  function render() {
    var list = getFiltered();
    var shown = list.slice(0, state.page * state.pageSize);
    var grid = $('grid');

    grid.innerHTML = shown.map(cardHTML).join('');

    // 结果说明
    var bits = [];
    bits.push('共 <b>' + list.length + '</b> 款工具');
    if (state.q) bits.push('关键词 <span class="kw">' + esc(state.q) + '</span>');
    if (state.cat !== 'all' && catMap[state.cat]) bits.push('分类 <b>' + esc(catMap[state.cat].name) + '</b>');
    if (state.price !== 'all' && PRICES[state.price]) bits.push('收费 <b>' + esc(PRICES[state.price].label) + '</b>');
    if (state.favOnly) bits.push('仅看 <b>我的收藏</b>');
    $('resultInfo').innerHTML = bits.join(' · ');

    $('empty').hidden = list.length !== 0;
    if (state.favOnly && !cloud.ready) {
      $('emptyHint').textContent = '收藏功能需要登录，账号服务正在开通中。';
    } else if (state.favOnly) {
      $('emptyHint').textContent = '你还没有收藏任何工具，去卡片左下角点个心吧。';
    } else {
      $('emptyHint').textContent = '换个关键词，或者重置筛选条件试试。';
    }

    $('btnLoadMore').hidden = shown.length >= list.length;
    $('btnLoadMore').textContent = '加载更多（还有 ' + Math.max(0, list.length - shown.length) + ' 款）';

    $('statTools').textContent = TOOLS.length;
    $('statCats').textContent = CATS.length;
    // 页脚统计由 site-chrome.js 统一渲染
  }

  function refreshStats() {
    var total = 0;
    Object.keys(cloud.favCounts).forEach(function (k) { total += cloud.favCounts[k] || 0; });
    $('statFavs').textContent = total;
    $('favStatWrap').hidden = !cloud.ready;
  }

  /* ========================= 弹层 ========================= */

  var overlay = $('overlay');
  var modalEl = $('modal');
  var currentCleanup = null;

  function openModal(html, opts) {
    opts = opts || {};
    modalEl.className = 'modal' + (opts.wide ? ' wide' : '');
    modalEl.innerHTML = html;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (typeof opts.onMount === 'function') currentCleanup = opts.onMount(modalEl) || null;
    var focusEl = modalEl.querySelector('[data-autofocus]');
    if (focusEl) setTimeout(function () { focusEl.focus(); }, 60);
  }

  function closeModal() {
    if (typeof currentCleanup === 'function') { try { currentCleanup(); } catch (e) {} }
    currentCleanup = null;
    overlay.hidden = true;
    modalEl.innerHTML = '';
    document.body.style.overflow = '';
  }

  function modalHead(title, sub) {
    return '<div class="modal-head">' +
      '<div><h3>' + esc(title) + '</h3>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
      '<button class="modal-close" data-close type="button" aria-label="关闭">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      '</button>' +
    '</div>';
  }

  /* ---------- 工具详情 ---------- */
  function openDetail(id) {
    var tool = TOOLS.filter(function (t) { return t.id === id; })[0];
    if (!tool) return;
    var cat = catMap[tool.cat];
    var p = PRICES[tool.price];
    var faved = !!cloud.myFavs[tool.id];
    var cnt = cloud.favCounts[tool.id] || 0;

    var html = modalHead(tool.name, (cat ? cat.name : '') + ' · ' + hostOf(tool.url)) +
      '<div class="modal-body">' +
        '<div class="detail-top">' +
          logoHTML(tool) +
          '<div class="detail-title">' +
            '<h3>' + esc(tool.name) + '</h3>' +
            '<div class="sub">' +
              (p ? '<span class="badge" style="color:' + p.color + '">' + esc(p.label) + '</span>' : '') +
              '<span>' + esc(cat ? cat.name : '') + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<p class="detail-desc">' + esc(tool.desc) + '</p>' +
        '<div class="tag-row">' +
          (tool.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') +
        '</div>' +
        '<div class="detail-actions" style="margin-top:18px">' +
          '<a class="btn primary" href="' + esc(tool.url) + '" target="_blank" rel="noopener noreferrer">访问官网</a>' +
          '<button class="btn ghost" data-detail-fav="' + esc(tool.id) + '" type="button">' +
            (faved ? '已收藏 · ' + cnt : '收藏 · ' + cnt) +
          '</button>' +
        '</div>' +
        '<div class="section-title">用户评论</div>' +
        commentsHTML(tool.id) +
      '</div>';

    openModal(html, {
      onMount: function (root) {
        root.addEventListener('click', function (e) {
          var favBtn = e.target.closest('[data-detail-fav]');
          if (favBtn) { toggleFav(favBtn.getAttribute('data-detail-fav')); closeModal(); openDetail(id); return; }
          var post = e.target.closest('[data-post-comment]');
          if (post) { postComment(id); return; }
          var del = e.target.closest('[data-del-comment]');
          if (del) { deleteComment(del.getAttribute('data-del-comment'), del.getAttribute('data-tool')); return; }
          var goLogin = e.target.closest('[data-open-login]');
          if (goLogin) { closeModal(); openAuth('login'); }
        });
      }
    });
  }

  function commentsHTML(toolId) {
    var list = cloud.comments[toolId] || [];
    var form;

    if (!cloud.ready) {
      form = '<div class="form-error">评论功能需要账号服务，正在开通中，稍后即可使用。</div>';
    } else if (!cloud.user) {
      form = '<div class="form-error">登录后即可发表评论。' +
             '<button class="btn small primary" data-open-login type="button" style="margin-left:8px">去登录</button></div>';
    } else {
      form = '<div class="comment-form">' +
               '<textarea data-comment-input placeholder="说点什么…（最多 200 字）" maxlength="200"></textarea>' +
               '<div style="display:flex;justify-content:flex-end">' +
                 '<button class="btn primary small" data-post-comment type="button">发表评论</button>' +
               '</div>' +
             '</div>';
    }

    var items = list.length
      ? list.map(function (c) {
          var mine = cloud.user && c.userId && cloud.user.id === c.userId;
          return '<div class="comment">' +
            '<span class="avatar" style="background:' + gradOf(c.nickname || 'U') + '">' + esc(initialOf(c.nickname || 'U')) + '</span>' +
            '<div class="comment-body">' +
              '<div class="comment-head"><b>' + esc(c.nickname || '匿名用户') + '</b>' +
                '<time>' + esc(timeAgo(c.createdAt)) + '</time>' +
                (mine ? '<button class="comment-del" data-del-comment="' + esc(c.id) + '" data-tool="' + esc(toolId) + '" type="button">删除</button>' : '') +
              '</div>' +
              '<p>' + esc(c.content) + '</p>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div style="color:var(--muted);font-size:13px;padding:4px 0 2px">还没有评论，来做第一个吧。</div>';

    return form + '<div class="comment-list">' + items + '</div>';
  }

  /* ---------- 登录 / 注册 ---------- */
  function openAuth(mode) {
    mode = mode || 'login';
    if (!cloud.ready) {
      openModal(modalHead('账号服务开通中', '稍后再试') +
        '<div class="modal-body">' +
          '<div class="form-error" style="margin-bottom:14px">后端云服务资源临时紧张，正在等待开通。' +
          '开通后即可注册、登录、收藏与评论。</div>' +
          '<p style="font-size:13.5px;color:var(--text-2);line-height:1.8;margin:0">' +
          '站点本身的浏览、搜索、筛选与详情功能已经可以正常使用，你可以先逛逛。' +
          '等云服务就绪后，回到这里点「登录 / 注册」即可完成账号注册。</p>' +
        '</div>' +
        '<div class="modal-foot"><button class="btn primary" data-close type="button">知道了</button></div>');
      return;
    }

    var isLogin = mode === 'login';
    var html = modalHead('欢迎回来', '登录后可收藏工具、发表评论、投稿新工具') +
      '<div class="modal-body">' +
        '<div class="tab-switch">' +
          '<button class="' + (isLogin ? 'active' : '') + '" data-auth-tab="login" type="button">登录</button>' +
          '<button class="' + (!isLogin ? 'active' : '') + '" data-auth-tab="register" type="button">注册</button>' +
        '</div>' +
        '<div id="authMsg"></div>' +
        '<form id="authForm" novalidate>' +
          '<div class="field"><label for="authEmail">邮箱</label>' +
            '<input id="authEmail" type="email" placeholder="you@example.com" autocomplete="email" data-autofocus>' +
          '</div>' +
          '<div class="field"><label for="authPass">密码</label>' +
            '<input id="authPass" type="password" placeholder="至少 6 位" autocomplete="current-password">' +
            (isLogin ? '' : '<div class="hint">密码至少 6 位，建议包含字母和数字。</div>') +
          '</div>' +
          '<button class="btn primary block" type="submit" id="authSubmit">' + (isLogin ? '登录' : '注册并登录') + '</button>' +
        '</form>' +
      '</div>';

    openModal(html, {
      onMount: function (root) {
        root.addEventListener('click', function (e) {
          var tab = e.target.closest('[data-auth-tab]');
          if (tab) { openAuth(tab.getAttribute('data-auth-tab')); }
        });
        root.querySelector('#authForm').addEventListener('submit', function (e) {
          e.preventDefault();
          var m = root.querySelector('#authForm').getAttribute('data-mode') || 'login';
          submitAuth(m);
        });
        root.querySelector('#authForm').setAttribute('data-mode', isLogin ? 'login' : 'register');
      }
    });
  }

  function submitAuth(mode) {
    var email = ($('authEmail') || {}).value || '';
    var pass = ($('authPass') || {}).value || '';
    var msg = $('authMsg');
    email = email.trim();

    function fail(t) { if (msg) msg.innerHTML = '<div class="form-error">' + esc(t) + '</div>'; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('请输入有效的邮箱地址。');
    if (pass.length < 6) return fail('密码至少 6 位。');

    if (!cloud.ready) return fail('账号服务暂不可用，请稍后再试。');
    // 云服务接入后由 CloudAuth 接管（见文件末尾接入区）
    if (typeof window.__cloudSubmitAuth === 'function') return window.__cloudSubmitAuth(mode, email, pass, fail, msg);
    fail('账号服务暂不可用，请稍后再试。');
  }

  /* ---------- 收藏 ---------- */
  function toggleFav(id) {
    if (!requireCloud('收藏')) return;
    if (typeof window.__cloudToggleFav === 'function') window.__cloudToggleFav(id);
  }

  /* ---------- 评论 ---------- */
  function postComment(toolId) {
    var input = modalEl.querySelector('[data-comment-input]');
    if (!input) return;
    var text = (input.value || '').trim();
    if (!text) { toast('评论内容不能为空'); return; }
    if (!requireCloud('评论')) return;
    if (typeof window.__cloudPostComment === 'function') window.__cloudPostComment(toolId, text);
  }

  /* ---------- 删除自己的评论 ---------- */
  function deleteComment(commentId, toolId) {
    if (!requireCloud('删除评论')) return;
    if (typeof window.__cloudDeleteComment === 'function') window.__cloudDeleteComment(commentId, toolId);
  }

  /* ---------- 投稿 ---------- */
  function openSubmit() {
    if (!cloud.ready) {
      openModal(modalHead('投稿功能开通中', '稍后再试') +
        '<div class="modal-body">' +
          '<div class="form-error">投稿需要账号与数据存储，云服务正在开通中。开通后你就能把好用的工具提交上来。</div>' +
        '</div>' +
        '<div class="modal-foot"><button class="btn primary" data-close type="button">知道了</button></div>');
      return;
    }
    if (!cloud.user) { toast('请先登录后再投稿'); openAuth('login'); return; }

    var catOpts = CATS.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
    var priceOpts = Object.keys(PRICES).map(function (k) {
      return '<option value="' + k + '">' + esc(PRICES[k].label) + '</option>';
    }).join('');

    openModal(modalHead('投稿工具', '提交后可在「我的投稿」中查看审核状态') +
      '<div class="modal-body">' +
        '<div id="subMsg"></div>' +
        '<form id="subForm">' +
          '<div class="field"><label>工具名称 *</label><input id="subName" maxlength="40" placeholder="例如：某某 AI" data-autofocus></div>' +
          '<div class="field"><label>官网地址 *</label><input id="subUrl" type="url" placeholder="https://" ></div>' +
          '<div class="field"><label>分类 *</label><select id="subCat">' + catOpts + '</select></div>' +
          '<div class="field"><label>收费模式</label><select id="subPrice">' + priceOpts + '</select></div>' +
          '<div class="field"><label>一句话简介 *</label><textarea id="subDesc" maxlength="120" placeholder="它能做什么？有什么特点？"></textarea></div>' +
        '</form>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn ghost" data-close type="button">取消</button>' +
        '<button class="btn primary" id="subSubmit" type="button">提交投稿</button>' +
      '</div>', {
        onMount: function (root) {
          root.querySelector('#subSubmit').addEventListener('click', submitTool);
        }
      });
  }

  function submitTool() {
    var msg = $('subMsg');
    function fail(t) { if (msg) msg.innerHTML = '<div class="form-error">' + esc(t) + '</div>'; }
    var name = ($('subName').value || '').trim();
    var url = ($('subUrl').value || '').trim();
    var cat = $('subCat').value;
    var price = $('subPrice').value;
    var desc = ($('subDesc').value || '').trim();

    if (name.length < 2) return fail('请填写工具名称。');
    if (!/^https?:\/\/.+\..+/.test(url)) return fail('请填写有效的官网地址（以 http:// 或 https:// 开头）。');
    if (desc.length < 4) return fail('请简单描述一下这个工具。');

    if (typeof window.__cloudSubmitTool === 'function') {
      window.__cloudSubmitTool({ name: name, url: url, cat: cat, price: price, desc: desc }, fail, msg);
    } else {
      fail('账号服务暂不可用，请稍后再试。');
    }
  }

  /* ---------- 我的投稿 ---------- */
  function openMySubmissions() {
    if (!requireCloud('我的投稿')) return;
    var list = cloud.submissions || [];
    var body = list.length
      ? '<div class="sub-list">' + list.map(function (s) {
          var cat = catMap[s.cat];
          var st = s.status || 'pending';
          var stText = st === 'approved' ? '已收录' : (st === 'rejected' ? '未通过' : '审核中');
          return '<div class="sub-item">' +
            '<span class="logo" style="background:' + gradOf(s.name) + '"><span class="logo-letter">' + esc(initialOf(s.name)) + '</span></span>' +
            '<div class="sub-main">' +
              '<b>' + esc(s.name) + '</b> <span class="status ' + esc(st) + '">' + stText + '</span>' +
              '<p>' + esc(s.desc || '') + '</p>' +
              '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.url) + '</a>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>'
      : '<div style="color:var(--muted);font-size:13.5px;padding:8px 0">你还没有投稿过工具。</div>';

    openModal(modalHead('我的投稿', '共 ' + list.length + ' 条') +
      '<div class="modal-body">' + body + '</div>' +
      '<div class="modal-foot"><button class="btn primary" data-close type="button">关闭</button></div>');
  }

  /* ========================= 用户区 ========================= */

  function renderUser() {
    var logged = !!cloud.user;
    $('btnLogin').hidden = logged;
    $('userBox').hidden = !logged;
    if (logged) {
      var u = cloud.user;
      var nick = u.nickname || (u.email ? u.email.split('@')[0] : '用户');
      $('userAvatar').textContent = initialOf(nick);
      $('userAvatar').style.background = gradOf(nick);
      $('userName').textContent = nick;
      $('userEmail').textContent = u.email || '—';
      $('userMeta').textContent = '已收藏 ' + Object.keys(cloud.myFavs).length + ' 款工具';
    }
    $('userMenu').hidden = true;
  }

  /* ========================= 事件绑定 ========================= */

  function bindSearch() {
    var a = $('headerSearch');
    var b = $('heroSearch');
    var timer = null;

    function apply(v, immediate) {
      state.q = v;
      state.page = 1;
      if (timer) clearTimeout(timer);
      if (immediate) render();
      else timer = setTimeout(render, 160);
    }
    a.addEventListener('input', function () { b.value = a.value; apply(a.value); });
    b.addEventListener('input', function () { a.value = b.value; apply(b.value); });

    function commit() {
      state.q = (b.value || '').trim();
      a.value = state.q;
      state.page = 1;
      render();
      var grid = $('grid');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $('heroSearchBtn').addEventListener('click', commit);
    b.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(); });
    a.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { state.q = a.value.trim(); b.value = state.q; state.page = 1; render(); }
    });
  }

  function bindEvents() {
    // 分类 / 我的收藏
    $('catBar').addEventListener('click', function (e) {
      var chip = e.target.closest('.cat-chip');
      if (!chip) return;
      if (chip.hasAttribute('data-fav')) {
        state.favOnly = !state.favOnly;
        state.page = 1;
      } else {
        state.cat = chip.getAttribute('data-cat');
        state.favOnly = false;
        state.page = 1;
      }
      renderCatBar();
      render();
    });

    // 热门搜索
    $('quickRow').addEventListener('click', function (e) {
      var t = e.target.closest('[data-quick]');
      if (!t) return;
      var kw = t.getAttribute('data-quick');
      state.q = kw; state.page = 1;
      $('heroSearch').value = kw; $('headerSearch').value = kw;
      render();
      $('grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // 筛选
    $('priceFilter').addEventListener('change', function () { state.price = this.value; state.page = 1; render(); });
    $('sortBy').addEventListener('change', function () { state.sort = this.value; state.page = 1; render(); });
    $('btnReset').addEventListener('click', resetAll);
    $('btnEmptyReset').addEventListener('click', resetAll);

    $('btnLoadMore').addEventListener('click', function () { state.page++; render(); });

    // 卡片操作
    $('grid').addEventListener('click', function (e) {
      var fav = e.target.closest('[data-fav-id]');
      if (fav) { e.stopPropagation(); toggleFav(fav.getAttribute('data-fav-id')); return; }
      var more = e.target.closest('[data-more-id]');
      if (more) { e.stopPropagation(); openDetail(more.getAttribute('data-more-id')); return; }
      var card = e.target.closest('.card');
      if (card) openDetail(card.getAttribute('data-id'));
    });

    // 顶栏
    $('btnLogin').addEventListener('click', function () { openAuth('login'); });
    $('btnSubmitTool').addEventListener('click', openSubmit);
    $('btnFavList').addEventListener('click', function () {
      state.favOnly = true; state.cat = 'all'; state.page = 1;
      renderCatBar(); render();
      $('grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // 用户菜单
    $('userTrigger').addEventListener('click', function (e) {
      e.stopPropagation();
      $('userMenu').hidden = !$('userMenu').hidden;
    });
    $('menuFav').addEventListener('click', function () {
      $('userMenu').hidden = true;
      state.favOnly = true; state.cat = 'all'; state.page = 1;
      renderCatBar(); render();
    });
    $('menuMySubmit').addEventListener('click', function () { $('userMenu').hidden = true; openMySubmissions(); });
    $('menuLogout').addEventListener('click', function () {
      $('userMenu').hidden = true;
      if (typeof window.__cloudLogout === 'function') window.__cloudLogout();
    });

    // 关闭弹层
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#userBox')) $('userMenu').hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!overlay.hidden) closeModal();
        else $('userMenu').hidden = true;
      }
    });
  }

  function resetAll() {
    state.q = ''; state.cat = 'all'; state.price = 'all';
    state.sort = 'featured'; state.favOnly = false; state.page = 1;
    $('heroSearch').value = ''; $('headerSearch').value = '';
    $('priceFilter').value = 'all'; $('sortBy').value = 'featured';
    renderCatBar();
    render();
  }

  /* ========================= 启动 ========================= */

  function boot() {
    renderQuickTags();
    renderCatBar();
    render();
    refreshStats();
    renderUser();
    bindSearch();
    bindEvents();

    // 云服务接入后，由 __cloudBoot 触发一次完整刷新
    window.__cloudRefresh = function () {
      renderCatBar();
      render();
      refreshStats();
      renderUser();
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 暴露给云服务接入层使用
  window.__nav = { state: state, cloud: cloud, render: render, renderCatBar: renderCatBar,
                   refreshStats: refreshStats, renderUser: renderUser, toast: toast,
                   openDetail: openDetail, openModal: openModal, closeModal: closeModal,
                   openAuth: openAuth, openSubmit: openSubmit, openMySubmissions: openMySubmissions,
                   modalHead: modalHead, commentsHTML: commentsHTML, esc: esc, gradOf: gradOf,
                   initialOf: initialOf, timeAgo: timeAgo, logoHTML: logoHTML, TOOLS: TOOLS,
                   CATS: CATS, PRICES: PRICES, catMap: catMap };
})();
