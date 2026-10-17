# XMind import fixtures

The JSON/XML sources are small, original fixtures written for Brainstorming. Tests package their source
JSON/XML with `fflate`, producing ordinary XMind ZIP containers. The separate official binary sample is
licensed and attributed below.

The schema follows the official XMind projects:

- [Modern topic model](https://github.com/xmindltd/xmind-model/blob/master/src/models/topic.ts)
- [Modern sheet model](https://github.com/xmindltd/xmind-model/blob/master/src/models/sheet.ts)
- [Official SDK functional examples](https://github.com/xmindltd/xmind-sdk-js/blob/master/test/functional/index.test.ts)
- [Legacy XML SDK](https://github.com/xmindltd/xmind-sdk-python)

`modern.json` covers multiple sheets, Chinese and multiline titles, attached child
order, folding, explicit styles, floating topics, summary text, and unsupported
features. `legacy.xml` and `styles.xml` cover namespaced XML and referenced styles.
These fixtures establish a supported subset; they are not an XMind application
round-trip compatibility corpus.

`official-viewer-test-1.xmind` is an unmodified, 24,527-byte real document from
[XMind's official embed viewer sample](https://github.com/xmindltd/xmind-embed-viewer/blob/423627eb87f24c72aa68f20e961c9f12d4e7d021/public/test-1.xmind),
pinned to commit `423627eb87f24c72aa68f20e961c9f12d4e7d021`. It contains modern
JSON content and a legacy XML compatibility warning, so it also checks modern
format precedence. Copyright (c) 2022 XMind Ltd.; distributed under the MIT license
preserved verbatim in `LICENSE.official-viewer.txt`.

SHA-256: `cbd8e31db17492d082069760f5ec9aaa69f4d732803b39da223f6b7df661d072`.

`content-modern.json`、`content-legacy.xml`、`pixel image.png` 和 `data.bin` 是本仓库手工构造的内容样例，通过 `contentXmind()` 封装为实际内嵌资源 ZIP。它们覆盖中文纯文本备注、富文本备注转纯文本、按实际字节读取图片尺寸、URL 编码的资源路径、附件字节和重复引用；这些样例没有第三方授权依赖。
