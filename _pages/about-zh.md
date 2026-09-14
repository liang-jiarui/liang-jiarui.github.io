---
layout: archive
permalink: /index_chinese.html
title: "主页"
lang: zh
hide_page_title: true
author_profile: true
description: "梁家睿，清华大学博士生"
redirect_from:
  - /zh/
  - /zh.html
---

{% include lang.html %}

<section id="about" class="home-section" markdown="1">
<h2 class="page__title">{{ t.about }}</h2>

我是[清华大学](https://www.tsinghua.edu.cn/)博士生，导师为[郑博副教授](https://zheng-bo.com/)。

研究方向：
- 地球系统模拟
- 机器学习

</section>

<section id="publications" class="home-section">
<h2 class="page__title">{{ t.publications }}</h2>
{% include publications-list.html %}
</section>

<section id="education" class="home-section">
<h2 class="page__title">{{ t.education }}</h2>
{% include education-list.html %}
</section>

<section id="cv" class="home-section">
<h2 class="page__title">{{ t.cv }}</h2>
{% include cv-block.html compact=true %}
</section>
