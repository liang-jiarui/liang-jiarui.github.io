# Simulation Gallery 与一条命令复现

打开 [Simulation Gallery](simulations/index.html)。页面是仓库内的静态文件。左侧依次为 **By model、Papers、Versions**，保持紧凑列表。Papers 按 **Applications、Models、Publications** 分组，每组按年份降序，论文旁以小字显示期刊简称与模型。CAMx-O3 BTH 位于 Publications，Xu 论文位于 Applications；尚未登记的年份或期刊不猜填。选择一篇论文会清除冲突筛选，选中全部关联模型并更新版本；多模型论文会同时高亮多个模型。模型列表始终保留全部已接入模型，未配置实验的论文也可以检索。Status 列位于实验名称旁，行底色区分 Completed（浅绿）、Archived（青绿）、Running（浅蓝）、Built（淡紫）、Queued（浅黄）和 Failed（浅红），并保留文字标签。这里表示本仓库案例的实际状态；Source run 独立显示来源运行记录。点开实验可查看配置文件、路径和命令，表头漏斗支持多选筛选。链接可带 `?task=` 直接选择论文。

## 新接入模型的 smoke

GC-adjoint、CHEEREIO、独立 CTSM 和 CESM3 已加入模型与版本栏；在“短测”分类浏览共 6 份方案（GC-adjoint 的 v36、v35、v35n 各一份）。方案直接读取 `config/model/<model>/experiments/<version>/smoke/case.yaml`，没有另一份 Gallery 模型清单。当前都是待准备方案，未计为积分或同化跑通。

| 模型 | 建议 smoke | 当前条件 |
| --- | --- | --- |
| CTSM 5.4.002 | `I1850Clm60BgcCropCrujra` / f19 / 1 天 | 最适合先做；已有原项目二进制。输入清单有 1 个作物播种历文件缺失，还需创建独立案例与核验机器环境 |
| GC-adjoint | 各版原生 GEOS-5 模板的正向 6 小时 | 需要逐版核验旧二进制/工具链、迁移旧路径并准备对应年份输入；正向通过后另做梯度检验 |
| CHEEREIO | 原生单元测试后，最小受支持集合的一个同化窗 | 当前缺 GCClassic 和若干核心 Python 模块，环境、观测与集合还需准备 |
| CESM3 beta06 | 补齐组件后选择受支持低分辨率配置，积分 1 天 | 缺 CIME、CAM 等组件；当前不能直接建案例 |

```bash
python -m src.simulations show @install_smoke/ctsm/ctsm5_4/smoke
python -m src.simulations check @install_smoke/ctsm/ctsm5_4/smoke
python -m src.simulations list --task install_smoke
```

`check` 动态检查源码记录、登记的组件和输入文件，缺项返回非零。方案的“检查”按钮复制该命令；尚未提供实际复现按钮。原 CTSM 编译记录、语法检查或来源目录存在均不计为积分成功。历史已完成短测继续按原证据展示。

## 配置放在哪里

GEOS-Chem 的服务器历史配置、来源日志判定和逐例说明见 [GEOS-Chem 盘点](simulations/GEOSCHEM.md)。Classic、RRTMG、GCHP、伴随模式与 HEMCO 分开登记，均可在 Gallery 中按模型、版本和来源项目浏览；来源状态区分确认跑完、失败、未确认完成、时段不符和仅配置。

```text
config/tasks/<models|applications|work|learning>/<task>/
  task.yaml                         # 标题与成员索引
  <model>/<version>/<experiment>/
    case.yaml                       # 具体模拟定义
    user_nl_* / HEMCO_*.rc           # 实际模型配置
    SourceMods/                     # 有需要时保存源码补丁
    source_manifest.json            # 仅导入案例的来源凭据，由导入工具生成
```

