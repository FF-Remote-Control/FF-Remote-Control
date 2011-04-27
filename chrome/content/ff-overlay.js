remotecontrol.onFirefoxLoad = function(event) {
    document.getElementById("contentAreaContextMenu")
            .addEventListener("popupshowing", function (e){
                      remotecontrol.showFirefoxContextMenu(e);
                  },
                  false
            );
};

remotecontrol.showFirefoxContextMenu = function(event) {
    // show or hide the menuitem based on what the context menu is on
    document.getElementById("context-remotecontrol").hidden =
        gContextMenu.onImage;
};

window.addEventListener("load", function () {
                            remotecontrol.onFirefoxLoad();
                        }, false);
