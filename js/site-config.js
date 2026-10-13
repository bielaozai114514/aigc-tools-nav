/* ===========================================================
   站点配置中心 —— 所有对外展示的身份信息都集中在这里
   -----------------------------------------------------------
   改这一处，全站（首页 / 关于页 / 页脚 / 结构化数据）同步生效。
   =========================================================== */

window.SITE_CONFIG = {

  /* ---------- 站点本身 ---------- */
  brand:     'AIGC 工具导航',
  brandEn:   'AI TOOLS DIRECTORY',
  tagline:   '一个由创作者独立整理、分类与持续维护的 AIGC 工具目录。',
  siteUrl:   'https://bielaozai114514.github.io/aigc-tools-nav',

  /* ---------- 创作者信息 ---------- */
  creator:      '潘信豪',
  creatorRole:  '本站站长 · 内容整理与维护',
  creatorBio:   '自媒体创作者，长期关注 AIGC 工具与内容生产流程。本站的工具条目、分类体系与页面均由我逐条整理、校对与维护。',
  creatorNote:  '本站不接付费收录，工具的排序与推荐不受商业影响。',

  /* ---------- 版本与时间 ---------- */
  version:      'v1.0.0',
  launchDate:   '2026-10-09',         // 首次上线日期
  lastUpdated:  '2026-10-09',         // 最近一次更新日期
  copyrightFrom: 2026,

  /* ---------- 授权方式 ---------- */
  license:      '保留所有权利（All Rights Reserved）',

  /* ---------- 联系方式 ----------
     留空的项不会在页面上显示。
     - email / wechat / officialAccount：填纯文本
     - xiaohongshu / bilibili / weibo / website：填完整链接
  ------------------------------------------------------------ */
  contacts: {
    email:           'bielaozai114514@gmail.com',
    wechat:          '',   // 例如 'pan_xinhao'
    officialAccount: '',   // 例如 'AIGC工具导航'
    xiaohongshu:     '',   // 例如 'https://www.xiaohongshu.com/user/profile/xxx'
    bilibili:        '',
    weibo:           '',
    website:         ''
  }
};
