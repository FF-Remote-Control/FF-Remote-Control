// This is global as it is accessed from outside this module
var remotecontrol;

// introduce a namespace to keep everything else private
(function () {

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

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

    onLoad: function() {
        // initialization code
        this.initialized = true;
        this.strings = document.getElementById("remotecontrol-strings");
        this.alignToolbarButton();
    },

    log: function (msg) {
        // If console.log exists, run it!
        if (typeof(Firebug) == "object" &&
            typeof(Firebug.Console) == "object") {
            Firebug.Console.log(msg);
        };
    },

    startControlSocket: function(e) {
        var prefs = this.getPreferences();

        var wm = Components.classes['@mozilla.org/appshell/window-mediator;1']
            .getService(Components.interfaces.nsIWindowMediator);
        remotecontrol.controlledWindow = wm.getMostRecentWindow(
                'navigator:browser'
            ).getBrowser().contentWindow;

        var reader = {
            onInputStreamReady : function(input) {
                // remotecontrol.log("onInputStreamReady");

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
                if (prefs.activeTab) {
                    var wm = Components.classes['@mozilla.org/appshell/window-mediator;1']
                        .getService(Components.interfaces.nsIWindowMediator);
                    remotecontrol.controlledWindow = wm.getMostRecentWindow(
                            'navigator:browser'
                        ).getBrowser().contentWindow;
                }
                // Get rid of any newlines
                command = command.replace(/\n*$/, '').replace(/\r*$/, '');

                remotecontrol.log(["Remote Control command", command]);

                if (command == "reload") {
                    command = "window.location.reload()";
                } else if(command == "newtab") {
                    var wm = Components.classes['@mozilla.org/appshell/window-mediator;1']
                        .getService(Components.interfaces.nsIWindowMediator);
                    var mainWindow = wm.getMostRecentWindow("navigator:browser");
                    mainWindow.getBrowser().selectedTab = mainWindow.getBrowser().addTab("about:blank");


                    var nativeJSON = Cc["@mozilla.org/dom/json;1"]
                        .createInstance(Ci.nsIJSON);
                    var outStr = nativeJSON.encode({result: "OK"}) + "\n";
                    this.utf8Output.writeString(outStr);
                    return;
                }

                var reader = this;
                var callback = function (result) {
                    // remotecontrol.log("callback");
                    var nativeJSON = Cc["@mozilla.org/dom/json;1"]
                        .createInstance(Ci.nsIJSON);
                    // Why doesn't this work even for small values? Hmm...
                    // nativeJSON.encodeToStream(reader.utf8Output,
                    //                           'UTF-8', false, response);
                    var outStr;
                    try {
                        outStr = nativeJSON.encode(result) + "\n";
                        remotecontrol.log(["Remote Control result", result]);
                    } catch(e) {
                        // Try again, but this time just the exception.
                        // (nativeJSON.encode has been known to throw
                        // exceptions - to trigger this, try giving the command
                        // "window" (that would return the window - which is
                        // huge!)
                        outStr = nativeJSON.encode({error:
                            "Error encoding JSON string for result/error. " +
                            "Was it too large?"
                        }) + "\n";
                        remotecontrol.log(["Remote Control result error",
                                           result]);
                    }
                    reader.utf8Output.writeString(outStr);
                };

                evalByEventPassing( remotecontrol.controlledWindow,
                                    command,
                                    callback );
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
                // I'm not reall sure what this does, but if it is missing,
                // then readLine() doesn't work
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
            this.log('Could not initialize socket on port number ' +
                     prefs.portNumber);
            throw new Error("serverSocket.init failed: " + e);
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

    toggleControlSocket: function(e) {
        if (this.active) {
            this.stopControlSocket(e);
        } else {
            this.startControlSocket(e);
        }
    },

    onMenuItemCommand: function(e) {
        this.toggleControlSocket(e);
    },

    onToolbarButtonCommand: function(e) {
        this.toggleControlSocket(e);
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
            return { localhostOnly: localhostOnly, portNumber: portNumber, activeTab: activeTab };
    },

    alignToolbarButton: function() {
        var button = document.getElementById("remotecontrol-toolbar-button");
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
        } else {
            button.className = button.className.replace(/ active/, '');
            ttText = this.strings.getString('disabledToolbarTooltip');
        }
        button.setAttribute('tooltiptext', ttText);
    }
};

window.addEventListener("load", function () { remotecontrol.onLoad(); }, false);

})();
