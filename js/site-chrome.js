/* ===========================================================
   站点公共外壳 —— 页脚 / 作者署名 / 联系方式 / 版权标记
   首页与「关于本站」共用，内容全部取自 site-config.js
   =========================================================== */
(function () {
  'use strict';

  var CFG = window.SITE_CONFIG;
  if (!CFG) return;

  /* 联系方式渠道定义：label + 图标 + 链接生成规则 */
  var ICONS = {
    mail:  '<path d="M3 6.5h18v11H3z" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="m3.6 7.2 8.4 6 8.4-6" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
    chat:  '<path d="M4 5.5h16v10H9.5L5 19v-3.5H4z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/>',
    link:  '<circle cx="12" cy="12" r="8.2" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M4 12h16M12 3.8c2.4 2.3 2.4 14.1 0 16.4M12 3.8c-2.4 2.3-2.4 14.1 0 16.4" stroke="currentColor" stroke-width="1.5" fill="none"/>'
  };

  var CHANNELS = [
    { key: 'email',           label: '邮箱',     icon: 'mail', href: function (v) { return 'mailto:' + v; } },
    { key: 'wechat',          label: '微信',     icon: 'chat', href: null },
    { key: 'officialAccount', label: '公众号',   icon: 'chat', href: null },
    { key: 'xiaohongshu',     label: '小红书',   icon: 'link', href: function (v) { return v; } },
    { key: 'bilibili',        label: 'B 站',     icon: 'link', href: function (v) { return v; } },
    { key: 'weibo',           label: '微博',     icon: 'link', href: function (v) { return v; } },
    { key: 'website',         label: '个人网站', icon: 'link', href: function (v) { return v; } }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function svg(name) {
    return '<svg class="ci" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.link) + '</svg>';
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /* ---------- 联系方式列表 ---------- */
  function contactsHTML() {
    var c = CFG.contacts || {};
    var items = [];

    CHANNELS.forEach(function (ch) {
      var v = (c[ch.key] || '').trim();
      if (!v) return;
      var isLink = !!ch.href;
      var inner = svg(ch.icon) + '<span class="ct-label">' + esc(ch.label) + '</span>' +
                  '<span class="ct-value">' + esc(v) + '</span>';
      items.push(isLink
        ? '<li><a class="contact-item" href="' + esc(ch.href(v)) + '"' +
          (ch.key === 'email' ? '' : ' target="_blank" rel="noopener noreferrer"') + '>' + inner + '</a></li>'
        : '<li><span class="contact-item" title="复制">' + inner + '</span></li>');
    });

    if (!items.length) {
      return '<li class="contact-empty">联系方式待填写</li>';
    }
    return items.join('');
  }

  /* ---------- 页脚 ---------- */
  function renderFooter() {
    setText('footTagline', CFG.tagline || '');
    setText('footCreator', CFG.creator || '');
    setText('footCreator2', CFG.creator || '');
    setText('footYear', new Date().getFullYear() < CFG.copyrightFrom ? CFG.copyrightFrom : new Date().getFullYear());
    setText('footVersion', CFG.version || '');
    setText('footUpdated', CFG.lastUpdated || '');
    setText('footLaunch', CFG.launchDate || '');
    setText('footLicense', CFG.license || '');
    setText('aboutCreator', CFG.creator || '');
    setText('aboutCreatorRole', CFG.creatorRole || '');
    setText('aboutCreatorBio', CFG.creatorBio || '');
    setText('aboutCreatorNote', CFG.creatorNote || '');
    setText('aboutBrand', CFG.brand || '');
    setText('aboutVersion', CFG.version || '');
    setText('aboutLaunch', CFG.launchDate || '');
    setText('aboutUpdated', CFG.lastUpdated || '');

    var list = document.getElementById('footContacts');
    if (list) list.innerHTML = contactsHTML();

    var aboutList = document.getElementById('aboutContacts');
    if (aboutList) aboutList.innerHTML = contactsHTML();

    // 工具数量（首页有数据时）
    var tools = window.AIGC_TOOLS || [];
    var cats = window.AIGC_CATEGORIES || [];
    var stat = document.getElementById('footStat');
    if (stat && tools.length) {
      stat.textContent = '共收录 ' + tools.length + ' 款工具 · ' + cats.length + ' 个分类';
    }

    // 文档标题后缀
    if (CFG.brand && document.title.indexOf(CFG.brand) === -1) {
      document.title = document.title + ' · ' + CFG.brand;
    }
  }

  /* ---------- 页面内的机器可读身份标记 ---------- */
  function renderFingerprint() {
    var root = document.documentElement;
    root.setAttribute('data-site-owner', CFG.creator || '');
    root.setAttribute('data-site-version', CFG.version || '');
    root.setAttribute('data-site-launch', CFG.launchDate || '');
    root.setAttribute('data-site-updated', CFG.lastUpdated || '');

    var m = document.createElement('meta');
    m.name = 'site-owner';
    m.content = (CFG.creator || '') + ' | ' + (CFG.brand || '') + ' | ' + (CFG.launchDate || '');
    document.head.appendChild(m);

    // 页面内不可见署名（用于识别镜像站与洗稿搬运）
    var mark = document.createElement('span');
    mark.id = 'site-owner-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
    mark.textContent = '本页由 ' + (CFG.creator || '') + ' 创建并维护 · ' + (CFG.brand || '') +
                       ' · 首次上线 ' + (CFG.launchDate || '') + ' · 更新 ' + (CFG.lastUpdated || '');
    document.body.appendChild(mark);
  }

  /* ---------- 控制台署名 ---------- */
  function consoleSign() {
    try {
      var style = 'font-size:15px;font-weight:700;color:#5b5bd6';
      var sub = 'color:#767c93;font-size:12px';
      console.log('%c' + (CFG.brand || '') + '  ' + (CFG.version || ''), style);
      console.log('%c© ' + (CFG.copyrightFrom || '') + '–' + new Date().getFullYear() + ' ' +
                  (CFG.creator || '') + ' · ' + (CFG.license || ''), sub);
      console.log('%c本站由 ' + (CFG.creator || '') + ' 独立整理与维护，首次上线 ' +
                  (CFG.launchDate || '') + '，最近更新 ' + (CFG.lastUpdated || '') + '。', sub);
      console.log('%c未经许可，禁止整站镜像与批量转载。', sub);
    } catch (e) { /* 忽略 */ }
  }

  function boot() {
    renderFooter();
    renderFingerprint();
    consoleSign();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
