var self = require("sdk/self");

var { ToggleButton } = require("sdk/ui/button/toggle");
var tabs = require("sdk/tabs");

var { TabControl } = require("./tabctrl")

var remoteControl = null;

function RemoteControl(tab, port) {
    this.ctrl = new TabControl(tab);

    this.ctrl.submitRequest(0, "alert(1); 3", function(reply) {
        console.error(reply);
    }, 1000);
}

RemoteControl.prototype.shutdown = function() {
    this.ctrl.shutdown();
}

var mainButton = ToggleButton({
    id: "remote-control",
    label: "Remote Control",
    icon: {
        "16": "./icon-16.png",
        "32": "./icon-32.png",
        "64": "./icon-64.png"
    },
    onChange: onMainButtonChanged
});

function onMainButtonChanged(state) {
    if(state.checked) {
        remoteControl = new RemoteControl(tabs.activeTab, 32000);
    } else {
        remoteControl.shutdown();
        remoteControl = null;
    }
}

exports.onUnload = function(reason) {
    if(remoteControl !== null) {
        remoteControl.shutdown();
        remoteControl = null;
    }
}