类别和现有任务见 [任务目录](TASKS.md)。Gallery 直接读取这些配置；不需要另外维护 gallery.yaml 或再填一次输入路径。可在 case.yaml 添加 `title`、`description` 改善展示。模型通用配置仍位于 `config/model/`；输入根目录仍位于 `machines/<hpc>/inputs.yaml` 或项目 `emh.yaml`。

新增模拟时，在任务目录创建 case.yaml、namelist 等文件，再在 task.yaml 的 members 中添加该 case 的相对 `config` 路径。独立模拟用 `role: simulation`，正式有火/无火对照继续用同组的 `all`/`nofire`。自己编写的新模拟不需要 source_manifest.json。若复制导入案例来修改科学参数，应作为新模拟保存并移除旧导入锁，不能把变更后的实验继续标成“原来源已验证”。

## 使用入口

```bash
python -m src.simulations build                 # 更新静态 Gallery
python -m src.simulations build --check         # 核对版本库中的静态 Gallery
python -m src.simulations list                  # 查看完整 ID
python -m src.simulations list --model e3sm
python -m src.simulations list --task fireearth_paper_replicates
python -m src.simulations show <id>              # 参数、来源、运行目录与命令
python -m src.simulations check <id>             # 重新检查本机依赖
python -m src.simulations reproduce <id> --dry-run
python -m src.simulations reproduce <id> --execute
```

ID 可以使用完整的 `@task/model/version/experiment`，或不重名的实验目录名。给出任务名时选中该任务的全部成员。只写 `reproduce <id>` 会显示命令；只有 `--execute` 才实际创建、同步配置、设置、编译并提交作业。`--dry-run` 不创建运行目录、不编译、不提交。

例如，复现 FireEarth 中已跑通的 E3SM ne30 有火实验：

```bash
python -m src.simulations reproduce paper_Xu2026_F20TR_ne30_RF_ALL_2023_CMIP7_20260930 --dry-run
python -m src.simulations reproduce paper_Xu2026_F20TR_ne30_RF_ALL_2023_CMIP7_20260930 --execute
```

网页按钮复制以上命令，需在项目终端执行。网页不会直接调用调度器。任务中所选成员全部检查通过后才会开始执行；复现拒绝覆盖已有目标案例或重复提交。继续已有模拟使用原有案例入口，并明确续跑设置。

## 已跑通案例汇总

[完整 compset 与 case 清单](simulations/completed-cases.md) 按模型、版本、compset 和网格汇总，逐 case 链接配置及成功凭据。扫描覆盖 FireEarth 的 CESM/E3SM、Fire_Ndep 的 cases 和 tools/cases、CESM_GC、Clow_2025_JAMES，以及 CESM-GC-troposphere 的历史案例。其他已登记 GEOS-Chem 案例中，只有明确判为 completed 且有正常结束证据的记录才并入成功汇总，详细盘点见 [GEOS-Chem 清单](simulations/GEOSCHEM.md)。Fire_Ndep_Csink 独立 GEOS-Chem 缺少正常结束证据，保留在 [扫描与排除报告](reviews/completed-simulations-import.json)。

新增快照放在 `config/tasks/work/<来源>_completed/`，在 Gallery 的“自己的试验”分类中可按来源选择；旧任务中的相同来源目录直接复用。相同 case 名称来自不同目录时，以来源路径生成稳定标识，避免互相覆盖。源码提交不同、续跑依赖、成功后修改配置和后续失败均保留说明。

更新来源清单并重新生成 Gallery：

```bash
python -m src.simulation.import_projects \
  ../phd/FireEarth ../phd/Fire_Ndep ../phd/CESM_GC \
  ../../paper_replicates/Clow_2025_JAMES \
  ../../paper_replicates/todo/other/CESM-GC-troposphere --apply
python -m src.simulations build
python -m src.simulations build --check
```

不加 `--apply` 只扫描；重复导入按来源路径去重。该命令只整理配置和凭据，不提交模型作业。

## 首批 FireEarth 导入记录

