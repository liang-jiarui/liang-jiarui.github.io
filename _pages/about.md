---
layout: archive
permalink: /
title: "Homepage"
hide_page_title: true
author_profile: true
redirect_from: 
  - /about/
  - /about.html
---

{% include lang.html %}

<section id="about" class="home-section" markdown="1">
<h2 class="page__title">{{ t.about }}</h2>

I am a Ph.D. student at [Tsinghua University](https://www.tsinghua.edu.cn/), supervised by [Prof. Bo Zheng](https://zheng-bo.com/).

Research interests:
- Earth system and atmospheric chemistry modelling
- Machine learning for atmospheric sciences

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
