(function () {
  var link = document.querySelector("#lang-toggle a");
  if (!link) return;

  link.addEventListener("click", function (event) {
    if (!window.location.hash) return;
    var href = link.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    window.location.href = href.split("#")[0] + window.location.hash;
  });
})();
