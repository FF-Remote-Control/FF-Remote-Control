"use strict";

var { setTimeout, clearTimeout } = require("sdk/timers");
var tabs = require("sdk/tabs");

function CommandRunner(tab, command, callback, timeout) {
    if(typeof(timeout) === 'undefined')
        timeout = 0;

    if(command == "newtab") {
        tabs.open('about:blank');
        callback({result: 'OK'});
        return;
    }

    if(command == "reload") {
        command = "window.location.reload()";
    }

    this.worker = tab.attach({
        contentScriptFile: "./contentScript.js"
    });

    this.worker.port.on('eval_result', this.receiveReply.bind(this));
    this.worker.on('detach', this.receiveReply.bind(this, {error: "page unloaded"}));
    this.worker.on('error', this.receiveError.bind(this));

    this.timer = null;
    if(timeout > 0) {
        this.timer = setTimeout(this.receiveReply.bind(this, {error: "request timed out"}), timeout);
    }

    this.worker.port.emit("eval", command);
    this.callback = callback;
}

CommandRunner.prototype.receiveReply = function(reply) {
    if(this.timer !== null) {
        clearTimeout(this.timer);
    }
    this.worker.destroy();
    this.callback(reply);
}

CommandRunner.prototype.receiveError = function(error) {
    this.receiveReply({error: "page worker error: " + JSON.stringify(error)});
}

CommandRunner.prototype.abort = function(reason) {
    this.receiveError(reason);
}

exports.CommandRunner = CommandRunner;
