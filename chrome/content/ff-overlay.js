econtrol.onFirefoxLoad = function(event) {
  document.getElementById("contentAreaContextMenu")
          .addEventListener("popupshowing", function (e){ econtrol.showFirefoxContextMenu(e); }, false);
};

econtrol.showFirefoxContextMenu = function(event) {
  // show or hide the menuitem based on what the context menu is on
  document.getElementById("context-econtrol").hidden = gContextMenu.onImage;
};

window.addEventListener("load", function () { econtrol.onFirefoxLoad(); }, false);
