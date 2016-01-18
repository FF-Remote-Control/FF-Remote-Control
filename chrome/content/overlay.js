"use strict";
// This is global as it is accessed from outside this module
var remotecontrol;

// introduce a namespace to keep everything else private
(function () {

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

// From http://javascript.crockford.com/prototypal.html
function object(o) {
    function F() {}
    F.prototype = o;
    return new F();
}

remotecontrol = {
    controlledWindow: null,
    serverSocket: null,
    active: false,
    buttonID: 'remotecontrol-toolbar-button',

    onLoad: function() {
        // initialization code
        this.initialized = true;
        this.strings = document.getElementById("remotecontrol-strings");
        this.alignToolbarButton();

        var buttonInstalledPref =
            "extensions.remotecontrol.toolbarButtonInitiallyInstalled";
        var prefManager = Components.classes[
            "@mozilla.org/preferences-service;1"
        ].getService(Components.interfaces.nsIPrefBranch);
        if (! prefManager.getBoolPref(buttonInstalledPref)) {
            prefManager.setBoolPref(buttonInstalledPref, true)
            this.installToolbarButton();
        }

        this.maybeStartAutomatically();
    },

    log: function (msg) {
  
      if (typeof(Firebug) == "object" && typeof(Firebug.Console) == "object") {
        Firebug.Console.log(msg);
        return;
      }
  
      if (typeof(console) == "object") {
        if (typeof(msg) == "string") {
          msg = [msg];
        }

        for (var i = 0; i < msg.length; ++i) {
          console.log(msg[i]);
        }
        
        return;
      }
  
      throw "There's no way to log anything :( " + msg;
    },

    startControlSocket: function() {
        var prefs = this.getPreferences();

        var wm = Components.classes['@mozilla.org/appshell/window-mediator;1']
            .getService(Components.interfaces.nsIWindowMediator);
        remotecontrol.controlledWindow = wm.getMostRecentWindow(
                'navigator:browser'
            ).getBrowser().contentWindow;

        var reader = {
            onInputStreamReady : function(input) {
                // remotecontrol.log("onInputStreamReady");
                var command;

                // On EOF, we first get told about EOF when cont is false
                // below, and then we get called here in onInputStreamReady
                // again because of the EOF. Lets just return when that happens
                try {
                    // available() throws an exception when the socket has been
                    // closed
                    this.input.available();
                } catch (e) {
                    remotecontrol.log(
                        "Remote Control: Connection from " +
                         this.host + ':' + this.port +
                         ' was closed'
                    );
                    this.utf8Input.close();
                    this.input.close();
                    this.utf8Output.close();
                    this.output.close();
                    return;
                }

                var cont = true;
                while (cont) {
                    try {
                        var readLineResult = {};
                        cont = this.utf8Input.readLine(readLineResult);
                        command = readLineResult.value;
                    } catch (e) {
                        remotecontrol.log(['Remote Control Internal Error - '+
                                           'reading a command line caused an '+
                                           'exception:', e.message]);
                    }
                    this.handleOneCommand(command);
                }

                var tm = Cc["@mozilla.org/thread-manager;1"].getService();
                input.asyncWait(this,0,0,tm.mainThread);
            },
            handleOneCommand: function (command) {
                if (command == "") {
                    return;
                }
  
                var wm = Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator);
                var browser = wm.getMostRecentWindow('navigator:browser').getBrowser();

                if (prefs.activeTab) {
                    // if you want to use custom commands please disable this option
                    remotecontrol.controlledWindow = browser.contentWindow;
                }

                // for BC
                if (command == "reload") {
                    command = "//:reload";
                } else if (command == "newtab") {
                    command = "//:new_tab";
                }

                var reader = this;
                var sendResponse = function (result) {
                    var outStr;
                    try {
                        outStr = JSON.stringify(result) + "\n";
                        remotecontrol.log(["Remote Control result", result]);
                    } catch(e) {
                        // Try again, but this time just the exception.
                        // (JSON.stringify has been known to throw
                        // exceptions - to trigger this, try giving the command
                        // "window" (that would return the window - which is
                        // huge!)
                        outStr = JSON.stringify({error:
                          "Error encoding JSON string for result/error. " +
                          "Was it too large?"
                          }) + "\n";
                        remotecontrol.log(["Remote Control result error", result]);
                    }
                    reader.utf8Output.writeString(outStr);
                };

                var executeJsScript = function (js) {
                  // Get rid of any newlines
                  js = js.replace(/\n*$/, '').replace(/\r*$/, '');
                  remotecontrol.log(["Remote Control command", js]);
                  evalByEventPassing(remotecontrol.controlledWindow, js, sendResponse);
                }

                // find meta command
                // format is: //:command_name argument
                // for example echo "//::get_tab_list" | nc -q 1 localhost 32000
                var metaCommandRegexp = /^\/\/:([a-z_]+)(\s((?!\*\/).)+|)$/g;

                var metaCommandMatch;
                if ((metaCommandMatch = metaCommandRegexp.exec(command)) !== null) {

                    var metaCommand = metaCommandMatch[1];
                    var metaCommandArgument = metaCommandMatch[2].substr(1);

                    if (metaCommand == 'reload') {
                        executeJsScript("window.location.reload()");
                        return;
                    }

                    if (metaCommand == 'new_tab') {
                        browser.selectedTab = browser.addTab("about:blank");
                        sendResponse({result: "OK"});
                        return;
                    }

                    if (metaCommand == 'use_active_tab') {
                        remotecontrol.controlledWindow = browser.contentWindow;
                        sendResponse({result: "OK"});
                        return;
                    }


                    if (metaCommand == 'use_tab') {
                        var tabMatch = metaCommandArgument.match(new RegExp('^/(.*?)/([gimy]*)$'));
                        var regex = new RegExp(tabMatch[1], tabMatch[2]);

                        for (var i = 0; i < browser.tabs.length; ++i) {
                            var tab = browser.tabs[i];
                            var tabInfo = tab.label + ' ' + browser.getBrowserAtIndex(i).contentWindow.location.href;
                            if (tabInfo.match(regex) != null) {
                                remotecontrol.controlledWindow = browser.getBrowserForTab(tab).contentWindow;
                                sendResponse({result: "OK"});
                                return;
                            }
                        }

                        sendResponse({result: "ERROR", message: 'Can`t find tab by regex: ' + metaCommandArgument});
                        return;
                    }

                    if (metaCommand == 'get_tab_list') {
                        var tabs = [];
                        for (var i = 0; i < browser.tabs.length; ++i) {
                            var tab = browser.tabs[i];
                            tabs.push({label: tab.label, url: browser.getBrowserAtIndex(i).contentWindow.location.href});
                        }
                        sendResponse({result: "OK", tabs:tabs});
                        return;
                    }

                    sendResponse({result: "ERROR", message: 'Invalid custom command:' + metaCommand});
                    return;
                }
                
                executeJsScript(command);
            }
        }
        var listener = {
            onSocketAccepted: function(serverSocket, transport) {
                remotecontrol.log("Remote Control: Accepted connection from "+
                         transport.host+
                         ":"+
                         transport.port);
                var input = transport.openInputStream(0, 0, 0);
                var utf8Input = Components.classes[
                    "@mozilla.org/intl/converter-input-stream;1"
                ].createInstance(
                    Components.interfaces.nsIConverterInputStream
                );
                utf8Input.init(
                    input, "UTF-8", 0,
                    Components.interfaces.nsIConverterInputStream.
                        DEFAULT_REPLACEMENT_CHARACTER
                );
                // Ensure readLine() is available
                utf8Input.QueryInterface(
                    Components.interfaces.nsIUnicharLineInputStream
                );

                var output = transport
                    .openOutputStream(Ci.nsITransport.OPEN_BLOCKING, 0, 0);
                var utf8Output = Components.classes[
                    "@mozilla.org/intl/converter-output-stream;1"
                ].createInstance(
                    Components.interfaces.nsIConverterOutputStream
                );
                utf8Output.init(output, "UTF-8", 0, 0x0000);

                var tm = Cc["@mozilla.org/thread-manager;1"].getService();
                var thisReader = object(reader);

                thisReader.input = input;
                thisReader.utf8Input = utf8Input;

                thisReader.output = output;
                thisReader.utf8Output = utf8Output;

                thisReader.host = transport.host;
                thisReader.port = transport.port;
                input.asyncWait(thisReader,0,0,tm.mainThread);
            },
            onStopListening: function() {
                remotecontrol.log("Remote Control: Stop listening to socket");
            }
        }
        this.serverSocket = Cc["@mozilla.org/network/server-socket;1"].
                            createInstance(Ci.nsIServerSocket);
        try {
            this.serverSocket.init(prefs.portNumber, prefs.localhostOnly, -1);
        } catch (e) {
            // Don't leave this hanging around
            delete this.serverSocket;

            var button = document.getElementById(this.buttonID);
            if (button) {
                button.checked = false;
            }

            // Report error to user and log
            this.log('Could not initialize socket on port number ' +
                     prefs.portNumber);

            var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
                          .getService(Components.interfaces.nsIPromptService);

            // Localized version of:
            //
            // "Perhaps another window or another process\n"+
            // "is already running Remote Control.\n\n"+
            // errorString
            prompts.alert(
                null, "Remote Control",
                this.strings.getFormattedString(
                    "cantOpenControlSocket",
                    [ prefs.portNumber ]
                )
            );

            this.active = false;
            this.alignToolbarButton();
            return;
        }

        this.serverSocket.asyncListen(listener);

        remotecontrol.log("Remote Control: Opened socket on port " +
                     this.serverSocket.port +
                     ' (' +
                     ( prefs.localhostOnly ? "only localhost" : "all hosts" ) +
                     ' can connect)');
        this.active = true;
        this.alignToolbarButton();
    },

    stopControlSocket: function() {
        if (this.serverSocket != null) {
            this.serverSocket.close();
            this.serverSocket = null;
        }
        this.controlledWindow = null;
        this.active = false;
        this.alignToolbarButton();
    },

    toggleControlSocket: function() {
        if (this.active) {
            this.stopControlSocket();
        } else {
            this.startControlSocket();
        }
    },

    maybeStartAutomatically: function () {
        var hasCommandLineStartFlag = Components.classes["@morch.com/remotecontrol/command-line-handler;1"]
            .getService()
            .wrappedJSObject
            .startRemoteControlOnce();

        var startEnvironmentVariable = Components.classes["@mozilla.org/process/environment;1"]
          .getService(Components.interfaces.nsIEnvironment)
          .get('FIREFOX_START_REMOTE_CONTROL');

        if (hasCommandLineStartFlag || startEnvironmentVariable == 1) {
            this.startControlSocket();

            // Adjust button.checked state
            var button = document.getElementById(this.buttonID);
            if (button) {
                button.checked = "true";
            }
        }
    },

    onToolbarButtonCommand: function(e) {
        this.toggleControlSocket();
    },

    getPreferences: function () {
            var prefManager = Components.classes[
                "@mozilla.org/preferences-service;1"
            ].getService(Components.interfaces.nsIPrefBranch);
            var localhostOnly = prefManager.getBoolPref(
                "extensions.remotecontrol.localhostOnly"
            );
            var portNumber = prefManager.getIntPref(
                "extensions.remotecontrol.portNumber"
            );
            var activeTab = prefManager.getBoolPref(
                "extensions.remotecontrol.activeTab"
            );
            return {
                localhostOnly: localhostOnly,
                portNumber: portNumber,
                activeTab: activeTab
            };
    },

    alignToolbarButton: function() {
        var button = document.getElementById(this.buttonID);
        if (! button)
            return;
        var ttText;
        if (this.active) {
            // Add the 'active' class
            if (! button.className.match(/ active/)) {
                button.className += " active";
            }
            var prefs = this.getPreferences();

            ttText = this.strings.getFormattedString(
                "enabledToolbarTooltip",
                [ this.strings.getString(
                    prefs.localhostOnly ? 'localhost' : 'allhosts'
                  ),
                  prefs.portNumber
                ]
            );
            button.checked = "true";
        } else {
            button.className = button.className.replace(/ active/, '');
            ttText = this.strings.getString('disabledToolbarTooltip');
            button.checked = false;
        }
        button.setAttribute('tooltiptext', ttText);
    },

    // Modified from https://developer.mozilla.org/en-US/docs/Code_snippets/Toolbar?redirectlocale=en-US&redirectslug=Code_snippets%3AToolbar#Adding_button_by_default
    installToolbarButton: function () {
        if (!document.getElementById(this.buttonID)) {
            var toolbar = document.getElementById('nav-bar');
            toolbar.insertItem(this.buttonID, null);
            toolbar.setAttribute("currentset", toolbar.currentSet);
            document.persist(toolbar.id, "currentset");

            this.alignToolbarButton();
        }
    },
};

window.addEventListener(
    "load",
    function remoteControlOnload() {
        window.removeEventListener('load', remoteControlOnload);
        remotecontrol.onLoad();
    },
    false,
    false
);

})();
