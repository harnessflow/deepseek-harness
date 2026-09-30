---
description: "独立品牌发行的原生桌面输入，涵盖私有本地状态、内置扩展和手动升级。"
---

# 独立桌面发行

[English](standalone-desktop.md) | 中文

## 概述

发行方可以构建一个具有独立身份的桌面应用，无需同时安装官方应用。应用保留原生工作台、Desktop Host、运行时准备、签名检查和插件组合。显式产品输入选择私有状态、图形资源和必需本地组合包。手动升级发行没有官方更新 feed 或强制更新策略；平台安装仍需独立验证。

## 目录

- [发行输入](#distribution-inputs)
- [状态与恢复](#state-and-recovery)
- [打包边界](#packaging-boundaries)
- [验证](#verification)
- [开发备注](#dev-note)

-----

## 发行输入
<a id="distribution-inputs"></a>

部署启动器通过 `DSH_DESKTOP_PRODUCT` 提供经过校验的 JSON 身份，并通过 `DSH_DESKTOP_PRODUCT_ARTWORK` 提供图形资源的绝对目录。该记录选择产品与包名称、版本、应用 ID、产物前缀、OS 协议、home 目录、个人 agent（智能体）子目录、必需组合包和 `manual` 更新模式。未提供元数据时保留官方默认行为；无效的独立元数据直接报错，不回退到这些默认值。内部 `dsh-app` 协议和上游包名称保持不变。

开发环境另提供 `DSH_DESKTOP_PRODUCT_HOME` 和 `DSH_DESKTOP_PRODUCT_PACKAGES`，后者是显式的包名到绝对目录 JSON 对象。包名不能替换上游命名空间或逃离生成的项目。macOS 开发启动器记录产品身份、图形资源和运行时位置，供 OS 发起的冷启动使用。安装版应用读取其内嵌的 `dshDesktopProduct` manifest（元数据清单）记录，不读取继承的产品 JSON 变量。

壳层向自己的私有 Host 提供 `DSH_DESKTOP_PRODUCT_BUNDLE`。Host 在运行时元数据清单中校验该组合包，并以该清单作为原生安装依赖解析的起点，因此即使开发包是源码链接，也能发现显式外置客户端包。官方发行保留其 CLI 包解析起点。

对于外置开发组合，可丢弃的运行时元数据清单显式声明已映射到自身 `node_modules` 的每个包。原生 ESM 因此使用运行时的物理包链接，而不是依赖 pnpm 仅供 CommonJS 使用的 `NODE_PATH` 偶然发现源码包的 peer（同级依赖）。不会修改任何外置源码目录。

## 状态与恢复
<a id="state-and-recovery"></a>

壳层在打开 Electron 存储或启动 Desktop Host 前解析私有状态。安装版 home 使用 `<PROTOCOL>_HOME`，否则使用 OS 用户 home 下的产品 home 目录；仅开发环境使用的 home 覆盖不影响安装版。解析拒绝与官方默认及继承的自定义 home 重叠、开发/安装状态重叠、悬空链接和状态子目录重定向。Electron 浏览器数据、日志、profile 和个人 agent 资源均位于选定私有 home 下。

父进程保留继承的官方根目录变量，供重启检查使用。只有 Desktop Host 接收私有 `DSH_HOME` 和 `DSH_AGENTS_HOME` 值。原生凭据查找顺序、审批、沙箱行为和持久化格式保持不变。profile 恢复保留必需发行组合包；缺失安装版组合包时报重新安装错误，而不是静默降级应用。

## 打包边界
<a id="packaging-boundaries"></a>

原生装配器将 `DSH_DESKTOP_PRODUCT_TARBALLS` 加入显式本地包输入，并包含必需组合包的依赖闭包。发行依赖缺失时，不回退到从注册表下载私有包。Desktop Host 通过 `DSH_DESKTOP_BUNDLED_SKILL_DIR` 接收组合包安装位置中的 `resources/skills` 路径；组合包负责自身插件配置和 skill（技能）内容。

手动升级发行省略更新 feed 和强制更新策略，即使继承了官方策略变量也是如此。产品版本和引擎版本保持分离：产品版本标识安装包，原生运行时兼容性检查保留引擎版本。`DSH_DESKTOP_RELEASE_ENV_FILE` 选择发行方自己的签名配置；原生宿主、签名、公证和资源保护检查继续生效。该约定不授权发布包或产品资产。

## 验证
<a id="verification"></a>

[独立发行测试](../../apps/desktop/tests/product.spec.ts) 覆盖身份拒绝、私有状态、手动升级 builder 配置、恢复和包闭包。[开发测试](../../apps/desktop/tests/development-app.spec.ts) 执行字面值冷启动启动器 fixture（测试前置数据），[项目测试](../../apps/desktop/tests/development-project.spec.ts) 覆盖外部包校验。这些检查与原生桌面构建是本地证据，不是平台安装或真实模型审计证据。Windows 安装器执行和签名需要对应原生平台资源。

## 开发备注
<a id="dev-note"></a>

<details>
<summary>开发上下文</summary>

无。

</details>
