# MVP 验证记录

环境：Windows；Node 22+；Three.js 0.180.0；ws 8.21.3；桌面 Chromium 内嵌浏览器。

## 自动测试

- `node scripts/check.js`：所有 JS 模块语法检查。
- `node --test tests/core.test.js tests/network.test.js`：游戏规则及真实 WebSocket 集成用例通过，具体数量以当前测试输出为准。
- `node scripts/build.js`：生成离线依赖齐全的浏览器资源目录。
- 依赖审计：升级 ws 后复核，无已知漏洞；隔离目录 `npm ci` 安装恰好两个依赖成功。

## 实际运行

- HTTP `/health` 返回 200；首页和 Three 模块正常加载；浏览器错误日志为空。
- 以凶手进入单人演练；F10 进入中央展台。HUD 显示 STILL、SPOT 0；人物一直存在。
- 高太阳时刻，人物与展台产生短影。连续 F3 后，太阳降至约 23° 并横移；同一人物的影子明显变长、转向，墙和其他雕塑的阴影也同步变化。
- Tab 切到警探、F4 进入 SUNSET，之后 NIGHT / RUN；画面变暗，锥形手电照亮前方且周边仍黑暗。
- 夜间计时结束显示 SURVIVED / DETECTIVE WINS，能返回菜单。
- 浏览器双窗口：点击 HOST 生成房间码；第二窗口 JOIN 同一码，自动获得另一角色；两窗口分别显示 DETECTIVE / KILLER 并进入同一局 DAY。双 WebSocket 权威状态和双方重开另有真实连接集成测试。

## 实测边界

尚未进行两个真人在互联网延迟下的完整 7 分钟对局，也未完成长时间服务器负载测试。浏览器画面检查验证了真实阴影机制，不等于藏点与胜率已经平衡。公网部署需要支持长驻 Node + WebSocket 的运行环境。
