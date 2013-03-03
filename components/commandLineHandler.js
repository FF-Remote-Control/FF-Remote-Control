"use strict";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function commandLineHandler() {
    this.wrappedJSObject = this;
}

commandLineHandler.prototype =
{

    classDescription: "command line handler",
    contractID: "@morch.com/remotecontrol/command-line-handler;1",
    classID: Components.ID("9D538A60-834E-11E2-8D9D-6F406188709B"),
    QueryInterface: XPCOMUtils.generateQI([Ci.nsICommandLineHandler]),
    _xpcom_categories: [{
        category: "command-line-handler",
        entry: "m-remotecontrol-clh"
    }],

    handle: function(cmdLine) {
        try {
            this.remoteControlFlag =
                cmdLine.handleFlag("remote-control", false);
        } catch (error) {
            Cu.reportError("Command Line Handler failed: " + error);
        }
    },

    startRemoteControlOnce: function () {
        if (this.remoteControlFlag && ! this.remoteControlAlreadyStarted) {
            this.remoteControlAlreadyStarted = true;
            return true;
        }
        return false;
    },

    helpInfo :
        "  -remote-control      "+
        "Start the Remote Control Extension automatically\n"
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([commandLineHandler])
