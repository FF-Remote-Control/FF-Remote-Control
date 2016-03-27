"use strict";

const tabs = require("sdk/tabs");

const { CC, Cc, Ci } = require("chrome");

const ConverterInputStream = CC("@mozilla.org/intl/converter-input-stream;1",
                                "nsIConverterInputStream",
                                "init");
const ConverterOutputStream = CC("@mozilla.org/intl/converter-output-stream;1",
                                 "nsIConverterOutputStream",
                                 "init");
const threadManager = Cc["@mozilla.org/thread-manager;1"].getService();

const { TabControl } = require("./tabctrl");

const cookieManager2 = Cc["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager2);

const cookieManager = Cc["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager);


function GetCookies()
{
    var count,
        cookie,
        cookies;

    count = cookieManager2.enumerator;
    cookies = [];

    while (count.hasMoreElements())
    {
        cookie = count.getNext().QueryInterface(Ci.nsICookie2);
        // dump only cookie standard properties
        cookies.push( {
            host:       cookie.host,
            path:       cookie.path,
            name:       cookie.name,
            value:      cookie.value,
            isSecure:   cookie.isSecure,
            isHttpOnly: cookie.isHttpOnly,
            isSession:  cookie.isSession,
            expiry:     cookie.expiry
        } );
        // alternatively it is possible to dump the whole FF cookie object:
        // cookies.push(cookie);
    }

    return cookies;
}


function SetCookies( cookiesCmd )
{
    var cookies,
        len,
        n,
        i,
        c;

    len = 10; // "setcookies".length;

    cookies = JSON.parse( cookiesCmd.substr( len ).trim() );

    n = cookies.length;
    for( i = 0; i < n; i++ )
    {
        c = cookies[ i ];
        cookieManager2.add( c.host, c.path, c.name, c.value, c.isSecure, c.isHttpOnly, c.isSession, c.expiry );
    }
}


function ClearCookies()
{
    cookieManager.removeAll();
}


function RemoteControlClientHandler(transport, tabfn, status_callback) {
    this.tabfn = tabfn;
    this.curtab = tabfn();
    this.tabctrl = null;
    this.tab_destroy_callback = this.destroyTabCtrl.bind(this);
    this.pending_output = {}; // {id: response}
    this.reply_queue = []; // [id]
    this.next_id = 0;

    this.status_callback = status_callback;
    this.transport = transport;
    this.startIO();
}

RemoteControlClientHandler.prototype.startIO = function() {
    this.input = this.transport.openInputStream(0, 0, 0);
    this.utf8Input = new ConverterInputStream(this.input, "UTF-8", 0, 0xfffd);
    // enable .readLine()
    this.utf8Input.QueryInterface(Ci.nsIUnicharLineInputStream);

    this.output = this.transport.openOutputStream(Ci.nsITransport.OPEN_BLOCKING, 0, 0);
    this.utf8Output = new ConverterOutputStream(this.output, "UTF-8", 0, 0x0);

    this.threadManager = Cc["@mozilla.org/thread-manager;1"].getService();
    this.input.asyncWait(this, 0, 0, threadManager.currentThread);
}

RemoteControlClientHandler.prototype.stopIO = function(notify) {
    this.utf8Input.close();
    this.input.close();
    this.utf8Output.close();
    this.output.close();
    if(notify)
        this.status_callback(this, 'closed');
}

RemoteControlClientHandler.prototype.onInputStreamReady = function(istream) {
    try {
        // available throws an exception when the socket is closed
        this.input.available();
    } catch(e) {
        console.error("input no longer available: " + e);
        this.stopIO(true);
        return;
    }

    var cont = true;
    var command;
    while (cont) {
        try {
            var readLineResult = {};
            cont = this.utf8Input.readLine(readLineResult);
            command = readLineResult.value;
        } catch (e) {
            console.error("input read failed: " + e);
            break;
        }
        this.handleOneCommand(command);
    }
    this.input.asyncWait(this, 0, 0, threadManager.currentThread);
}

RemoteControlClientHandler.prototype.flushPendingOutput = function() {
    while(this.reply_queue.length > 0 && this.pending_output.hasOwnProperty(this.reply_queue[0])) {
        var reqid = this.reply_queue.shift();
        var reply = this.pending_output[reqid];
        try {
            this.utf8Output.writeString(JSON.stringify(reply) + "\n");
            this.utf8Output.flush();
        } catch(e) {
            console.error("failed to write output: " + e);
            this.stopIO(true);
        }
        delete this.pending_output[reqid];
    }
}

RemoteControlClientHandler.prototype.destroyTabCtrl = function() {
    if(this.tabctrl !== null) {
        this.curtab.removeListener("pageshow", this.tab_destroy_callback);
        this.curtab.removeListener("close", this.tab_destroy_callback);
        this.tabctrl.shutdown();
        this.tabctrl = null;
    }
}

RemoteControlClientHandler.prototype.handleCommandReply = function(reqid, reply) {
    this.pending_output[reqid] = reply;
    this.flushPendingOutput();
}

RemoteControlClientHandler.prototype.handleOneCommand = function(command) {
    if(command == "") {
        return;
    }

    var reqid = this.next_id++;
    this.reply_queue.push(reqid);

    if(command == "newtab") {
        tabs.open('about:blank');
        this.handleCommandReply(reqid, {result: 'OK'});
        return;
    }

    if(command == "reload") {
        command = "window.location.reload()";
    }

    if(command == "getcookies") {
        var cook = GetCookies();
        this.handleCommandReply(reqid, {result: cook});
        return;
    }

    if(command.substr( 0, 10 ) == "setcookies") {
        SetCookies( command );
        this.handleCommandReply(reqid, {result: 'OK'});
        return;
    }

    if(command == "clearcookies") {
        ClearCookies();
        this.handleCommandReply(reqid, {result: 'OK'});
        return;
    }


    var tab = this.tabfn();
    if(tab.id !== this.curtab.id) {
        this.destroyTabCtrl();
    }
    this.curtab = tab;

    if(this.tabctrl === null) {
        this.tabctrl = new TabControl(tab, this.tab_destroy_callback);
        tab.on("pageshow", this.tab_destroy_callback);
        tab.on("close", this.tab_destroy_callback);
    }

    this.tabctrl.submitRequest(reqid, command, this.handleCommandReply.bind(this, reqid), 10000);
}

RemoteControlClientHandler.prototype.shutdown = function() {
    this.destroyTabCtrl();
    this.stopIO(false);
}

exports.RemoteControlClientHandler = RemoteControlClientHandler;
