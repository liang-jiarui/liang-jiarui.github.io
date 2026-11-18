# GEOS-Chem 服务器配置盘点（2026-11-18）

入口：[Simulation Gallery](index.html)。本次新增 **45 条来源配置记录**，另保留已登记的 FireEarth RRTMG 条目。来源副本分别登记，不把条目数视为独立科学实验数。

## 组织方式

沿用 `config/tasks/work/<项目>/<模型>/<版本>/<来源案例>/`；每例保存 `case.yaml`、原生控制文件、`source_manifest.json`。路径使用 `${input.*}`；机器数据根目录集中在 `machines/group_zheng_hpc/inputs.yaml`。完整来源路径、文件 SHA-256、日志摘要和 restart 依赖均可追溯。大体积 NetCDF、可执行文件和完整日志保留在服务器原处。

| 任务 | 配置数 |
| --- | ---: |
| `classic_history` | 5 |
| `fire_ndep_classic` | 14 |
| `gc_adjoint_history` | 5 |
| `gc_legacy` | 2 |
| `gchp_history` | 2 |
| `hemco_history` | 7 |
| `hub_classic` | 8 |
| `nr_rf_classic` | 2 |

## 验收口径

本次 13 条记录有正常积分结束且终点匹配配置的证据，17 条仅找到配置，10 条未确认完成，3 条有失败日志，2 条实际时段与配置不符。已有 FireEarth 的来源成功记录另计。HEMCO 的 `FINISHED` 不是 Classic 完成标记，未额外核验排放输出覆盖，因此保留为“未确认完成”。

成功判断读取最后一次运行，不接受 dry-run 或零时长的 END 标记；同时记录实际时段。配置是盘点时的快照，历史日志不能证明当前文件与运行当时完全相同。没有把历史成功等同于当前 repo 已完成复现。缺失 restart、命名与开关冲突、旧版或尚未接入的模型，会在复现预检中给出具体原因。

特别注意：

- `ALL_2010_no_soilnox` 当前 SoilNOx=on，实际配置时段为 2010-08 至 2011-01；不能按目录名理解为全年关闭 SoilNOx。
- `ALL_2016` 与 `ALL_2016_no_soilnox` 当前 SoilNOx 都是 off；保留两份来源，未自动建立敏感性对照。
- repo 中 14.1.1 / RRTMG 的月度归档目录实际只积分了 3 小时，标为时段不符；单独的 14.1.1 三小时 smoke 和 13.2.0 一天归档有完成证据。
- RRTMG 分支保留原运行时辐射开关，不能仅凭编译分支名认定辐射开启。

## 逐例清单

