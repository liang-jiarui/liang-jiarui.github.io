# Simulation Gallery

打开 [Gallery](index.html) 浏览全部实验。

[已跑通 compset 与 case 清单](completed-cases.md) 汇总 FireEarth、Fire_Ndep（含 tools/cases）、CESM_GC 和 Clow 的成功记录，逐项链接配置和来源凭据。

```bash
python -m src.simulations build
python -m src.simulations list
python -m src.simulations show <id>
python -m src.simulations check <id>
python -m src.simulations reproduce <id> --dry-run
python -m src.simulations reproduce <id> --execute
```

Gallery 自动从任务与 case 配置生成，无需维护第二份模拟列表。左侧依次为 By model、Papers、Versions。论文按 Applications、Models、Publications 分组，组内按年份降序；有文章页的论文在名称旁链到原文。Publications 收录 CAMx-O3 BTH，Xu 论文位于 Applications。选择论文会同步选中所有关联模型并更新版本。Status 列和行底色区分 Completed（浅绿）、Archived（青绿）、Running（浅蓝）、Built（淡紫）、Queued（浅黄）与 Failed（浅红）；Source run 独立保留来源记录，不代表本仓库完成。短测分类继续保留历史运行记录和待准备方案。点开实验可查看该目录下的配置文件和路径。复现命令先检查所有选中成员，再创建、同步、设置、编译与提交；网页只复制命令，不直接调用调度器。

GEOS-Chem 历史配置与逐例判定见 [服务器盘点](GEOSCHEM.md)。
