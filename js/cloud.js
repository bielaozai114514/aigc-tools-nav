/* ===========================================================
   AIGC 工具导航 · 后端接入层（Supabase 版）
   -----------------------------------------------------------
   【当前状态】配置为空 → 本文件处于「休眠」状态，站点照常运行，
              账号功能仍提示「服务开通中」。

   【启用步骤】
     1) 在 Supabase 建好项目，执行 supabase-setup.sql 建表
     2) 把下面 CONFIG 里的两个值填上（都是公开值，可放前端）
     3) 刷新页面即生效，不需要改任何其它文件

   依赖：index.html 里已引入 supabase-js（CDN）与本文件
   =========================================================== */
(function () {
  'use strict';

  /* ===========================================================
     1. 配置区 —— 只改这里
     -----------------------------------------------------------
     Supabase 控制台 → Project Settings → API 可以找到这两个值。
     两个都是「公开密钥」，设计上就是给前端用的，不是密码。
     真正保护数据的是数据库的 RLS 行级安全策略（见 setup.sql）。
     =========================================================== */
  var CONFIG = {
    url:     'https://nmfxdzcbrkqsybdhjoef.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZnhkemNicmtxc3liZGhqb2VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2Mjg5MjgsImV4cCI6MjEwNzIwNDkyOH0.AzDI25ZrjdpC8AHD6_72QLHQSAiSHh1Cc_DCpTlkKsQ'
  };

  /* ===========================================================
     2. 前置检查
     =========================================================== */
  var nav = window.__nav;
  if (!nav) {
    console.error('[cloud] 找不到 window.__nav，请确认 js/app.js 在本文件之前加载。');
    return;
  }
  var cloud = nav.cloud;

  var configured = !!(CONFIG.url && CONFIG.anonKey);
  var sb = null;

  if (configured) {
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      console.error('[cloud] 找不到 supabase-js。请确认 index.html 已引入 CDN 脚本，且在本文件之前。');
      return;
    }
    sb = window.supabase.createClient(CONFIG.url, CONFIG.anonKey);
  }

  /* ===========================================================
     3. 内部工具
     =========================================================== */
  function ok(msg)  { nav.toast(msg, 'ok'); }
  function bad(msg) { nav.toast(msg, 'err'); }

  function refreshUI() {
    if (typeof window.__cloudRefresh === 'function') window.__cloudRefresh();
  }

  /** 把 Supabase 的用户对象转成前端要的结构 */
  function toUser(u) {
    if (!u) return null;
    var meta = u.user_metadata || {};
    return {
      id: u.id,
      email: u.email || '',
      nickname: meta.nickname || (u.email ? u.email.split('@')[0] : '用户')
    };
  }

  function setUser(u) {
    cloud.user = u || null;
    nav.renderUser();
  }

  /** 把后端错误翻译成人话 */
  function friendlyError(e) {
    var msg = (e && (e.message || e.error_description || e.msg)) || '';
    var code = (e && (e.code || e.status)) || '';
    if (/already registered|already been registered|User already exists/i.test(msg)) return '该邮箱已注册，请直接登录。';
    if (/Invalid login credentials/i.test(msg)) return '邮箱或密码不正确。';
    if (/Email not confirmed/i.test(msg)) return '邮箱还没确认，请先到邮箱里点确认链接。';
    if (/Password should be at least/i.test(msg)) return '密码太短，请至少 6 位。';
    if (/rate limit|too many|over_email_send_rate_limit/i.test(msg)) return '操作过于频繁，请等一会儿再试。';
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return '网络异常，连不上服务器，请检查网络后重试。';
    if (String(code) === '23505') return '已经收藏过了。';
    if (String(code) === '42501' || /row-level security/i.test(msg)) return '没有权限执行这个操作，请重新登录后再试。';
    if (/JWT expired|invalid claim/i.test(msg)) return '登录状态已过期，请重新登录。';
    return msg || '操作失败，请稍后再试。';
  }

  /* ===========================================================
     4. 数据读取
     =========================================================== */

  /** 各工具被收藏总数（用于卡片数字与「收藏最多」排序） */
  async function loadFavCounts() {
    var res = await sb.from('tool_fav_counts').select('tool_id, fav_count');
    if (res.error) throw res.error;
    var map = {};
    (res.data || []).forEach(function (r) { map[r.tool_id] = r.fav_count || 0; });
    cloud.favCounts = map;
  }

  /** 当前用户收藏了哪些工具 */
  async function loadMyFavorites() {
    if (!cloud.user) { cloud.myFavs = {}; return; }
    var res = await sb.from('favorites').select('tool_id').eq('user_id', cloud.user.id);
    if (res.error) throw res.error;
    var map = {};
    (res.data || []).forEach(function (r) { map[r.tool_id] = true; });
    cloud.myFavs = map;
  }

  /** 全部评论（一次性加载；评论量大后可改成按工具懒加载） */
  async function loadComments() {
    var res = await sb.from('comments')
      .select('id, user_id, nickname, tool_id, content, created_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (res.error) throw res.error;
    var map = {};
    (res.data || []).forEach(function (r) {
      if (!map[r.tool_id]) map[r.tool_id] = [];
      map[r.tool_id].push({
        id: r.id,
        userId: r.user_id,
        nickname: r.nickname || '用户',
        content: r.content,
        createdAt: new Date(r.created_at).getTime()
      });
    });
    cloud.comments = map;
  }

  /** 当前用户的投稿 */
  async function loadMySubmissions() {
    if (!cloud.user) { cloud.submissions = []; return; }
    var res = await sb.from('submissions')
      .select('name, url, cat, price, description, status')
      .eq('user_id', cloud.user.id)
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    cloud.submissions = (res.data || []).map(function (r) {
      return { name: r.name, url: r.url, cat: r.cat, price: r.price, desc: r.description, status: r.status };
    });
  }

  /** 登录后需要拉的个人数据 */
  async function loadUserData() {
    await Promise.all([loadMyFavorites(), loadMySubmissions()]);
  }

  /* ===========================================================
     5. 六个接入点
     =========================================================== */

  /* ---------- 5.1 注册 / 登录 ---------- */
  window.__cloudSubmitAuth = async function (mode, email, pass, fail, msgEl) {
    if (!configured) return fail('后端还没配置好，请先在 js/cloud.js 里填入 Supabase 地址与密钥。');

    try {
      if (mode === 'register') {
        var up = await sb.auth.signUp({
          email: email,
          password: pass,
          options: { data: { nickname: email.split('@')[0] } }
        });
        if (up.error) throw up.error;

        // 若项目开启了「邮箱确认」，此时还没有 session
        if (!up.data.session) {
          if (msgEl) {
            msgEl.innerHTML = '<div class="form-ok">注册成功！我们已向 <b>' +
              nav.esc(email) + '</b> 发送确认邮件，请点击邮件里的链接后再回来登录。</div>';
          }
          ok('注册成功，请查收确认邮件');
          return;
        }
        setUser(toUser(up.data.user));
        await loadUserData();
      } else {
        var inRes = await sb.auth.signInWithPassword({ email: email, password: pass });
        if (inRes.error) throw inRes.error;
        setUser(toUser(inRes.data.user));
        await loadUserData();
      }

      nav.closeModal();
      ok(mode === 'register' ? '注册成功，已自动登录' : '登录成功');
      refreshUI();
    } catch (e) {
      fail(friendlyError(e));
    }
  };

  /* ---------- 5.2 收藏 / 取消收藏 ---------- */
  window.__cloudToggleFav = async function (toolId) {
    if (!configured) { bad('后端还没配置好'); return; }
    if (!cloud.user) { bad('请先登录后再收藏'); nav.openAuth('login'); return; }

    var isFaved = !!cloud.myFavs[toolId];
    try {
      if (isFaved) {
        var del = await sb.from('favorites').delete()
          .eq('user_id', cloud.user.id).eq('tool_id', toolId);
        if (del.error) throw del.error;
        delete cloud.myFavs[toolId];
        cloud.favCounts[toolId] = Math.max(0, (cloud.favCounts[toolId] || 1) - 1);
        ok('已取消收藏');
      } else {
        var ins = await sb.from('favorites').insert({
          user_id: cloud.user.id, tool_id: toolId
        });
        if (ins.error) throw ins.error;
        cloud.myFavs[toolId] = true;
        cloud.favCounts[toolId] = (cloud.favCounts[toolId] || 0) + 1;
        ok('已收藏');
      }
      refreshUI();
    } catch (e) {
      bad(friendlyError(e));
    }
  };

  /* ---------- 5.3 发表评论 ---------- */
  window.__cloudPostComment = async function (toolId, text) {
    if (!configured) { bad('后端还没配置好'); return; }
    if (!cloud.user) { bad('请先登录后再评论'); nav.openAuth('login'); return; }

    try {
      var res = await sb.from('comments').insert({
        user_id: cloud.user.id,
        nickname: cloud.user.nickname,
        tool_id: toolId,
        content: text
      }).select('id, created_at').single();
      if (res.error) throw res.error;

      if (!cloud.comments[toolId]) cloud.comments[toolId] = [];
      cloud.comments[toolId].unshift({
        id: res.data.id,
        userId: cloud.user.id,
        nickname: cloud.user.nickname,
        content: text,
        createdAt: new Date(res.data.created_at).getTime()
      });
      ok('评论已发布');
      nav.openDetail(toolId);   // 重开弹层刷新评论区
    } catch (e) {
      bad(friendlyError(e));
    }
  };

  /* ---------- 5.4 提交工具投稿 ---------- */
  window.__cloudSubmitTool = async function (payload, fail, msgEl) {
    if (!configured) return fail('后端还没配置好。');
    if (!cloud.user) return fail('请先登录后再投稿。');

    try {
      var res = await sb.from('submissions').insert({
        user_id: cloud.user.id,
        name: payload.name,
        url: payload.url,
        cat: payload.cat,
        price: payload.price,
        description: payload.desc
        // status 由数据库默认值 pending 决定，前端不可写
      });
      if (res.error) throw res.error;

      await loadMySubmissions();
      nav.closeModal();
      ok('投稿已提交，审核通过后会出现在列表里');
    } catch (e) {
      fail(friendlyError(e));
    }
  };

  /* ---------- 5.5 退出登录 ---------- */
  window.__cloudLogout = async function () {
    if (sb) { try { await sb.auth.signOut(); } catch (e) { /* 忽略 */ } }
    setUser(null);
    cloud.myFavs = {};
    cloud.comments = {};
    cloud.submissions = [];
    try { await loadFavCounts(); } catch (e) { /* 忽略 */ }
    refreshUI();
    ok('已退出登录');
  };

  /* ---------- 5.6 删除自己的评论（前端已预留按钮） ---------- */
  window.__cloudDeleteComment = async function (commentId, toolId) {
    if (!configured || !cloud.user) return;
    try {
      var res = await sb.from('comments').delete()
        .eq('id', commentId).eq('user_id', cloud.user.id);
      if (res.error) throw res.error;
      if (cloud.comments[toolId]) {
        cloud.comments[toolId] = cloud.comments[toolId].filter(function (c) { return c.id !== commentId; });
      }
      ok('评论已删除');
      nav.openDetail(toolId);
    } catch (e) {
      bad(friendlyError(e));
    }
  };

  /* ===========================================================
     6. 启动
     -----------------------------------------------------------
     必须完成：恢复登录态 + 拉数据 + 把 cloud.ready 置为 true
     =========================================================== */
  async function boot() {
    if (!configured) {
      console.info('[cloud] 尚未配置 Supabase，账号功能保持「开通中」状态。' +
                   '请在 js/cloud.js 的 CONFIG 中填入 url 与 anonKey。');
      return;
    }

    try {
      // 6.1 恢复登录态
      var s = await sb.auth.getSession();
      if (s.data && s.data.session && s.data.session.user) {
        setUser(toUser(s.data.session.user));
      }

      // 6.2 公开数据：收藏总数
      await loadFavCounts();

      // 6.3 个人数据
      if (cloud.user) await loadUserData();

      // 6.4 评论
      await loadComments();

      // 6.5 打开总开关
      cloud.ready = true;
      refreshUI();

      // 6.6 监听登录态变化（token 过期、他处登出等）
      sb.auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          cloud.myFavs = {};
          cloud.submissions = [];
          refreshUI();
        }
      });
    } catch (e) {
      console.error('[cloud] 初始化失败：', e);
      bad('连接后端失败：' + friendlyError(e));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 调试入口
  window.__cloudLayer = {
    CONFIG: CONFIG,
    configured: configured,
    sb: sb,
    reload: boot,
    loadFavCounts: loadFavCounts,
    loadComments: loadComments
  };
})();