| 模型 / 来源项目 | 原目录 | 配置时段 | 日志判定 | 开关 |
| --- | --- | --- | --- | --- |
| geoschem / classic_history | [gc_merra2_fullchem](../../config/tasks/work/classic_history/geoschem/gc_13_2_0/gc_13_2_0__gc_merra2_fullchem/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 确认跑完 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / classic_history | [Ndep](../../config/tasks/work/classic_history/geoschem/gc_14_1_1/gc_14_1_1__Ndep/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 确认跑完 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / classic_history | [gc_2x25_47L_merra2_fullchem](../../config/tasks/work/classic_history/geoschem/gc_14_1_1/gc_14_1_1__gc_2x25_47L_merra2_fullchem/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 确认跑完 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / classic_history | [gc_2x25_47L_merra2_fullchem](../../config/tasks/work/classic_history/geoschem/gc_14_6_3/gc_14_6_3__gc_2x25_47L_merra2_fullchem/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 仅配置 | SoilNOx=off, GFED=on, FINN=off |
| geoschem_rrtmg / classic_history | [gc_merra2_fullchem](../../config/tasks/work/classic_history/geoschem_rrtmg/gc_13_2_0/rrtmg__gc_merra2_fullchem/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 确认跑完 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / fire_ndep_classic | [ALL_2016](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/old__ALL_2016/case.yaml) | 2016-01-01T00:00:00 → 2017-01-01T00:00:00 | 确认跑完 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / fire_ndep_classic | [ALL_2023](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/old__ALL_2023/case.yaml) | 2023-01-01T00:00:00 → 2024-01-01T00:00:00 | 确认跑完 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / fire_ndep_classic | [Nofire_2000](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/old__Nofire_2000/case.yaml) | 2001-04-01T00:00:00 → 2024-01-01T00:00:00 | 未确认完成 | SoilNOx=off, GFED=off, FINN=off |
| geoschem / fire_ndep_classic | [Nofire_2010](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/old__Nofire_2010/case.yaml) | 2010-01-01T00:00:00 → 2011-01-01T00:00:00 | 确认跑完 | SoilNOx=off, GFED=off, FINN=off |
| geoschem / fire_ndep_classic | [ALL_2000_no_hemco](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/old__test__ALL_2000_no_hemco/case.yaml) | 2002-08-01T00:00:00 → 2024-01-01T00:00:00 | 未确认完成 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / fire_ndep_classic | [ALL_2010_no_soilnox](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/old__test__ALL_2010_no_soilnox/case.yaml) | 2010-08-01T00:00:00 → 2011-01-01T00:00:00 | 确认跑完 | SoilNOx=on, GFED=on, FINN=off |
| geoschem / fire_ndep_classic | [ALL_2016_no_soilnox](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/old__test__ALL_2016_no_soilnox/case.yaml) | 2016-01-01T00:00:00 → 2017-01-01T00:00:00 | 确认跑完 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / fire_ndep_classic | [NAT](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/old__test__NAT/case.yaml) | 2019-10-01T00:00:00 → 2024-08-01T00:00:00 | 未确认完成 | SoilNOx=on, GFED=on, FINN=off |
| geoschem / fire_ndep_classic | [Nofire_2020_wrong_hemco](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/old__test__Nofire_2020_wrong_hemco/case.yaml) | 2021-04-01T00:00:00 → 2024-07-01T00:00:00 | 运行失败 | SoilNOx=off, GFED=off, FINN=off |
| geoschem / fire_ndep_classic | [test_zly_GFED](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/old__test__test_zly_GFED/case.yaml) | 2022-07-01T00:00:00 → 2022-08-01T00:00:00 | 运行失败 | SoilNOx=on, GFED=on, FINN=off |
| geoschem / fire_ndep_classic | [e1_atm_all_2000](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/run__14_1_1__Fire_Ndep_Csink__e1_atm_all_2000/case.yaml) | 2000-01-01T00:00:00 → 2001-01-01T00:00:00 | 未确认完成 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / fire_ndep_classic | [e1_atm_all](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/templates__Fire_Ndep_Csink__e1_atm_all/case.yaml) | 2010-01-01T00:00:00 → 2024-01-01T00:00:00 | 仅配置 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / fire_ndep_classic | [e1_atm_all_2000](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/templates__Fire_Ndep_Csink__e1_atm_all_2000/case.yaml) | 2010-01-01T00:00:00 → 2024-01-01T00:00:00 | 仅配置 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / fire_ndep_classic | [e2_atm_nofire](../../config/tasks/work/fire_ndep_classic/geoschem/gc_14_1_1/templates__Fire_Ndep_Csink__e2_atm_nofire/case.yaml) | 2010-01-01T00:00:00 → 2024-01-01T00:00:00 | 仅配置 | SoilNOx=off, GFED=off, FINN=off |
| geoschem_rrtmg / nr_rf_classic | [gc_merra2_fullchem_RRTMG](../../config/tasks/work/nr_rf_classic/geoschem_rrtmg/gc_13_2_0/paper_replicates__gc_merra2_fullchem_RRTMG/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 确认跑完 | SoilNOx=off, GFED=on, FINN=off |
| geoschem_rrtmg / nr_rf_classic | [gc_merra2_fullchem_RRTMG](../../config/tasks/work/nr_rf_classic/geoschem_rrtmg/gc_13_2_0/fireearth__gc_merra2_fullchem_RRTMG/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 确认跑完 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / gc_legacy | [merra2_2x25_tropchem](../../config/tasks/work/gc_legacy/geoschem/gc_12_3_0/global__base__merra2_2x25_tropchem/case.yaml) | 2019-12-01T00:00:00 → 2019-12-11T00:00:00 | 仅配置 | SoilNOx=on, GFED=on, FINN=off |
| geoschem / gc_legacy | [merra2_05x0625_tropchem_as](../../config/tasks/work/gc_legacy/geoschem/gc_12_3_0/nested__base__merra2_05x0625_tropchem_as/case.yaml) | 2020-12-01T00:00:00 → 2021-05-01T00:00:00 | 仅配置 | SoilNOx=on, GFED=on, FINN=off |
| gcadj / gc_adjoint_history | [ucx](../../config/tasks/work/gc_adjoint_history/gcadj/gcadj_v10_01b/v10-01b__ucx/case.yaml) | 2010-01-01T00:00:00 → 2010-01-01T06:00:00 | 运行失败 |  |
| gcadj / gc_adjoint_history | [geos5](../../config/tasks/work/gc_adjoint_history/gcadj/gcadj_v35/v8-02-01__geos5/case.yaml) | 2006-05-01T00:00:00 → 2006-05-16T00:00:00 | 仅配置 |  |
| gcadj / gc_adjoint_history | [geos5_tes_mls_0605](../../config/tasks/work/gc_adjoint_history/gcadj/gcadj_v35/v8-02-01__geos5_tes_mls_0605/case.yaml) | 2006-05-01T00:00:00 → 2006-05-16T00:00:00 | 仅配置 |  |
| gcadj / gc_adjoint_history | [geos4](../../config/tasks/work/gc_adjoint_history/gcadj/gcadj_v35n/v8-02-01__geos4/case.yaml) | 2004-05-01T00:00:00 → 2004-05-02T00:00:00 | 仅配置 |  |
| gcadj / gc_adjoint_history | [geos5](../../config/tasks/work/gc_adjoint_history/gcadj/gcadj_v35n/v8-02-01__geos5/case.yaml) | 2005-07-01T00:00:00 → 2005-07-01T06:00:00 | 仅配置 |  |
| hemco / hemco_history | [ALL_05_0625_MERRA2](../../config/tasks/work/hemco_history/hemco/hemco_3_6_2/ALL_05_0625_MERRA2/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 未确认完成 | SoilNOx=off, GFED=on, FINN=off |
| hemco / hemco_history | [ALL_HEMCO](../../config/tasks/work/hemco_history/hemco/hemco_3_6_2/ALL_HEMCO/case.yaml) | 2000-01-01T00:00:00 → 2024-01-01T00:00:00 | 未确认完成 | SoilNOx=off, GFED=on, FINN=off |
| hemco / hemco_history | [ALL_HEMCO_2000](../../config/tasks/work/hemco_history/hemco/hemco_3_6_2/ALL_HEMCO_2000/case.yaml) | 2001-01-01T00:00:00 → 2010-01-01T00:00:00 | 未确认完成 | SoilNOx=off, GFED=on, FINN=off |
| hemco / hemco_history | [ALL_HEMCO_2010](../../config/tasks/work/hemco_history/hemco/hemco_3_6_2/ALL_HEMCO_2010/case.yaml) | 2011-01-01T00:00:00 → 2016-01-01T00:00:00 | 未确认完成 | SoilNOx=off, GFED=on, FINN=off |
| hemco / hemco_history | [ALL_HEMCO_2016](../../config/tasks/work/hemco_history/hemco/hemco_3_6_2/ALL_HEMCO_2016/case.yaml) | 2017-01-01T00:00:00 → 2023-01-01T00:00:00 | 未确认完成 | SoilNOx=off, GFED=on, FINN=off |
| hemco / hemco_history | [ALL_HEMCO_2023](../../config/tasks/work/hemco_history/hemco/hemco_3_6_2/ALL_HEMCO_2023/case.yaml) | 2023-01-01T00:00:00 → 2024-01-01T00:00:00 | 未确认完成 | SoilNOx=off, GFED=on, FINN=off |
| hemco / hemco_history | [ALL_025_03125_GEOSFP](../../config/tasks/work/hemco_history/hemco/hemco_3_12_0/ALL_025_03125_GEOSFP/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 仅配置 | SoilNOx=off, GFED=on, FINN=off |
| gchp / gchp_history | [Ndep](../../config/tasks/work/gchp_history/gchp/gchp_14_1_1/run_14_1_1__Ndep/case.yaml) | 2019-07-01T00:00:00 → 0000100 000000 | 仅配置 | SoilNOx=off, GFED=on, FINN=off |
| gchp / gchp_history | [gchp_merra2_fullchem](../../config/tasks/work/gchp_history/gchp/gchp_14_1_1/run_14_1_1__gchp_merra2_fullchem/case.yaml) | 2019-07-01T00:00:00 → 00000100 000000 | 仅配置 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / hub_classic | [gc_merra2_fullchem](../../config/tasks/work/hub_classic/geoschem/gc_13_2_0/cases__gc_13_2_0__gc_merra2_fullchem/case.yaml) | 2019-07-01T00:00:00 → 2019-07-02T00:00:00 | 仅配置 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / hub_classic | [gc_2x25_47L_merra2_fullchem](../../config/tasks/work/hub_classic/geoschem/gc_14_1_1/cases__gc_14_1_1__gc_2x25_47L_merra2_fullchem/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 仅配置 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / hub_classic | [smoke](../../config/tasks/work/hub_classic/geoschem/gc_14_1_1/cases__gc_14_1_1__smoke/case.yaml) | 2019-07-01T00:00:00 → 2019-07-01T03:00:00 | 确认跑完 | SoilNOx=on, GFED=on, FINN=off |
| geoschem / hub_classic | [gc_2x25_47L_merra2_fullchem](../../config/tasks/work/hub_classic/geoschem/gc_14_6_3/cases__gc_14_6_3__gc_2x25_47L_merra2_fullchem/case.yaml) | 2019-07-01T00:00:00 → 2019-07-02T00:00:00 | 仅配置 | SoilNOx=off, GFED=on, FINN=off |
| geoschem_rrtmg / hub_classic | [gc_merra2_fullchem](../../config/tasks/work/hub_classic/geoschem_rrtmg/gc_13_2_0/cases__gc_13_2_0__gc_merra2_fullchem/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 仅配置 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / hub_classic | [20190701_000000-20190702_000000](../../config/tasks/work/hub_classic/geoschem/gc_13_2_0/archive__gc_13_2_0__gc_merra2_fullchem__20190701_000000-20190702_000000/case.yaml) | 2019-07-01T00:00:00 → 2019-07-02T00:00:00 | 确认跑完 | SoilNOx=off, GFED=on, FINN=off |
| geoschem / hub_classic | [20190701_000000-20190801_000000](../../config/tasks/work/hub_classic/geoschem/gc_14_1_1/archive__gc_14_1_1__gc_2x25_47L_merra2_fullchem__20190701_000000-20190801_000000/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 时段不符 | SoilNOx=off, GFED=on, FINN=off |
| geoschem_rrtmg / hub_classic | [20190701_000000-20190801_000000](../../config/tasks/work/hub_classic/geoschem_rrtmg/gc_13_2_0/archive__gc_13_2_0__gc_merra2_fullchem__20190701_000000-20190801_000000/case.yaml) | 2019-07-01T00:00:00 → 2019-08-01T00:00:00 | 时段不符 | SoilNOx=off, GFED=on, FINN=off |

## 补充扫描与复核

扫描范围、全部原始路径和登记去向见 [发现清单](geoschem-discovery.json)，本次新增条目见 [导入清单](geoschem-inventory.json)。CESM-GC、WRF-GC 耦合 case 保留在各自模型任务中；源码附带模板和文档镜像单独注明，不将其伪装成独立运行。

```bash
python -m src.simulation.import_geoschem            # 重新盘点，只读
python -m src.simulation.import_geoschem --write    # 写入；拒绝覆盖不同的快照
python -m src.simulations build
python -m src.simulations build --check
python -m src.simulations list --model geoschem
python -m src.simulations show fire_ndep_classic
```

本次未重新提交模拟作业。