首批扫描 FireEarth 的 145 个 CIME CaseStatus，找到 91 个包含 `case.run success` 的案例：CESM 57、E3SM 34。另找到 1 个 GEOS-Chem 完整结束的 2019-07 模拟，共导入 92 份配置快照，分为 chapter4、chapter5、paper、paper_replicates、test、utils、geoschem 七个任务主题。54 个没有运行成功证据的 CIME 案例列入排除清单，不按跑通案例导入。完整映射见 [导入报告](reviews/fireearth-simulations-import.json)。

以实际运行目录中的 user_nl、HEMCO、SourceMods 和 CIME XML 为依据，而不是遇到同名 YAML 就任意选一份。原 YAML 候选路径保存在来源记录中；找不到原 YAML 的案例也可从运行目录恢复配置，并注明依据。原有 Xu2026 任务独立保留，因此页面的配置条目数会大于去重后的来源成功案例数。

导入目标案例名加 `fe_`，避免覆盖当前仓库已存在的冒烟/正式模拟。源码、cases、scratch 和 archive 使用当前仓库规范路径，HPC 资源使用本机配置。源目录不会被修改，模型源码、历史输出和大型 restart 不复制进配置库；初值和排放等数据以根目录映射引用。新增的 `input.fireearth` 表示来源项目中的派生输入集合，换 HPC 时需将实际所需数据放到相应位置并更新映射。

每份 source_manifest 保存来源成功记录、原始控制文件哈希、当前可迁移配置哈希、科学定义指纹、来源 XML 与初值依赖。修改科学配置会使原导入锁失效；模型 Python 直接提交入口也会检查这些条件。标题与说明不属于科学定义指纹，可以调整。CIME 的时钟与积分长度由 XML 锁定，Gallery 中补充的 period 展示信息不改变该运行锁。

## 怎样理解页面状态

“来源有运行成功记录”表示来源至少有一次模式积分成功，不保证其请求的完整科学时段均已完成，也不表示本仓库已复现。页面另列本仓库是否创建或有运行成功记录。

“预检通过”表示模型源码、环境文件、控制文件及已登记输入当前可访问，来源锁未发生漂移；不替代排放年份/物种、气象覆盖、原始数据版本及科学结论的独立核验。HEMCO 的条件清单和日期变量由模型原生机制展开，预检不会把未启用的库存当成必需文件。

待核验的条目仍保留在 Gallery，但禁用复现命令按钮，CLI 同样阻止实际执行。常见原因包括：控制文件在最近成功后被修改、来源最近一次尝试未完成或失败、缺少初值、续跑依赖未固定。CONTINUE_RUN 案例保留其续跑语义，不会悄悄重置成从初始年份运行；需要先核定 restart 和复现时段。

本次配置快照保留来源的 STOP_N/STOP_OPTION，RESUBMIT 置零，复现的是当前配置的单段运行；不自动重建来源中全部历史分段、spin-up 和所有后续情景。GC 条目保留源 input.geos 的辐射开关：虽然编译包含 RRTMG，不能将原先关闭的辐射过程称为已验证的 RRTMG 科学结果。

静态页面显示构建机器在标注 UTC 时间时的依赖预检和运行状态。变更配置或完成模拟后，运行 `python -m src.simulations build` 刷新快照。CI 使用 `build --check` 核对 HTML 与 JSON 一致，以及案例 ID 和配置摘要与仓库配置同步。执行模拟前，CLI 会重新预检。

模型源码版本与修改文件的核对见 [源码记录](reviews/fireearth-model-revisions.json)。三个模型的主仓库提交与来源相同；E3SM 的六个已修改科学配置/代码文件逐一匹配。MPAS-Ocean 的 SHTNS 目录存在差异，但本次 E3SM 案例的海洋组件为 DOCN/SOCN，未启用 MPAS-Ocean；这份记录不能作为未来启用 MPAS-Ocean 的复现依据。
