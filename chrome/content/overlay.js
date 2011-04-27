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
                var sin = Cc["@mozilla.org/scriptableinputstream;1"]
                            .createInstance(Ci.nsIScriptableInputStream);
                sin.init(input);
                var request = '';
                try {
                    while (sin.available()) {
                      // remotecontrol.log("reading...");
                      request = request + sin.read(512);
                      // remotecontrol.log("...read:" + request);
                    }
                } catch (e) {
                    if (e.name == "NS_BASE_STREAM_CLOSED") {
                        // When run like this:
                        //
                        // echo "command" | nc localhost $port
                        //
                        // the socket gets closed immediately. Don't fail
                        // because of that.
                        //
                        // remotecontrol.log("NS_BASE_STREAM_CLOSED - " +
                        //          " thats fine (almost expected)");
                        // remotecontrol.log(e);

                        // Avoid printing this twice. With the nc line above,
                        // it would otherwise get printed twice. Once for when
                        // sin.available detects that the stream has closed,
                        // and then onInputStreamReady gets called *again*
                        // because the stream was closed.
                        if (! this.printedCloseMessage) {
                            remotecontrol.log("Remote Control: Connection from " +
                                         this.host + ':' + this.port +
                                         ' was closed');
                            this.printedCloseMessage = 1;
                        }
                    } else {
                        remotecontrol.log("getting request failed: " + e );
                    }
                }
                if (request == "") {
                    // Ok, nothing to do here
                    return;
                }
                // Get rid of any newlines
                request = request.replace(/\n*$/, '').replace(/\r*$/, '');
                // Convert it to UTF-8
                var utf8Converter = Components.classes[
                        "@mozilla.org/intl/utf8converterservice;1"
                    ].getService(Components.interfaces.nsIUTF8ConverterService);
                // remotecontrol.log("request:"+request);
                try {
                    request = utf8Converter.convertStringToUTF8(
                        request, "UTF-8", false
                    );
                } catch (e) {
                    throw new Error("Converting to UTF-8 failed: " + e);
                }
                var evalResult;
                try {
                    if (request == "reload") {
                        evalResult = {
                            result: remotecontrol.evalScript(
                                "window.location.reload()"
                            )
                        };
                    } else {
                        evalResult = {
                            result: remotecontrol.evalScript(request)
                        }
                    }
                } catch (e) {
                    evalResult = {
                        error: e.toString()
                    }
                }
                remotecontrol.log(["Remote Control command:", {
                    'request': request,
                    'result' : evalResult
                }]);
                // remotecontrol.log(evalResult);
                var nativeJSON = Cc["@mozilla.org/dom/json;1"]
                    .createInstance(Ci.nsIJSON);
                // Why doesn't this work even for small values? Hmm...
                // nativeJSON.encodeToStream(this.output,
                //                           'UTF-8', false, evalResult);
                var outStr;
                try {
                    outStr = nativeJSON.encode(evalResult) + "\n";
                } catch(e) {
                    // Try again, but this time just the exception.
                    // (nativeJSON.encode has been known to throw exceptions -
                    // try giving the command document (that would return the
                    // document - which is huge!)
                    outStr = nativeJSON.encode({error:
                        "Error encoding JSON string for result/error. " +
                        "Was it too large?"
                    }) + "\n";
                }
                this.output.write(outStr, outStr.length);
                var tm = Cc["@mozilla.org/thread-manager;1"].getService();
                input.asyncWait(this,0,0,tm.mainThread);
            }
        }
        var listener = {
            onSocketAccepted: function(serverSocket, transport) {
                remotecontrol.log("Remote Control: Accepted connection from "+
                         transport.host+
                         ":"+
                         transport.port);
                var input = transport.openInputStream(0, 0, 0);
                var output = transport
                    .openOutputStream(Ci.nsITransport.OPEN_BLOCKING, 0, 0);
                var tm = Cc["@mozilla.org/thread-manager;1"].getService();
                var thisReader = object(reader);
                thisReader.input = input;
                thisReader.output = output;
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

    evalScript: function(script) {
        // Inspiration for this came from
        // http://forums.mozillazine.org/viewtopic.php?f=19&t=1517525
        // and from
        // http://kailaspatil.blogspot.com/2010/12/firefox-extension.html
        if (this.controlledWindow == null) {
            return null;
        }
        var sandbox = new Components.utils.Sandbox(
            this.controlledWindow.wrappedJSObject
        );

        // See http://kailaspatil.blogspot.com/2010/12/firefox-extension.html
        sandbox.__proto__ = this.controlledWindow.wrappedJSObject;
        sandbox.window = this.controlledWindow.wrappedJSObject;
        return Components.utils.evalInSandbox(script, sandbox);
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
            return { localhostOnly: localhostOnly, portNumber: portNumber };
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
