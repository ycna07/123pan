# NOTICE — 来源与许可说明

本文件说明本 SDK 的来源、许可方式与作者信息处理方式。

## 许可证

本项目（`123pan-api-sdk`）以 **GNU General Public License v3.0**（GPLv3）发布，完整条款见 [LICENSE](./LICENSE)。

你可以自由使用、修改与分发本项目；衍生作品需遵守 GPLv3 的条款：以相同许可证发布、保留版权与许可声明、并提供对应源码。

## 来源说明

本 SDK 是基于一个采用 **MIT 许可证** 的第三方 123Pan SDK 的修改版本（fork），在此基础之上持续维护、修复并扩展功能。

- 上游项目：<https://github.com/shijf/123pan-api-sdk>

为保护个人信息，原项目的**作者联系方式、个人主页与仓库地址**已从以下位置移除：

- 各 `package.json` 中的 `author` / `contributors` / `repository` / `bugs` / `homepage` 字段
- `README.md`、`docs/` 文档与站点配置中的相关链接

## 原始版权声明

按照 MIT 许可证“保留版权声明”的要求，原项目的版权声明与项目地址保留如下：

```
MIT License

Copyright (c) 2025 sharef

Project: https://github.com/shijf/123pan-api-sdk
```

本项目自身的发布与分发以 GPLv3 为准。

## 致谢

本 SDK 在梳理与验证部分接口时参考了开源项目 **p123client**（一个全面封装 123 网盘 web / app / open 接口的 Python 客户端），特此向原作者致谢。

- 作者：**ChenyangGao**
- 邮箱：<wosiwujm@gmail.com>
- 主页：<https://github.com/ChenyangGao>
- 项目：<https://github.com/ChenyangGao/p123client>
- 许可证：MIT

```
MIT License

Copyright (c) 2024 ChenyangGao <https://github.com/ChenyangGao>

Project: https://github.com/ChenyangGao/p123client
```

例如目录统计接口 `GET /api/file/detail`、分享列表接口 `GET /api/share/list` 等，均参考了该项目的接口整理。感谢原作者的开源与分享。

## 项目性质

- 本项目为**非官方实现**，与 123 云盘官方无任何关联
- 请遵守 123Pan 的服务条款及相关法律法规
- 使用本 SDK 产生的任何问题与 123 云盘官方无关，使用风险自负

## 相关文件

- [LICENSE](./LICENSE) — GPLv3 全文
- [README.md](./README.md) — 使用与 API 文档
- [docs/COPYRIGHT.md](./docs/COPYRIGHT.md) — 知识产权与免责声明
