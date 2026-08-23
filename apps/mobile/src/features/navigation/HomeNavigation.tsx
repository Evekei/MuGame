const navItems = [
  {
    title: "导入歌单",
    description: "粘贴多个分享链接，先确认歌单来源。",
    href: "#import"
  },
  {
    title: "正在播放/开始游戏",
    description: "进入随机播放队列，默认隐藏歌曲来源。",
    href: "#play"
  },
  {
    title: "统计",
    description: "查看共同歌曲、歌手重合和相似度结果。",
    href: "#stats"
  }
];

export function HomeNavigation() {
  return (
    <nav aria-label="核心入口" className="home-nav">
      {navItems.map((item) => (
        <a className="nav-card" href={item.href} key={item.href}>
          <span>{item.title}</span>
          <small>{item.description}</small>
        </a>
      ))}
    </nav>
  );
}
