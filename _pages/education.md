---
layout: archive
title: "Education"
permalink: /education/
author_profile: true
---

{% for item in site.data.education %}
<article class="edu-card reveal">
  <div class="edu-card__mark" aria-hidden="true">{{ item.mark }}</div>
  <div class="edu-card__body">
    <h2 class="edu-card__school">{{ item.school }}</h2>
    <p class="edu-card__degree">{{ item.degree }}</p>
    <p class="edu-card__years">{{ item.years }}</p>
    {% if item.note %}
      <p class="edu-card__note">{{ item.note }}</p>
    {% endif %}
  </div>
</article>
{% endfor %}
