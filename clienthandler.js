"use strict";

const { CC, Cc, Ci } = require("chrome");

const ConverterInputStream = CC("@mozilla.org/intl/converter-input-stream;1",
                                "nsIConverterInputStream",
                                "init");
const ConverterOutputStream = CC("@mozilla.org/intl/converter-output-stream;1",
                                 "nsIConverterOutputStream",
                                 "init");
const threadManager = Cc["@mozilla.org/thread-manager;1"].getService();

const { CommandRunner } = require("./cmdexec");

function RemoteControlClientHandler(transport, tabfn, status_callback) {
    this.tabfn = tabfn;
    this.pending_commands = {}; // {id: runner}
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

RemoteControlClientHandler.prototype.handleCommandReply = function(reqid, reply) {
    this.pending_output[reqid] = reply;
    this.flushPendingOutput();
    delete this.pending_commands[reqid];
}

RemoteControlClientHandler.prototype.handleOneCommand = function(command) {
    if(command == "") {
        return;
    }

    var reqid = this.next_id++;
    this.reply_queue.push(reqid);

    // TODO: adjust default timeout
    this.pending_commands[reqid] = new CommandRunner(
        this.tabfn(), command, this.handleCommandReply.bind(this, reqid), 10000);
}

RemoteControlClientHandler.prototype.shutdown = function() {
    for(var reqid in this.pending_commands) {
        this.pending_commands[reqid].abort("client shutdown");
    }
    this.stopIO(false);
}

exports.RemoteControlClientHandler = RemoteControlClientHandler;
