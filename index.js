var self = require('sdk/self');

var tabs = require('sdk/tabs');
var windows = require('sdk/windows').browserWindows;
var { ToggleButton } = require('sdk/ui/button/toggle');
var { prefs } = require('sdk/simple-prefs');

var { RemoteControlServer } = require('./ctrlserver');

var remoteControl = null;

var mainButton = ToggleButton({
    id: 'remote-control',
    label: 'Remote Control',
    icon: {
        '16': './icon-16.png',
        '32': './icon-32.png',
        '64': './icon-64.png'
    },
    onChange: onMainButtonChanged
});

function startSingleTabRemoteControl() {
    var tab = tabs.activeTab;

    remoteControl = new RemoteControlServer(function() { return tab; }, prefs['localhostOnly'], prefs['port']);

    /* show button as checked only on this tab */
    mainButton.state('window', null);
    mainButton.state(mainButton, {
        disabled: true,
        checked: false
    });
    mainButton.state(tab, {
        disabled: false,
        checked: true
    });

    tab.on('close', disableRemoteControl);
}

function startActiveTabRemoteControl() {
    remoteControl = new RemoteControlServer(function() { return tabs.activeTab; }, prefs['localhostOnly'], prefs['port']);

    /* show button as checked globally */
    mainButton.state(mainButton, {
        disabled: false,
        checked: true
    });
}

function tryEnableRemoteControl() {
    try {
        if(prefs['activeTab']) {
            startActiveTabRemoteControl();
        } else {
            startSingleTabRemoteControl();
        }
    } catch(e) {
        console.error('Failed to start remote control: ' + e);
        disableRemoteControl();
    }
}

function disableRemoteControl() {
    if(remoteControl !== null) {
        remoteControl.shutdown();
        remoteControl = null;
    }

    for(let window of windows) {
        mainButton.state(window, null);
    }

    for(let tab of tabs) {
        mainButton.state(tab, null);
    }

    mainButton.state(mainButton, {
        disabled: false,
        checked: false
    });
}

function onMainButtonChanged(state) {
    /* Use tab-level "checked" property instead of window-level property */
    mainButton.state('window', null);
    var checked = mainButton.state('tab').checked;
    if(checked) {
        disableRemoteControl();
        return;
    }

    if(remoteControl != null)
        disableRemoteControl();

    tryEnableRemoteControl();
}

exports.onUnload = function(reason) {
    disableRemoteControl();
}

if(prefs['autostart'])
    tryEnableRemoteControl();
