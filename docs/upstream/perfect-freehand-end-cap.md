# perfect_freehand 末端圆帽采样兼容性

## 复现与影响

Brainstorming 在 `be59539` 的几何迁移验收中发现：Rust `perfect_freehand 0.1.1` 与前端 `perfect-freehand 1.2.3` 的末端圆帽采样不同。对 `[[0,0,0.2],[40,30,0.8]]`、宽度 4、真实压力、完成笔画，Rust 输出 51 个轮廓点，前端输出 52 个；多出的点位于末端圆帽与右侧轮廓交界处。桌面和 CLI 的原生编码一致，但迁移后的轮廓不能通过与既有前端的逐点数值对比。

Rust 源码使用 `for i in 1..29`，排除第 29 个采样。前端使用 `t += 1 / 29` 且 `t < 1`；浮点累加使最后一次 `t` 仍略小于 1，会保留该点。其余已有样例的采样与压力计算保持一致。

上游来源：<https://github.com/sibaiper/perfect_freehand>，已发布版本 0.1.1，MIT。截至 2026-10-30，公开搜索未检索到对应问题，直接 tracker 访问未成功，发布前仍需核对是否重复。尚未向上游或本仓库发布 issue，以下内容可用于提交。

## 候选补丁与验证

候选补丁为 `config/patches/perfect-freehand-end-cap.patch`，只把末端圆帽的整数循环改为与前端相同的浮点累加循环。用户已于 2026-10-30 批准临时补丁，现通过根 Cargo override 接入 `vendor/perfect-freehand`，不修改压力采样或文档协议。

批准前已在 `/tmp` 中的独立临时 Cargo 工程验证补丁；批准后已更新正式 Cargo override 与锁文件，并在正式 workspace 重跑几何测试。三项测试全部通过：两个轮廓样例的点数变为 52，单点笔画保持 44；所有轮廓坐标经仿射变换后的误差均低于 `1e-9`，素描确定性和离线图标测试也通过。

已固定并保留上游 0.1.1 完整源码、MIT 许可证与发布归档 SHA-256，仅携带这处可逆补丁。上游发布包含此修复的版本，并通过既有笔迹数值、桌面/CLI 图片一致性与完整回归后，移除 vendored 副本及 Cargo override。

## 上游 issue 草稿

Title: Round end-cap sampling omits the final near-endpoint vertex compared with perfect-freehand

Version: perfect_freehand 0.1.1, perfect-freehand (JS) 1.2.3.

Reproduction: input `[[0,0,0.2],[40,30,0.8]]`, size 4, thinning/smoothing/streamline 0.5, simulate pressure false, last true. Compare `get_stroke` against JS `getStroke`.

Expected: preserve the JavaScript end-cap sampling sequence and its 52-vertex outline.

Actual: Rust returns 51 vertices. The integer range `1..29` omits a near-endpoint vertex emitted by JavaScript's accumulated `t += 1 / 29` loop. This changes the cap-to-side boundary and fails downstream coordinate parity.

Proposed fix: use the same bounded floating accumulator for this cap. Acceptance: two-point, single-point and varying-pressure fixtures preserve point counts and coordinates within `1e-9`; existing stroke options remain unchanged.

## 本仓库跟踪 issue 草稿

影响模块：Rust 几何、导图图片、保存缩略图、打印准备。当前前端画笔输入、文档压力采样和历史协议没有改变。

状态：临时补丁已获批准，等待上游兼容版本。上游 issue 与本仓库 issue 的 URL 待有权限发布后互相补充；不把准备好的草稿当成已经发布。回归入口：`crates/brainstorming-geometry/tests/geometry.rs` 与 CLI 集成导出测试。
